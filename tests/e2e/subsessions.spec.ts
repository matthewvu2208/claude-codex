import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'session_test');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  app = await launchApp({
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake'),
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

const start = async (agent: 'Claude' | 'Codex', prompt: string) => {
  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByRole('radio', { name: new RegExp(agent) }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill(prompt);
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('heading', { name: prompt })).toBeVisible();
  return page.getByRole('log', { name: 'Conversation' });
};

test('a Claude parent starts a read-only Codex review, gets the report and continues', async () => {
  const log = await start('Claude', 'Please review with Codex');
  const card = log.getByRole('region', {
    name: 'Sub-session: Codex review of session_test folder',
  });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sub-session · Codex · Read-only');

  // The child sits under its parent in the sidebar; the parent shows the Codex dot.
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(
    sidebar.getByRole('treeitem', { name: /^Codex review of session_test folder \(Codex/ }),
  ).toBeVisible();
  const parentRow = sidebar.getByRole('treeitem', {
    name: /^Please review with Codex \(Claude, with a Codex sub-session/,
  });
  await expect(parentRow.locator('[data-agent="claude"][data-dot="codex"]')).toHaveCount(1);

  // The child reports back and the parent continues with what it said.
  await expect(
    log.getByRole('button', { name: /Codex review of session_test folder reported back/ }),
  ).toBeVisible();
  await expect(card).toContainText('Done');
  await expect(
    log.getByText(
      'The sub-session reported back. It said: Review: README.md looks fine. No problems found.',
    ),
  ).toBeVisible();
  // The report is never shown as a user bubble.
  await expect(log.getByText('<subsession_report', { exact: false })).toHaveCount(0);

  // Expanding the row shows the report; Open goes to the child session.
  await log.getByRole('button', { name: /reported back/ }).click();
  await expect(log.locator('[data-report]')).toContainText('No problems found.');
  await page.screenshot({ path: test.info().outputPath('subsession.png') });
  await card.getByRole('button', { name: 'Open Codex review of session_test folder' }).click();
  await expect(
    page.getByRole('heading', { name: 'Codex review of session_test folder' }),
  ).toBeVisible();
  await expect(
    page.getByRole('log', { name: 'Conversation' }).getByText('Please review this folder'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Permission mode: Read-only' })).toBeVisible();
});

test('a Codex parent starts a Claude review, gets the report and continues', async () => {
  const log = await start('Codex', 'Please review with Claude');
  const card = log.getByRole('region', {
    name: 'Sub-session: Claude review of session_test folder',
  });
  await expect(card).toContainText('Sub-session · Claude · Read-only');
  await expect(
    log.getByRole('button', { name: /Claude review of session_test folder reported back/ }),
  ).toBeVisible();
  await expect(
    log.getByText(
      'The sub-session reported back. It said: Review: README.md looks fine. No problems found.',
    ),
  ).toBeVisible();
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(
    sidebar
      .getByRole('treeitem', {
        name: /^Please review with Claude \(Codex, with a Claude sub-session/,
      })
      .locator('[data-agent="codex"][data-dot="claude"]'),
  ).toHaveCount(1);
});

test('at most three sub-sessions run at once', async () => {
  const log = await start('Claude', 'Please start four reviews');
  await expect(
    log.getByText(/^Started 3\. Refused: At most 3 sub-sessions can run at once/),
  ).toBeVisible();
  await expect(log.getByRole('region', { name: /^Sub-session: Review \d$/ })).toHaveCount(3);
  // Stopping the parent offers to stop its running children (the dialog is answered "stop").
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 0,
      checkboxChecked: false,
    })) as typeof dialog.showMessageBox;
  });
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('take it slow');
  await message.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  // Each interrupted child reports back, so the parent shows three "reported back" rows.
  await expect(log.getByRole('button', { name: /^Review \d reported back/ })).toHaveCount(3, {
    timeout: 15_000,
  });
});
