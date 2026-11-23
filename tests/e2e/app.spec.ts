import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

let app: ElectronApplication;

test.beforeAll(async () => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Electron rejects some Node options, and the dev server URL would bypass the build.
    if (value !== undefined && key !== 'NODE_OPTIONS' && key !== 'ELECTRON_RENDERER_URL')
      env[key] = value;
  }
  // Chromium refuses to start its sandbox as root (CI containers only).
  const args = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
  app = await electron.launch({ args: ['.', ...args], env });
});

test.afterAll(async () => {
  await app?.close();
});

test('opens the main window', async () => {
  const page = await app.firstWindow();
  await expect(page).toHaveTitle('Claude Codex');
  await expect(page.getByText('Scaffold ready')).toBeVisible();
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
