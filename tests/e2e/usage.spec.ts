import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

/**
 * M9: the sidebar card shows real plan usage. Codex reads its rate limits once signed in;
 * Claude's arrive with replies as rate-limit events. Unknown values show "—" with a hint, and
 * the last values come back after a restart.
 */
test('Usage card: unknown until reported, then real values that survive a restart', async () => {
  test.setTimeout(90_000);
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'usage repo');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'README.md'), '# Demo\n');
  const env = {
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake-agent'),
  };

  let app = await launchApp(env);
  let page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  const card = page.getByRole('region', { name: 'Usage' });
  const claudeRow = card.getByTestId('claude-usage');
  const codexRow = card.getByTestId('codex-usage');

  // Claude has not replied yet: unknown, with a hint on hover.
  const unknown = claudeRow.getByLabel('Claude usage unknown');
  await expect(unknown).toHaveText('—');
  await expect(unknown).toHaveAttribute('title', /Claude reports plan usage with its replies/);
  // Codex (signed in with ChatGPT) reads its weekly limit at start.
  await expect(codexRow).toContainText('10%');
  await expect(codexRow).toContainText('27d');
  await expect(codexRow.getByText('Codex')).toHaveAttribute('title', 'Weekly');

  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, project);
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await page.getByRole('radio', { name: /Claude/ }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('hello');
  await page.getByRole('button', { name: 'Start session' }).click();

  await expect(claudeRow).toContainText('Weekly · all models');
  await expect(claudeRow).toContainText('57%');
  await expect(claudeRow).toContainText('resets 3d');
  await page.screenshot({ path: test.info().outputPath('usage-card.png') });
  await app.close();

  // The last snapshot is kept, so the card is filled before any new reply.
  app = await launchApp(env);
  page = await app.firstWindow();
  await expect(
    page.getByRole('region', { name: 'Usage' }).getByTestId('claude-usage'),
  ).toContainText('57%');
  await app.close();
});
