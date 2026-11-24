import { describe, expect, it } from 'vitest';
import { replaceCodexDirectives, splitStreaming } from '../../electron/main/agents/codex/citations';
import { CodexEventMapper } from '../../electron/main/agents/codex/mapEvents';

const PDF =
  '/Users/m/Library/Application Support/Claude Codex/attachments/8135db4f-7419-48b4-887c-d83a6aaf7d9c/Dap-an-Giai-tich-1A.pdf';

describe('Codex directives', () => {
  it('turns file citations into readable file names', () => {
    expect(
      replaceCodexDirectives(
        `Có, mình đọc được cả 19 trang của :codex-file-citation{path="${PDF}" purpose="source"}. Đây là đáp án.`,
      ),
    ).toBe('Có, mình đọc được cả 19 trang của `Dap-an-Giai-tich-1A.pdf`. Đây là đáp án.');
    expect(
      replaceCodexDirectives(
        'See :codex-file-citation{path="/repo/src/app.ts" line_range_start="12" line_range_end="20"}',
        '/repo',
      ),
    ).toBe('See `src/app.ts:12-20`');
    expect(replaceCodexDirectives('A :codex-note[a label]{x="1"} b')).toBe('A a label b');
    expect(replaceCodexDirectives('Plain text: no directives here')).toBe(
      'Plain text: no directives here',
    );
  });

  it('holds back a directive until it has fully arrived while streaming', () => {
    expect(splitStreaming('Read :codex-file-cit')).toEqual({
      show: 'Read ',
      keep: ':codex-file-cit',
    });
    expect(splitStreaming('Read :co')).toEqual({ show: 'Read ', keep: ':co' });
    expect(splitStreaming('time: 5')).toEqual({ show: 'time: 5', keep: '' });
    expect(splitStreaming(`x :codex-file-citation{path="${PDF}"} y`).show).toBe(
      'x `Dap-an-Giai-tich-1A.pdf` y',
    );
  });

  it('the mapper never shows the raw directive, in deltas or the final text', () => {
    const m = new CodexEventMapper('S', '/repo');
    const full = `Có, đọc được :codex-file-citation{path="${PDF}" purpose="source"}. Xong.`;
    const chunks = [full.slice(0, 18), full.slice(18, 40), full.slice(40, 90), full.slice(90)];
    let streamed = '';
    for (const delta of chunks) {
      for (const e of m.map('item/agentMessage/delta', {
        threadId: 't',
        turnId: 'u',
        itemId: 'i',
        delta,
      } as never)) {
        if (e.t === 'text.delta') streamed += e.text;
      }
    }
    expect(streamed).not.toContain(':codex-');
    expect(streamed).toBe('Có, đọc được `Dap-an-Giai-tich-1A.pdf`. Xong.');
    const done = m.map('item/completed', {
      threadId: 't',
      turnId: 'u',
      item: { type: 'agentMessage', id: 'i', text: full },
    } as never);
    expect(done[0]).toMatchObject({
      t: 'text.done',
      text: 'Có, đọc được `Dap-an-Giai-tich-1A.pdf`. Xong.',
    });
  });
});
