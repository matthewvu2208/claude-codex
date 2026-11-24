import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'review-test');
  mkdirSync(project, { recursive: true });
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
  await page.getByRole('radio', { name: /Claude/ }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Please list the problems');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(
    page.getByText('applyDiscount does not guard against NaN', { exact: false }),
  ).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
});

/** Selects `phrase` inside the reply the way a mouse drag would, then releases the mouse. */
async function select(phrase: string) {
  await page.evaluate((phrase) => {
    const root = document.querySelector('[data-selectable]')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(phrase);
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + phrase.length);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        n.parentElement!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
    }
    throw new Error(`not found: ${phrase}`);
  }, phrase);
}

test('selecting reply text, asking about it, and sending puts the quote first', async () => {
  await select('applyDiscount does not guard against NaN');
  const toolbar = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(toolbar.getByRole('button', { name: 'Ask about this' })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Copy' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Ask about this' }).click();

  const quote = page.getByTestId('quote');
  await expect(quote).toHaveCount(1);
  await expect(quote).toContainText('Selected text · pricing.ts:11');
  await expect(quote).toContainText('applyDiscount does not guard against NaN');
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveAttribute('placeholder', 'Ask Claude about this selection…');
  await expect(message).toBeFocused();
  await message.fill('Why is that a bug?');
  await message.press('Enter');

  // The sent message: the quote as a blockquote with its label, then the question.
  const bubble = page.getByRole('log', { name: 'Conversation' }).getByText('Why is that a bug?');
  await expect(bubble).toHaveText(
    '> Selected text · pricing.ts:11\n>\n> applyDiscount does not guard against NaN\n\nWhy is that a bug?',
  );
  await expect(page.getByText('You quoted 1 passage(s).')).toBeVisible();
  await expect(page.getByTestId('quote')).toHaveCount(0);
});

test('the keyboard shortcut asks, quotes can be removed, and at most three are kept', async () => {
  await select('round() drops negative zero');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+A' : 'Control+Shift+A');
  await expect(page.getByTestId('quote')).toHaveCount(1);
  await expect(page.getByTestId('quote')).toContainText('Selected text · utils.ts:4');

  await select('Two problems');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+A' : 'Control+Shift+A');
  await select('so the price is NaN');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+A' : 'Control+Shift+A');
  await expect(page.getByTestId('quote')).toHaveCount(3);
  await expect(page.getByTestId('quote').nth(1)).toContainText(/^Selected text“/);

  await select('applyDiscount');
  await page
    .getByRole('toolbar', { name: 'Selection actions' })
    .getByRole('button', { name: 'Ask about this' })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Selection actions' })).toContainText(
    'Up to 3 quotes',
  );
  await expect(page.getByTestId('quote')).toHaveCount(3);

  await page.getByRole('button', { name: 'Remove quote' }).first().click();
  await expect(page.getByTestId('quote')).toHaveCount(2);
});
