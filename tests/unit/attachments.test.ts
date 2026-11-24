import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { userContent } from '../../electron/main/agents/claude/ClaudeAdapter';
import { codexInput } from '../../electron/main/agents/codex/CodexAdapter';
import { AttachmentStore } from '../../electron/main/services/attachments';
import {
  attachedFilesNote,
  kindFor,
  MAX_INLINE_IMAGE_BYTES,
  mimeFor,
  safeFileName,
} from '../../shared/attachments';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'attach-'));
  const store = new AttachmentStore(join(dir, 'store'));
  writeFileSync(join(dir, 'notes.txt'), 'hello\n');
  writeFileSync(join(dir, 'pic.png'), PNG);
  return { dir, store };
}

describe('attachment helpers', () => {
  it('names, types and kinds', () => {
    expect(mimeFor('A.PNG')).toBe('image/png');
    expect(mimeFor('report.pdf')).toBe('application/pdf');
    expect(mimeFor('noext')).toBe('application/octet-stream');
    expect(kindFor('image/png', 1000)).toBe('image');
    expect(kindFor('image/png', MAX_INLINE_IMAGE_BYTES + 1)).toBe('file');
    expect(kindFor('image/svg+xml', 10)).toBe('file');
    expect(safeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeFileName('a:b*c?.txt')).toBe('a_b_c_.txt');
    expect(safeFileName('...')).toBe('file');
    expect(attachedFilesNote([])).toBe('');
    expect(attachedFilesNote([{ name: 'a.txt', path: '/x/a.txt' }])).toContain('- a.txt: /x/a.txt');
  });
});

describe('AttachmentStore', () => {
  it('copies files, stores pasted data, and only returns known ids', () => {
    const { dir, store } = setup();
    const file = store.addPath(join(dir, 'notes.txt'));
    expect(file).toMatchObject({ name: 'notes.txt', kind: 'file', mime: 'text/plain', size: 6 });
    const pasted = store.addData('Pasted image.png', new Uint8Array(PNG));
    expect(pasted.kind).toBe('image');
    expect(store.get(file.id)?.path).toMatch(/notes\.txt$/);
    expect(store.preview(pasted.id)).toMatch(/^data:image\/png;base64,/);
    expect(store.preview(file.id)).toBeNull();
    expect(store.get('../../etc')).toBeNull();
    expect(store.get('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(() => store.addPath(dir)).toThrow(/not a file/);
  });

  it('builds each agent’s message: images as images, other files as paths', () => {
    const { dir, store } = setup();
    const files = [store.addPath(join(dir, 'notes.txt')), store.addPath(join(dir, 'pic.png'))].map(
      (a) => store.get(a.id)!,
    );
    const claude = userContent({ text: 'Look', attachments: files });
    expect(Array.isArray(claude)).toBe(true);
    const blocks = claude as { type: string; text?: string; source?: { media_type: string } }[];
    expect(blocks[0]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } });
    expect(blocks[1]!.text).toContain('Look');
    expect(blocks[1]!.text).toContain(`- notes.txt: ${files[0]!.path}`);
    expect(userContent({ text: 'Plain' })).toBe('Plain');

    const codex = codexInput({ text: '', attachments: files });
    expect(codex[0]).toEqual({ type: 'localImage', path: files[1]!.path });
    expect(codex[1]).toMatchObject({ type: 'text' });
    expect((codex[1] as { text: string }).text).not.toMatch(/^\s/);
  });
});
