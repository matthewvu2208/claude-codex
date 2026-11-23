import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await launchApp();
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
});

test.afterAll(async () => {
  await app?.close();
});

test('window content is 1440×900', async () => {
  expect(await page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([1440, 900]);
});

test('sidebar shows folders, nested sub-sessions and the agent dot', async () => {
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar.getByRole('treeitem', { name: 'session_test', exact: true })).toBeVisible();
  const parent = sidebar.getByRole('treeitem', {
    name: /Review thư mục với Codex \(Claude, with a Codex sub-session\)/,
  });
  await expect(parent).toBeVisible();
  await expect(parent.locator('[data-agent="claude"][data-dot="codex"]')).toHaveCount(1);
  await expect(
    sidebar.getByRole('treeitem', { name: /Folder analysis \(Claude\)$/ }).locator('[data-dot]'),
  ).toHaveCount(0);

  await sidebar.getByRole('button', { name: 'Collapse Review thư mục với Codex' }).click();
  await expect(
    sidebar.getByRole('treeitem', { name: /Codex review of session_test folder/ }),
  ).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Expand Review thư mục với Codex' }).click();
  await expect(
    sidebar.getByRole('treeitem', { name: /Codex review of session_test folder/ }),
  ).toBeVisible();
});

test('search filters sessions by title', async () => {
  const search = page.getByRole('searchbox', { name: 'Search sessions' });
  await search.fill('poem');
  const rows = page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('treeitem', { name: /\((Claude|Codex)/ });
  await expect(rows).toHaveCount(1);
  await search.fill('');
  await expect(rows).toHaveCount(8);
});

test('agent cards act as a radio group', async () => {
  const claude = page.getByRole('radio', { name: /Claude/ });
  const codex = page.getByRole('radio', { name: /Codex/ });
  await expect(claude).toBeChecked();
  await claude.focus();
  await page.keyboard.press('ArrowRight');
  await expect(codex).toBeChecked();
  await expect(codex).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(claude).toBeChecked();
});

test('every control is reachable by keyboard', async () => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return '';
      return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
    });
    if (seen.includes(name) && name === seen[0]) break;
    seen.push(name);
  }
  for (const expected of [
    'Toggle sidebar',
    'Back',
    'New session',
    'Search sessions',
    'house design',
    'Collapse Review thư mục với Codex',
    'Toggle theme',
    'Settings',
    'Workspace folder: session_test',
    'Task',
    'Add context',
    'Model: Opus 5.5',
    'Effort: Low',
    'Permission mode: Ask',
    'Start session',
  ]) {
    expect(
      seen.some((n) => n.startsWith(expected)),
      `${expected} reachable by Tab`,
    ).toBe(true);
  }
  expect(seen.some((n) => n.startsWith('Commands'))).toBe(true);
  expect(
    seen.filter((n) => n.startsWith('Claude') || n.startsWith('Codex')).length,
  ).toBeGreaterThan(0);
});

test('welcome screen screenshot', async () => {
  const testInfo = test.info();
  await page.mouse.move(0, 899);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const shot = await page.screenshot();
  await testInfo.attach('welcome', { body: shot, contentType: 'image/png' });
  // Fonts differ per OS, so the pixel baseline is kept for Linux only (see tests/e2e/__screenshots__).
  if (process.platform === 'linux') {
    expect(shot).toMatchSnapshot('welcome-1440x900.png', { maxDiffPixelRatio: 0.01 });
  }
});
