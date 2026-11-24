import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;
let userData: string;
let root: string;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test.beforeAll(async () => {
  ({ userData, root } = seedDesignData({ empty: true }));
  app = await launchApp({
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake-agent'),
  });
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
});

test.afterAll(async () => {
  await app?.close();
});

const ROLES_NEEDING_NAMES =
  /^\s*- (button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|menuitem|option|slider|spinbutton|treeitem|dialog|tabpanel)( \[[^\]]*\])*:?$/;

/** Controls without an accessible name, from Playwright's ARIA snapshot. */
async function unnamed(scope: Locator): Promise<string[]> {
  const snapshot = await scope.ariaSnapshot();
  return snapshot.split('\n').filter((line) => ROLES_NEEDING_NAMES.test(line));
}

test('Commands opens with the shortcut and the button, filters, and runs a command', async () => {
  await page.keyboard.press(`${mod}+k`);
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox', { name: 'Search commands' })).toBeFocused();
  expect(await unnamed(palette)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('commands.png') });
  await page.keyboard.type('shortcuts');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('tab', { name: 'Shortcuts', selected: true })).toBeVisible();
  await expect(settings.getByRole('rowheader', { name: 'Ask about selected text' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  await page.getByRole('button', { name: /^Commands/ }).click();
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('Settings: tabs by keyboard, sub-session limit, worktree folder and text size apply', async () => {
  await page.keyboard.press(`${mod}+,`);
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByRole('tab', { name: 'General', selected: true })).toBeVisible();
  expect(await unnamed(settings)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('settings-general.png') });

  // Arrow keys move between tabs.
  await settings.getByRole('tab', { name: 'General' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(settings.getByRole('tab', { name: 'Accounts', selected: true })).toBeFocused();
  await expect(settings.getByRole('region', { name: 'Claude account' })).toBeVisible();
  expect(await unnamed(settings)).toEqual([]);
  await page.keyboard.press('ArrowDown');
  await expect(settings.getByRole('tab', { name: 'General', selected: true })).toBeFocused();

  // Sub-session limit is what the orchestrator reads.
  await settings.getByRole('combobox', { name: 'Sub-sessions running at once' }).selectOption('2');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          globalThis as unknown as {
            api: { settings: { get: () => Promise<{ subsessionLimit?: number }> } };
          }
        ).api.settings.get(),
      ),
    )
    .toMatchObject({ subsessionLimit: 2 });

  // Worktree folder: the system folder dialog, then back to the default.
  const chosen = join(root, 'my-worktrees');
  mkdirSync(chosen, { recursive: true });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, chosen);
  await settings.getByRole('button', { name: 'Choose…' }).click();
  await expect(settings.getByText(chosen)).toBeVisible();
  await settings.getByRole('button', { name: 'Use default' }).click();
  await expect(settings.getByText(join(userData, 'worktrees'))).toBeVisible();

  // Text size zooms the whole window.
  await settings.getByRole('combobox', { name: 'Text size' }).selectOption('large');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor(),
      ),
    )
    .toBeCloseTo(1.1);
  await settings.getByRole('combobox', { name: 'Text size' }).selectOption('default');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor(),
      ),
    )
    .toBeCloseTo(1);

  // Default agent follows the Welcome screen.
  await settings.getByRole('radio', { name: 'Codex' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Codex/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Claude/ }).click();
});

test('every screen has named controls and the log file holds no conversation', async () => {
  expect(await unnamed(page.locator('body'))).toEqual([]);

  const project = join(root, 'a11y repo');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('A private prompt about the README');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  expect(await unnamed(page.locator('body'))).toEqual([]);

  const tools = page.getByRole('complementary', { name: 'Tools' });
  for (const name of ['Outline', 'Files', 'Git', 'Terminal', 'Browser']) {
    await tools.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    expect(await unnamed(page.locator('body')), `${name} panel`).toEqual([]);
  }
  await tools.getByRole('button', { name: 'Browser' }).click();

  // ⌘N / Ctrl N goes back to a new session.
  await page.keyboard.press(`${mod}+n`);
  await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();

  const logFile = join(userData, 'logs', 'main.log');
  expect(existsSync(logFile)).toBe(true);
  const text = readFileSync(logFile, 'utf8');
  expect(text).toContain('INFO App start');
  expect(text).not.toContain('A private prompt');
});
