import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

/**
 * The M3 scenario on Codex, through the scripted app-server (same JSON-RPC as `codex
 * app-server`): read, edit after approval, deny, interrupt, quit, reopen, continue.
 */
test('Codex session: read, approve an edit, deny, interrupt, resume after restart', async () => {
  test.setTimeout(90_000);
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'codex repo');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  writeFileSync(join(project, 'notes.txt'), 'status: draft\n');
  const env = {
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake-agent'),
  };

  let app: ElectronApplication = await launchApp(env);
  let page: Page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, project);

  const codexCard = page.getByRole('radio', { name: /Codex/ });
  await expect(codexCard).toContainText('ChatGPT Go');
  await codexCard.click();
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Please read the README');
  await page.keyboard.press('Enter');

  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('Here is what')).toBeVisible();
  await log
    .getByRole('button', { name: /Worked for/ })
    .first()
    .click();
  await expect(log.getByText('Run cat README.md')).toBeVisible();
  await expect(page.getByLabel(/^Context \d+k tokens$/)).toBeVisible();
  // Codex reports no cost, so the cost chip stays hidden.
  await expect(page.getByLabel(/^Cost /)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute(
    'placeholder',
    'Reply to Codex…',
  );
  await expect(page.getByRole('button', { name: 'Model: GPT Test' })).toBeVisible();

  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('Now edit the notes');
  await message.press('Enter');
  const approval = log.getByRole('region', { name: 'Approval: Edit notes.txt' });
  await expect(approval).toContainText('-status: draft');
  await expect(approval).toContainText('+status: final');
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar.getByRole('treeitem', { name: /needs approval/ })).toBeVisible();
  await approval.getByRole('button', { name: 'Allow once' }).click();
  await expect(log.getByText('in notes.txt')).toBeVisible();
  expect(readFileSync(join(project, 'notes.txt'), 'utf8')).toBe('status: final\n');

  writeFileSync(join(project, 'notes.txt'), 'status: draft\n');
  await message.fill('edit it again');
  await message.press('Enter');
  await log
    .getByRole('region', { name: 'Approval: Edit notes.txt' })
    .nth(1)
    .getByRole('button', { name: 'Deny' })
    .click();
  await expect(log.getByText('as it was')).toBeVisible();
  expect(readFileSync(join(project, 'notes.txt'), 'utf8')).toBe('status: draft\n');

  await message.fill('take it slow');
  await message.press('Enter');
  await expect(log.getByText('Working through this slowly.').first()).toBeVisible();
  await message.press('Escape');
  await expect(log.getByRole('button', { name: /Stopped after \d+s/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('codex-session.png') });
  await app.close();

  app = await launchApp(env);
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('treeitem', { name: /^Please read the README \(Codex/ })
    .click();
  const log2 = page.getByRole('log', { name: 'Conversation' });
  await expect(log2.getByText('Please read the README')).toBeVisible();
  const message2 = page.getByRole('textbox', { name: 'Message' });
  await message2.fill('Do you remember what I asked?');
  await message2.press('Enter');
  await expect(log2.getByText('I remember 4 earlier messages')).toBeVisible();
  await app.close();
});
