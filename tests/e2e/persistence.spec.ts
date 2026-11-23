import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';
import { launchApp } from './launch';

test('sessions survive a restart, with rename and archive', async () => {
  const { userData, root } = seedDesignData({ empty: true });
  const project = join(root, 'my project');
  mkdirSync(project, { recursive: true });

  let app = await launchApp({ CLAUDE_CODEX_USER_DATA: userData });
  let page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();

  // Stand in for the system folder picker and the native context menu.
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
  }, project);
  const pickFromMenu = (label: string) =>
    app.evaluate(({ Menu }, label) => {
      const original = Menu.buildFromTemplate;
      Menu.buildFromTemplate = ((template: Electron.MenuItemConstructorOptions[]) => {
        Menu.buildFromTemplate = original;
        return {
          popup: (opts: { callback?: () => void }) => {
            const item = template.find((i) => i.label === label);
            (item?.click as (() => void) | undefined)?.();
            opts.callback?.();
          },
        };
      }) as unknown as typeof Menu.buildFromTemplate;
    }, label);

  await expect(page.getByRole('button', { name: 'Start session' })).toBeDisabled();
  await page.getByRole('button', { name: 'Open folder…' }).click();
  await expect(page.getByRole('button', { name: 'Workspace folder: my project' })).toBeVisible();
  // Not a git repo, so the worktree option is off.
  await expect(page.getByRole('checkbox', { name: 'Worktree' })).toBeDisabled();

  await page.getByRole('radio', { name: /Codex/ }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Keep me\nsecond line');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Keep me' })).toBeVisible();

  await page.getByRole('button', { name: 'New session' }).click();
  await page.getByRole('textbox', { name: 'Task' }).fill('Throw me away');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('heading', { name: 'Throw me away' })).toBeVisible();

  const sidebar = page.getByRole('navigation', { name: 'Sidebar' });
  // Rename with F2.
  await sidebar.getByRole('treeitem', { name: /^Keep me/ }).focus();
  await page.keyboard.press('F2');
  await sidebar.getByRole('textbox', { name: 'Session title' }).fill('Kept and renamed');
  await page.keyboard.press('Enter');
  await expect(sidebar.getByRole('treeitem', { name: 'Kept and renamed (Codex)' })).toBeVisible();

  // Archive from the context menu.
  await pickFromMenu('Archive');
  await sidebar.getByRole('treeitem', { name: /^Throw me away/ }).click({ button: 'right' });
  await expect(sidebar.getByRole('treeitem', { name: /^Throw me away/ })).toHaveCount(0);

  await app.close();

  app = await launchApp({ CLAUDE_CODEX_USER_DATA: userData });
  page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();
  const sidebar2 = page.getByRole('navigation', { name: 'Sidebar' });
  await expect(sidebar2.getByRole('treeitem', { name: 'my project', exact: true })).toBeVisible();
  await expect(sidebar2.getByRole('treeitem', { name: 'Kept and renamed (Codex)' })).toBeVisible();
  await expect(sidebar2.getByRole('treeitem', { name: /^Throw me away/ })).toHaveCount(0);
  // The last agent and folder are remembered.
  await expect(page.getByRole('radio', { name: /Codex/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Workspace folder: my project' })).toBeVisible();

  await sidebar2.getByRole('treeitem', { name: 'Kept and renamed (Codex)' }).click();
  await expect(page.getByText('Keep me\nsecond line')).toBeVisible();
  await app.close();
});
