import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function start(extra: Record<string, string> = {}) {
  const { userData, root } = seedDesignData({ empty: true });
  const app = await launchApp({
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake-agent'),
    ...extra,
  });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  return { app, page, root };
}

async function stubOpenDialog(app: ElectronApplication, paths: string[]) {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths,
    })) as typeof dialog.showOpenDialog;
  }, paths);
}

/** Pastes (or drops) an in-memory PNG, as a screenshot from the clipboard would arrive. */
async function pasteImage(page: Page, selector: string, event: 'paste' | 'drop') {
  await page.evaluate(
    ({ selector, event, bytes }) => {
      const file = new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const el = document.querySelector(selector)!;
      const e =
        event === 'paste'
          ? new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
          : new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
    },
    { selector, event, bytes: [...PNG] },
  );
}

test('chat without a folder, attach a file and an image, then paste and drop more', async () => {
  test.setTimeout(90_000);
  const { app, page, root } = await start();

  // No folder chosen: the message starts a chat in the app's Chats folder.
  const task = page.getByRole('textbox', { name: 'Task' });
  await expect(task).toHaveAttribute('placeholder', /Ask anything/);
  await task.fill('Hello there');
  await task.press('Enter');
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('Hello from the test agent.')).toBeVisible();
  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar.getByText('Chats', { exact: true })).toBeVisible();

  // Attach a text file and an image with the paperclip (system file picker).
  const files = join(root, 'to-attach');
  mkdirSync(files, { recursive: true });
  writeFileSync(join(files, 'notes.txt'), 'Quarterly numbers look good\nsecond line\n');
  writeFileSync(join(files, 'chart.png'), PNG);
  await stubOpenDialog(app, [join(files, 'notes.txt'), join(files, 'chart.png')]);
  const reply = page.getByRole('form', { name: 'Reply' });
  await reply.getByRole('button', { name: 'Attach files' }).click();
  const chips = reply.getByRole('list', { name: 'Attachments' });
  await expect(chips.getByRole('listitem')).toHaveCount(2);
  await expect(chips).toContainText('notes.txt');
  await expect(chips.locator('img')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('composer-attachments.png') });

  // Remove one and add it back, then send with text.
  await reply.getByRole('button', { name: 'Remove chart.png' }).click();
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await stubOpenDialog(app, [join(files, 'chart.png')]);
  await reply.getByRole('button', { name: 'Attach files' }).click();
  await expect(chips.getByRole('listitem')).toHaveCount(2);
  const message = reply.getByRole('textbox', { name: 'Message' });
  await message.fill('What is in these?');
  await message.press('Enter');

  // The agent got the image as an image and read the file from its path.
  await expect(
    log.getByText(
      'I received 1 image and 1 file. notes.txt starts with: Quarterly numbers look good',
    ),
  ).toBeVisible();
  await expect(log.getByRole('img', { name: 'chart.png' })).toBeVisible();
  await expect(log.getByRole('list', { name: 'Attachments' })).toContainText('notes.txt');
  await expect(reply.getByRole('list', { name: 'Attachments' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('sent-attachments.png') });

  // A pasted screenshot and a dropped image become attachments too; an image alone can be sent.
  await pasteImage(page, 'textarea[aria-label="Message"]', 'paste');
  await expect(chips.getByRole('listitem')).toHaveCount(1);
  await expect(chips).toContainText('Pasted image.png');
  await pasteImage(page, 'form[aria-label="Reply"]', 'drop');
  await expect(chips.getByRole('listitem')).toHaveCount(2);
  await reply.getByRole('button', { name: 'Send' }).click();
  await expect(log.getByText('I received 2 images and 0 files.')).toBeVisible();
  await app.close();
});

test('Codex gets attached images as images', async () => {
  const { app, page, root } = await start();
  await page.getByRole('radio', { name: /Codex/ }).click();
  mkdirSync(join(root, 'x'), { recursive: true });
  writeFileSync(join(root, 'x', 'photo.png'), PNG);
  await stubOpenDialog(app, [join(root, 'x', 'photo.png')]);
  const box = page.getByRole('form', { name: 'New session' });
  await box.getByRole('button', { name: 'Attach files' }).click();
  await expect(box.getByRole('list', { name: 'Attachments' })).toContainText('photo.png');
  await page.getByRole('textbox', { name: 'Task' }).fill('Describe this photo');
  await page.getByRole('button', { name: 'Start session' }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('I received 1 image and 0 files.')).toBeVisible();

  // Codex's file-citation directives read as file names, never as raw syntax.
  const message = page.getByRole('textbox', { name: 'Message' });
  await message.fill('Please cite the readme');
  await message.press('Enter');
  await expect(log.getByText('for you.', { exact: false })).toBeVisible();
  await expect(log.locator('code', { hasText: /^README\.md$/ })).toBeVisible();
  await expect(log).not.toContainText(':codex-');
  await app.close();
});

test('signed out: the notice explains, offers sign-in, and keeps the message', async () => {
  const { app, page } = await start({ CLAUDE_CODEX_FAKE_SIGNED_OUT: 'claude' });
  const notice = page.getByRole('region', { name: 'Claude setup' });
  await expect(notice).toContainText('Sign in to Claude to start chatting.');
  await expect(notice.getByRole('button', { name: 'Sign in to Claude' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('signed-out.png') });

  const task = page.getByRole('textbox', { name: 'Task' });
  await task.fill('Please help');
  await task.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Your message is kept.');
  await expect(task).toHaveValue('Please help');
  await expect(page.getByRole('log', { name: 'Conversation' })).toHaveCount(0);

  // "Use an API key" goes to Settings › Accounts.
  await notice.getByRole('button', { name: 'Use an API key' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Settings' })
      .getByRole('tab', { name: 'Accounts', selected: true }),
  ).toBeVisible();
  await app.close();
});
