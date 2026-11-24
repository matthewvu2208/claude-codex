import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { seedLongThread } from '../fixtures/seed';
import { launchApp } from './launch';

/**
 * M10 performance pass: a 10,000-event thread opens quickly and scrolls smoothly. Frame times
 * are measured in the renderer with requestAnimationFrame while the thread scrolls from the
 * bottom to the top. Limits are loose enough for CI runners and catch whole-list rendering.
 */
test('a 10,000-event thread opens fast and scrolls smoothly', async () => {
  test.setTimeout(120_000);
  const { userData, root } = seedLongThread(10_000);
  const app = await launchApp({
    CLAUDE_CODEX_USER_DATA: userData,
    CLAUDE_CODEX_FAKE_DIR: join(root, 'fake-agent'),
  });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'What should we build?' }).waitFor();

  const opened = Date.now();
  await page.getByRole('treeitem', { name: /Long thread/ }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log.getByText('Answer', { exact: false }).last()).toBeVisible();
  const openMs = Date.now() - opened;

  // Only the visible part of the thread is in the DOM.
  const rendered = await log.locator('[data-index]').count();
  expect(rendered).toBeLessThan(80);

  const frames = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="thread-scroll"]') as HTMLElement;
    const deltas: number[] = [];
    let last = performance.now();
    let running = true;
    const tick = (t: number) => {
      deltas.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // About 300 px per frame from the bottom to the top, as a fast trackpad flick would.
    for (let i = 0; i < 240 && el.scrollTop > 0; i++) {
      el.scrollTop -= 300;
      await new Promise((r) => requestAnimationFrame(r));
    }
    running = false;
    return { deltas: deltas.slice(1), top: el.scrollTop };
  });
  const sorted = [...frames.deltas].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  const result = {
    openMs,
    rendered,
    frames: sorted.length,
    medianMs: Math.round(p(0.5) * 10) / 10,
    p95Ms: Math.round(p(0.95) * 10) / 10,
    maxMs: Math.round(sorted.at(-1)! * 10) / 10,
  };
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(result) });
  console.log('perf', JSON.stringify(result));

  // A new reply streams into the long thread while frames are measured.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const message = page.getByRole('textbox', { name: 'Message' });
  // The scripted "slow" reply streams for many seconds; measure three of them, then stop.
  await message.fill('slow please');
  await message.press('Enter');
  await expect(log.getByText('slow please')).toBeVisible();
  await expect(log.getByText('Working through this slowly.', { exact: false })).toBeVisible();
  await page.waitForTimeout(3_000);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 });
  const streaming = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    return w.__frames.slice(1).sort((a, b) => a - b);
  });
  const sp = (q: number) =>
    Math.round(streaming[Math.min(streaming.length - 1, Math.floor(streaming.length * q))]! * 10) /
    10;
  const stream = { frames: streaming.length, medianMs: sp(0.5), p95Ms: sp(0.95) };
  test.info().annotations.push({ type: 'perf-streaming', description: JSON.stringify(stream) });
  console.log('perf-streaming', JSON.stringify(stream));

  expect(openMs).toBeLessThan(5_000);
  expect(stream.medianMs).toBeLessThan(25);
  expect(stream.p95Ms).toBeLessThan(60);
  expect(result.medianMs).toBeLessThan(25);
  expect(result.p95Ms).toBeLessThan(60);
  await app.close();
});
