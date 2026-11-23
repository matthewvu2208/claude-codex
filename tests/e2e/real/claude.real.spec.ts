import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { seedDesignData } from '../../fixtures/seed';
import { launchApp } from '../launch';

/**
 * M3 acceptance against the real Claude Code, with the machine's own Claude login.
 * Opt-in: CLAUDE_CODEX_REAL_AGENTS=1 npm run test:e2e -- tests/e2e/real
 * Uses the developer's account and usage; runs in a throwaway git repo.
 */
test.skip(process.env['CLAUDE_CODEX_REAL_AGENTS'] !== '1', 'needs a signed-in Claude Code');

test('real Claude: read, edit after approval, interrupt, resume after restart', async () => {
  test.setTimeout(10 * 60_000);
  const { userData, root } = seedDesignData({ empty: true });
  const repo = join(root, 'claude-acceptance');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, 'README.md'), '# Acceptance\n\nThe secret word is pelican.\n');
  writeFileSync(join(repo, 'notes.txt'), 'status: draft\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });

  let app = await launchApp({ CLAUDE_CODEX_USER_DATA: userData, CLAUDE_CODEX_FAKE_AGENT: '0' });
  let page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, repo);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('radio', { name: /Claude/ }).click();

  // 1. Read a file.
  await page
    .getByRole('textbox', { name: 'Task' })
    .fill('Read README.md and tell me the secret word. Do not change any files.');
  await page.keyboard.press('Enter');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText(/pelican/i).last()).toBeVisible({ timeout: 180_000 });

  // 2. Edit a file after approval.
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill(
    'In notes.txt, replace the word draft with final using the Edit tool. Nothing else.',
  );
  await message.press('Enter');
  const approval = log.getByRole('region', { name: /Approval:/ }).last();
  await expect(approval).toBeVisible({ timeout: 180_000 });
  await approval.getByRole('button', { name: 'Allow once' }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 180_000 });
  expect(readFileSync(join(repo, 'notes.txt'), 'utf8')).toContain('final');

  // 3. Interrupt mid-turn.
  await message.fill(
    'Count slowly from 1 to 400, one number per line, with a short comment on each.',
  );
  await message.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.waitForTimeout(4000);
  await message.press('Escape');
  await expect(log.getByRole('button', { name: /Stopped after/ })).toBeVisible({ timeout: 60_000 });
  await app.close();

  // 4. Quit, reopen, continue the same conversation.
  app = await launchApp({ CLAUDE_CODEX_USER_DATA: userData, CLAUDE_CODEX_FAKE_AGENT: '0' });
  page = await app.firstWindow();
  await page
    .getByRole('navigation', { name: 'Sidebar' })
    .getByRole('treeitem', { name: /^Read README\.md/ })
    .click();
  const message2 = page.getByRole('textbox', { name: 'Message' });
  await message2.fill('What was the secret word I asked about at the start? One word.');
  await message2.press('Enter');
  await expect(
    page
      .getByRole('log', { name: 'Conversation' })
      .getByText(/pelican/i)
      .last(),
  ).toBeVisible({ timeout: 180_000 });
  await app.close();
});
