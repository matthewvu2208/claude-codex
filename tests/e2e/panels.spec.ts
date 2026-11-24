import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd }).toString();

let app: ElectronApplication;
let page: Page;
let project: string;
let server: Server;
let serverUrl: string;

test.beforeAll(async () => {
  const seeded = seedDesignData({ empty: true });
  project = join(seeded.root, 'panels-repo');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Panels demo\n\nHello from the readme.\n');
  writeFileSync(join(project, 'src', 'app.ts'), 'export const answer = 42;\n');
  writeFileSync(join(project, '.gitignore'), 'ignored.log\n');
  writeFileSync(join(project, 'ignored.log'), 'noise\n');
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'config', 'user.name', 'Test');
  git(project, 'config', 'user.email', 'test@example.com');
  git(project, 'config', 'core.autocrlf', 'false');
  git(project, 'add', '-A');
  git(project, 'commit', '-qm', 'init');

  server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Preview works</title><h1>Local dev server</h1>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  app = await launchApp({
    CLAUDE_CODEX_USER_DATA: seeded.userData,
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
  await page.getByRole('radio', { name: /Claude/ }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Please list the problems');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByText('round() drops negative zero', { exact: false })).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  server?.close();
});

const tools = () => page.getByRole('complementary', { name: 'Tools' });
const openPanel = async (name: string) => {
  const button = tools().getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  return page.getByRole('region', { name, exact: true });
};

test('Outline lists turns and clicking scrolls the thread', async () => {
  const pane = await openPanel('Outline');
  const nav = pane.getByRole('navigation', { name: 'Outline' });
  await expect(nav.getByRole('button', { name: 'Please list the problems' })).toBeVisible();
  await nav.getByRole('button', { name: 'Please list the problems' }).click();
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText('Please list the problems'),
  ).toBeInViewport();
});

test('Files shows the session folder, respects .gitignore and previews a file', async () => {
  const pane = await openPanel('Files');
  const tree = pane.getByRole('tree', { name: 'Files' });
  await expect(tree.getByRole('treeitem', { name: 'README.md' })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'ignored.log' })).toHaveCount(0);
  await tree.getByRole('treeitem', { name: 'src' }).click();
  await tree.getByRole('treeitem', { name: 'app.ts' }).click();
  const preview = pane.getByRole('region', { name: 'File preview' });
  await expect(preview).toContainText('export const answer = 42;');
  await expect(preview.locator('.shiki')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('files-panel.png') });
  await pane.getByRole('button', { name: 'Back to files' }).click();
  await expect(tree).toBeVisible();
});

test('Git shows status and diffs, stages and commits', async () => {
  writeFileSync(join(project, 'README.md'), '# Panels demo\n\nChanged by the test.\n');
  const pane = await openPanel('Git');
  await expect(pane.getByTestId('git-branch')).toHaveText('main');
  const changes = pane.getByRole('region', { name: 'Changes' });
  await pane.getByRole('button', { name: 'Refresh status' }).click();
  await changes
    .getByRole('button', { name: /README\.md/ })
    .first()
    .click();
  const diff = pane.getByRole('region', { name: 'Diff' });
  await expect(diff).toContainText('-Hello from the readme.');
  await expect(diff).toContainText('+Changed by the test.');
  await pane.getByRole('button', { name: 'Back to changes' }).click();

  await changes.getByRole('button', { name: 'Stage README.md' }).click();
  const staged = pane.getByRole('region', { name: 'Staged changes' });
  await expect(staged.getByRole('button', { name: 'Unstage README.md' })).toBeVisible();
  await pane
    .getByRole('textbox', { name: 'Commit message' })
    .fill('Update the readme from the panel');
  await pane.getByRole('button', { name: 'Commit' }).click();
  await expect(staged).toHaveCount(0);
  expect(git(project, 'log', '-1', '--format=%s').trim()).toBe('Update the readme from the panel');
  expect(git(project, 'status', '--porcelain')).toBe('');
});

test('Terminal runs a shell in the session folder; closed panel shows the new-output dot', async () => {
  const pane = await openPanel('Terminal');
  const term = pane.locator('[data-terminal-id]');
  await expect(term.locator('.xterm')).toBeVisible();
  await term.click();
  await page.keyboard.type('echo hello-from-term');
  await page.keyboard.press('Enter');
  await expect(term.locator('.xterm-rows')).toContainText('hello-from-term', { timeout: 15_000 });
  // The shell starts in the session folder.
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(term.locator('.xterm-rows')).toContainText('panels-repo', { timeout: 15_000 });

  // Output that arrives while the panel is closed lights the rail dot.
  const id = await term.getAttribute('data-terminal-id');
  await tools()
    .getByRole('button', { name: /^Terminal/ })
    .click();
  await page.evaluate(
    (id) =>
      (
        globalThis as unknown as { api: { pty: { write: (x: unknown) => Promise<unknown> } } }
      ).api.pty.write({ id, data: 'echo later\r' }),
    id,
  );
  await expect(page.getByTestId('terminal-dot')).toBeVisible();
  await tools()
    .getByRole('button', { name: /^Terminal, new output/ })
    .click();
  await expect(page.getByTestId('terminal-dot')).toHaveCount(0);
  await expect(page.locator('[data-terminal-id] .xterm-rows')).toContainText('later');
});

test('Browser previews a local page', async () => {
  const pane = await openPanel('Browser');
  await pane.getByRole('textbox', { name: 'Address' }).fill(serverUrl);
  await pane.getByRole('textbox', { name: 'Address' }).press('Enter');
  await expect
    .poll(() =>
      app.evaluate(({ webContents }, url) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL() === url);
        return wc ? wc.getTitle() : null;
      }, serverUrl),
    )
    .toBe('Preview works');
  // The page sits over the panel's area, not over the conversation.
  const area = await pane.getByTestId('browser-area').boundingBox();
  const viewBounds = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const view = win.contentView.children.find((c) => 'webContents' in c) as
      { getBounds: () => Electron.Rectangle; getVisible: () => boolean } | undefined;
    return view ? { ...view.getBounds(), visible: view.getVisible() } : null;
  });
  expect(viewBounds?.visible).toBe(true);
  expect(Math.abs((viewBounds?.x ?? 0) - Math.round(area!.x))).toBeLessThanOrEqual(1);
  expect(Math.abs((viewBounds?.width ?? 0) - Math.round(area!.width))).toBeLessThanOrEqual(1);

  // Only web addresses are accepted.
  await pane.getByRole('textbox', { name: 'Address' }).fill('file:///etc/passwd');
  await pane.getByRole('textbox', { name: 'Address' }).press('Enter');
  await expect(pane.getByRole('alert')).toContainText('Enter a web address');

  // Closing the panel hides the page.
  await tools().getByRole('button', { name: 'Browser' }).click();
  const hidden = await app.evaluate(({ BrowserWindow }) => {
    const view = BrowserWindow.getAllWindows()[0]!.contentView.children.find(
      (c) => 'webContents' in c,
    ) as { getVisible: () => boolean } | undefined;
    return view?.getVisible();
  });
  expect(hidden).toBe(false);
});
