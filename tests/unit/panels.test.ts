import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeUrl } from '../../electron/main/services/browser';
import { readPreview, resolveInside } from '../../electron/main/services/files';
import {
  gitCommit,
  gitDiff,
  gitStage,
  gitStatus,
  gitUnstage,
} from '../../electron/main/services/git';
import { PtyManager } from '../../electron/main/services/pty';
import { buildFileTree, buildOutline } from '../../src/lib/panels';

describe('file tree and outline', () => {
  it('puts folders first and nests paths', () => {
    const tree = buildFileTree(['b.txt', 'src/z.ts', 'src/a/x.ts', 'a.md']);
    expect(tree.map((n) => n.name)).toEqual(['src', 'a.md', 'b.txt']);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(['a', 'z.ts']);
    expect(tree[0]!.children[0]!.children[0]!.path).toBe('src/a/x.ts');
  });

  it('lists user turns and reply headings', () => {
    const outline = buildOutline([
      { kind: 'user', key: 'u', text: '> quoted\n\nFix the build' },
      {
        kind: 'text',
        key: 't',
        itemId: 'x',
        text: '## Plan\nsteps\n### **Step 1**',
        streaming: false,
      },
    ]);
    expect(outline).toEqual([
      { index: 0, label: 'Fix the build', level: 0 },
      { index: 1, label: 'Plan', level: 1 },
      { index: 1, label: 'Step 1', level: 1 },
    ]);
  });
});

describe('browser panel', () => {
  it('only accepts web addresses and completes short ones', () => {
    expect(normalizeUrl('localhost:5173')).toBe('http://localhost:5173/');
    expect(normalizeUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeUrl('http://127.0.0.1:3000/a')).toBe('http://127.0.0.1:3000/a');
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('  ')).toBeNull();
  });
});

describe('file preview', () => {
  const root = mkdtempSync(join(tmpdir(), 'files-unit-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'const a = 1;\n');
  writeFileSync(join(root, 'bin.dat'), Buffer.from([1, 0, 2, 3]));
  const outside = mkdtempSync(join(tmpdir(), 'outside-'));
  writeFileSync(join(outside, 'secret.txt'), 'nope');

  it('reads text, flags binary files', () => {
    expect(readPreview(root, 'src/a.ts')).toMatchObject({
      content: 'const a = 1;\n',
      binary: false,
    });
    expect(readPreview(root, 'bin.dat')).toMatchObject({ content: null, binary: true });
  });

  it('refuses paths outside the session folder', () => {
    expect(() => resolveInside(root, '../x')).toThrow(/outside/);
    expect(() => resolveInside(root, join(outside, 'secret.txt'))).toThrow(/relative/);
    if (process.platform !== 'win32') {
      symlinkSync(outside, join(root, 'link'));
      expect(() => readPreview(root, 'link/secret.txt')).toThrow(/outside/);
    }
  });
});

describe('git panel operations', () => {
  it('reports status, diffs, stages, unstages and commits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitp-'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir }).toString();
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'core.autocrlf', 'false');
    writeFileSync(join(dir, 'a.txt'), 'one\n');
    git('add', '-A');
    git('commit', '-qm', 'init');
    writeFileSync(join(dir, 'a.txt'), 'two\n');
    writeFileSync(join(dir, 'new.txt'), 'fresh\n');

    const s = await gitStatus(dir);
    expect(s.branch).toBe('main');
    expect(s.files).toEqual(
      expect.arrayContaining([
        { path: 'a.txt', index: ' ', workingDir: 'M' },
        { path: 'new.txt', index: '?', workingDir: '?' },
      ]),
    );
    expect(await gitDiff(dir, 'a.txt', false)).toContain('+two');
    expect(await gitDiff(dir, 'new.txt', false)).toContain('+fresh');

    await gitStage(dir, ['a.txt']);
    expect(await gitDiff(dir, 'a.txt', true)).toContain('-one');
    await gitUnstage(dir, ['a.txt']);
    expect((await gitStatus(dir)).files.find((f) => f.path === 'a.txt')?.index).toBe(' ');

    await gitStage(dir, ['a.txt', 'new.txt']);
    const hash = await gitCommit(dir, 'From the panel');
    expect(hash).toBeTruthy();
    expect((await gitStatus(dir)).files).toEqual([]);
  });
});

describe('terminal', () => {
  it('runs a real shell in the given folder and batches output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pty-'));
    const chunks: string[] = [];
    let exited: number | null = null;
    const ptys = new PtyManager(
      (batch) => chunks.push(...batch.map((b) => b.data)),
      (_id, code) => (exited = code),
    );
    const t = ptys.create('S', dir, 80, 24);
    expect(ptys.list('S')).toHaveLength(1);
    ptys.write(t.id, 'echo pty-ok\r');
    await expect.poll(() => chunks.join(''), { timeout: 15_000 }).toContain('pty-ok');
    ptys.resize(t.id, 100, 30);
    ptys.write(t.id, 'exit\r');
    await expect.poll(() => exited, { timeout: 15_000 }).not.toBeNull();
    expect(ptys.list('S')).toHaveLength(0);
  });
});
