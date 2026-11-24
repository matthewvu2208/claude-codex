import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

/**
 * Canonical form of a path as the OS resolves it: macOS temp folders are /private/var/... in
 * git's output but /var/... in the app, and on Windows git may print a different drive-letter
 * case or a long name where Node has an 8.3 short name. realpathSync.native resolves all of it.
 */
const canonical = (p: string) => realpathSync.native(p);

/** Same folder, compared with the platform's own rules (case-insensitive on Windows). */
const samePath = (a: string, b: string) => relative(canonical(a), canonical(b)) === '';

/** True when `child` is `parent` or inside it, on path boundaries (/a/repo-2 is not in /a/repo). */
function isInside(child: string, parent: string): boolean {
  const rel = relative(canonical(parent), canonical(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** `git worktree list --porcelain` as entries of path and branch. */
function worktrees(cwd: string): { path: string; branch: string | null }[] {
  return git(cwd, 'worktree', 'list', '--porcelain')
    .split(/\r?\n\r?\n/)
    .map((block) => ({
      path: /^worktree (.+)$/m.exec(block)?.[1]?.trim() ?? '',
      branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null,
    }))
    .filter((w) => w.path);
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
  }).toString();

let app: ElectronApplication;
let page: Page;
let project: string;
let userData: string;

test.beforeAll(async () => {
  const seeded = seedDesignData({ empty: true });
  userData = seeded.userData;
  project = join(seeded.root, 'repo');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  writeFileSync(join(project, 'notes.txt'), 'status: draft\n');
  writeFileSync(join(project, 'src', 'pricing.ts'), 'export const x = 1;\n');
  git(project, 'init', '-q', '-b', 'main');
  // Test-only: no line-ending conversion, so file contents compare the same on Windows.
  git(project, 'config', 'core.autocrlf', 'false');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'init');

  app = await launchApp({
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(seeded.root, 'fake'),
  });
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
});

test.afterAll(async () => {
  await app?.close();
});

const newSession = async (agent: 'Claude' | 'Codex', prompt: string) => {
  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByRole('radio', { name: new RegExp(agent) }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill(prompt);
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('heading', { name: prompt })).toBeVisible();
  const log = page.getByRole('log', { name: 'Conversation' });
  // Wait for the first turn to finish; a message sent during a turn steers it instead.
  await expect(log.getByText('Hello from the test agent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  return log;
};

const ask = async (text: string) => {
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill(text);
  await message.press('Enter');
};

test('Welcome menus show the agent models, efforts and permissions', async () => {
  await page.getByRole('radio', { name: /Claude/ }).click();
  await page.getByRole('button', { name: 'Model: Opus 5.5' }).click();
  const menu = page.getByRole('menu', { name: 'Model: Opus 5.5' });
  await expect(menu.getByRole('menuitemradio', { name: /Opus 5.5/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(menu.getByRole('menuitemradio', { name: /Sonnet 5.5/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Keyboard: open the effort menu and pick with arrows and Enter.
  await page.getByRole('button', { name: 'Effort: Low' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Effort: Medium' })).toBeVisible();

  // Full access asks first; cancel keeps Ask.
  await page.getByRole('button', { name: 'Permission mode: Ask' }).click();
  await page.getByRole('menuitemradio', { name: /Full access/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Full access' });
  await expect(dialog).toContainText('Give Claude full access?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Permission mode: Ask' })).toBeVisible();

  await page.getByRole('radio', { name: /Codex/ }).click();
  // Codex starts on the model it marks as default.
  await expect(page.getByRole('button', { name: 'Model: GPT Test' })).toBeVisible();
  await page.getByRole('radio', { name: /Claude/ }).click();
  // The last choice per agent is remembered.
  await expect(page.getByRole('button', { name: 'Effort: Medium' })).toBeVisible();
});

test('@ inserts a file path and / inserts a command', async () => {
  await page.getByRole('button', { name: 'New session' }).click();
  const task = page.getByRole('textbox', { name: 'Task' });
  await task.fill('');
  await task.pressSequentially('Look at @pric');
  const files = page.getByRole('listbox', { name: 'Files' });
  await expect(files.getByRole('option', { name: 'src/pricing.ts' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(task).toHaveValue('Look at @src/pricing.ts ');
  await expect(files).toHaveCount(0);

  await task.fill('');
  await task.pressSequentially('/rev');
  const commands = page.getByRole('listbox', { name: 'Commands' });
  await expect(commands.getByRole('option', { name: /\/review/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(task).toHaveValue('/review ');
  await task.fill('');
});

test('changing the model and effort mid-session works on Claude', async () => {
  const log = await newSession('Claude', 'Claude model check');
  await page.getByRole('button', { name: /^Model: / }).click();
  await page.getByRole('menuitemradio', { name: /Sonnet 5.5/ }).click();
  await expect(page.getByRole('button', { name: 'Model: Sonnet 5.5' })).toBeVisible();
  await ask('which model are you?');
  await expect(log.getByText('I am running on sonnet')).toBeVisible();

  // Effort applies after a restart that resumes the same conversation.
  await page.getByRole('button', { name: /^Effort: / }).click();
  await page.getByRole('menuitemradio', { name: 'High' }).click();
  await ask('which model now?');
  await expect(log.getByText('I am running on sonnet at high effort.')).toBeVisible();
  await ask('do you remember?');
  await expect(log.getByText(/I remember 3 earlier messages/)).toBeVisible();
});

test('changing the model and effort mid-session works on Codex', async () => {
  const log = await newSession('Codex', 'Codex model check');
  await ask('which model are you?');
  await expect(log.getByText('I am running on gpt-test at medium effort.')).toBeVisible();
  await page.getByRole('button', { name: 'Model: GPT Test' }).click();
  await page.getByRole('menuitemradio', { name: /GPT Test Mini/ }).click();
  await expect(page.getByRole('button', { name: 'Model: GPT Test Mini' })).toBeVisible();
  await page.getByRole('button', { name: /^Effort: / }).click();
  await page.getByRole('menuitemradio', { name: 'High' }).click();
  await ask('which model now?');
  await expect(log.getByText('I am running on gpt-test-mini at high effort.')).toBeVisible();
});

test('a worktree session leaves the main checkout untouched', async () => {
  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByRole('radio', { name: /Claude/ }).click();
  await page.getByRole('checkbox', { name: 'Worktree' }).check();
  await page.getByRole('textbox', { name: 'Task' }).fill('Edit the notes in a worktree');
  await page.getByRole('button', { name: 'Start session' }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  const approval = log.getByRole('region', { name: /Approval: Edit notes\.txt/ });
  await approval.getByRole('button', { name: 'Allow once' }).click();
  await expect(log.getByText('in notes.txt')).toBeVisible();

  const appData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const list = worktrees(project);
  const described = JSON.stringify(list);
  // The main checkout is the entry on main, and it is the project folder.
  const main = list.filter((w) => w.branch === 'main');
  expect(main, described).toHaveLength(1);
  expect(samePath(main[0]!.path, project), described).toBe(true);
  // Exactly one other worktree: the session's, on its agent/ branch.
  const children = list.filter((w) => w.branch?.startsWith('agent/'));
  expect(children, described).toHaveLength(1);
  expect(list, described).toHaveLength(2);
  const wtPath = children[0]!.path;
  expect(samePath(wtPath, project)).toBe(false);
  // It lives under <appData>/worktrees/<repo>/, and not inside the main checkout.
  expect(isInside(wtPath, join(appData, 'worktrees', 'repo')), `${wtPath} vs ${appData}`).toBe(
    true,
  );
  expect(isInside(wtPath, project)).toBe(false);
  expect(readFileSync(join(wtPath, 'notes.txt'), 'utf8')).toBe('status: final\n');
  // The main checkout is untouched: same file, clean status, still on main.
  expect(readFileSync(join(project, 'notes.txt'), 'utf8')).toBe('status: draft\n');
  expect(git(project, 'status', '--porcelain')).toBe('');
  expect(git(project, 'branch', '--show-current').trim()).toBe('main');
  expect(git(wtPath, 'branch', '--show-current').trim()).toMatch(
    /^agent\/edit-the-notes-in-a-worktree-/,
  );

  // Remove the worktree from the session menu (native menu and confirm are stubbed).
  await app.evaluate(({ Menu, dialog }) => {
    const original = Menu.buildFromTemplate;
    Menu.buildFromTemplate = ((template: Electron.MenuItemConstructorOptions[]) => {
      Menu.buildFromTemplate = original;
      return {
        popup: (opts: { callback?: () => void }) => {
          (
            template.find((i) => i.label === 'Remove worktree')?.click as (() => void) | undefined
          )?.();
          opts.callback?.();
        },
      };
    }) as unknown as typeof Menu.buildFromTemplate;
    dialog.showMessageBox = (async () => ({
      response: 0,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  });
  // The worktree has an uncommitted change, so git refuses; commit it first like a user would.
  git(wtPath, 'commit', '-qam', 'agent change');
  await page.getByRole('button', { name: 'Session menu' }).click();
  await expect.poll(() => existsSync(wtPath)).toBe(false);
  expect(git(project, 'branch', '--list', 'agent/*')).toContain(
    'agent/edit-the-notes-in-a-worktree-',
  );
});
