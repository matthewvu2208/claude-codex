import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

/**
 * The M3 scenario against the scripted test agent (same SDK message shapes as Claude Code):
 * read a file, edit one after approval, deny an edit, interrupt a turn, quit, reopen, continue.
 */
test('Claude session: read, approve an edit, deny, interrupt, resume after restart', async () => {
  test.setTimeout(90_000);
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'demo repo');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  writeFileSync(join(project, 'notes.txt'), 'status: draft\n');
  const fakeDir = join(root, 'fake-agent');
  const env = {
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_AGENT: '1',
    CLAUDE_CODEX_FAKE_DIR: fakeDir,
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

  // The Claude card shows the plan reported by the account.
  await expect(page.getByRole('radio', { name: /Claude/ })).toContainText('Max');

  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Please read the README');
  await page.keyboard.press('Enter');

  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('Please read the README')).toBeVisible();
  await expect(log.getByText('Here is what')).toBeVisible();
  await expect(log.getByRole('button', { name: /Worked for \d+s/ })).toBeVisible();
  await log
    .getByRole('button', { name: /Worked for/ })
    .first()
    .click();
  await expect(log.getByText(/Read .*README\.md/)).toBeVisible();
  // Code blocks are highlighted and have a Copy button.
  await expect(log.getByRole('button', { name: 'Copy code' })).toBeVisible();
  await expect(log.locator('.shiki')).toHaveCount(1);
  // Header meters: context tokens and cost.
  await expect(page.getByLabel(/^Context \d+k tokens$/)).toBeVisible();
  await expect(page.getByLabel(/^Cost /)).toBeVisible();

  // Edit after approval.
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('Now edit the notes');
  await message.press('Enter');
  const approval = log.getByRole('region', { name: /Approval: Edit/ });
  await expect(approval).toBeVisible();
  await expect(approval).toContainText('- draft');
  await expect(approval).toContainText('+ final');
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar.getByRole('treeitem', { name: /needs approval/ })).toBeVisible();
  await approval.getByRole('button', { name: 'Allow once' }).click();
  await expect(log.getByText('in notes.txt')).toBeVisible();
  await expect(approval).toContainText('Allowed once');
  expect(readFileSync(join(project, 'notes.txt'), 'utf8')).toBe('status: final\n');

  // Deny path.
  writeFileSync(join(project, 'notes.txt'), 'status: draft\n');
  await message.fill('edit it again');
  await message.press('Enter');
  const second = log.getByRole('region', { name: /Approval: Edit/ }).nth(1);
  await second.getByRole('button', { name: 'Deny' }).click();
  await expect(log.getByText('as it was')).toBeVisible();
  expect(readFileSync(join(project, 'notes.txt'), 'utf8')).toBe('status: draft\n');

  // Interrupt a long turn with Esc.
  await message.fill('take it slow');
  await message.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(sidebar.getByRole('treeitem', { name: /working/ })).toBeVisible();
  await expect(log.getByText('Working through this slowly.').first()).toBeVisible();
  await message.press('Escape');
  await expect(log.getByRole('button', { name: /Stopped after \d+s/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

  await page.screenshot({ path: test.info().outputPath('session.png') });
  await app.close();

  // Reopen: the thread renders from the render log and the conversation resumes.
  app = await launchApp(env);
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('treeitem', { name: /^Please read the README/ })
    .click();
  const log2 = page.getByRole('log', { name: 'Conversation' });
  await expect(log2.getByText('Please read the README')).toBeVisible();
  const message2 = page.getByRole('textbox', { name: 'Message' });
  await message2.fill('Do you remember what I asked?');
  await message2.press('Enter');
  await expect(log2.getByText('I remember 4 earlier messages')).toBeVisible();
  await app.close();
});
