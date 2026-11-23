import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp } from './launch';

let app: ElectronApplication;

test.beforeAll(async () => {
  app = await launchApp();
});

test.afterAll(async () => {
  await app?.close();
});

test('opens the main window', async () => {
  const page = await app.firstWindow();
  await expect(page).toHaveTitle('Claude Codex');
  await expect(page.getByRole('heading', { name: 'What should we build?' })).toBeVisible();
});

test('renderer is isolated from Node', async () => {
  const page = await app.firstWindow();
  const probe = await page.evaluate(() => {
    const g = globalThis as { api?: unknown; require?: unknown; process?: unknown };
    return {
      api: typeof g.api,
      frozen: Object.isFrozen(g.api),
      require: typeof g.require,
      process: typeof g.process,
    };
  });
  expect(probe).toEqual({
    api: 'object',
    frozen: true,
    require: 'undefined',
    process: 'undefined',
  });
});

test('applies a strict CSP', async () => {
  const page = await app.firstWindow();
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self';");
  expect(csp).toContain("object-src 'none'");
});

test('blocks navigation to remote content', async () => {
  const page = await app.firstWindow();
  const before = page.url();
  await page.evaluate(() => {
    (globalThis as unknown as { location: { href: string } }).location.href =
      'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
});

test('main rejects invalid IPC payloads', async () => {
  const page = await app.firstWindow();
  const error = await page.evaluate(async () => {
    const api = (
      globalThis as unknown as { api: { sessions: { create: (x: unknown) => Promise<unknown> } } }
    ).api;
    try {
      await api.sessions.create({ agent: 'not-an-agent' });
      return 'accepted';
    } catch (e) {
      return String(e);
    }
  });
  expect(error).toContain('Invalid sessions:create payload');
});
