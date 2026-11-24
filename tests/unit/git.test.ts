import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createWorktree,
  listFiles,
  mergeWorktree,
  rankFiles,
  removeWorktree,
  sessionSlug,
} from '../../electron/main/services/git';
import { findTrigger } from '../../src/lib/picker';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], {
    cwd,
  }).toString();

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'git-unit-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'notes.txt'), 'draft\n');
  writeFileSync(join(dir, 'src', 'pricing.ts'), 'x\n');
  writeFileSync(join(dir, '.gitignore'), 'secret.env\n');
  writeFileSync(join(dir, 'secret.env'), 'K=V\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

describe('worktrees', () => {
  it('slugs titles for branches and folders', () => {
    expect(sessionSlug('Sửa lỗi build!')).toMatch(/^sua-loi-build-[0-9a-f]{4}$/);
    expect(sessionSlug('***')).toMatch(/^session-[0-9a-f]{4}$/);
  });

  it('creates, merges and removes a worktree without touching the main checkout until merge', async () => {
    const dir = repo();
    // Commits in the worktree need an identity; CI machines may not have one.
    process.env['GIT_AUTHOR_NAME'] = process.env['GIT_COMMITTER_NAME'] = 'T';
    process.env['GIT_AUTHOR_EMAIL'] = process.env['GIT_COMMITTER_EMAIL'] = 't@example.com';
    const root = mkdtempSync(join(tmpdir(), 'wt-root-'));
    const wt = await createWorktree(dir, root, 'Fix notes');
    expect(wt.branch).toMatch(/^agent\/fix-notes-/);
    expect(wt.path.startsWith(join(root, dir.split(/[\\/]/).pop()!))).toBe(true);

    writeFileSync(join(wt.path, 'notes.txt'), 'final\n');
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('draft\n');
    expect(git(dir, 'status', '--porcelain')).toBe('');

    await mergeWorktree(dir, wt, 'Session: Fix notes');
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('final\n');

    await removeWorktree(dir, wt.path);
    expect(existsSync(wt.path)).toBe(false);
    expect(git(dir, 'branch', '--list', wt.branch)).toContain(wt.branch);
  });
});

describe('file picker', () => {
  it('lists repo files respecting .gitignore, and walks plain folders', async () => {
    const dir = repo();
    expect((await listFiles(dir)).sort()).toEqual(['.gitignore', 'notes.txt', 'src/pricing.ts']);
    const plain = mkdtempSync(join(tmpdir(), 'plain-'));
    mkdirSync(join(plain, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(plain, 'node_modules', 'x', 'i.js'), '');
    writeFileSync(join(plain, 'a.md'), '');
    expect(await listFiles(plain)).toEqual(['a.md']);
  });

  it('ranks name matches before path and subsequence matches', () => {
    const files = [
      'src/utils/price.ts',
      'docs/pricing-notes.md',
      'src/pricing.ts',
      'lib/p-r-i-c-e.ts',
    ];
    expect(rankFiles(files, 'pric')).toEqual([
      'src/pricing.ts',
      'src/utils/price.ts',
      'docs/pricing-notes.md',
      'lib/p-r-i-c-e.ts',
    ]);
    expect(rankFiles(files, 'prce')).toContain('lib/p-r-i-c-e.ts');
    expect(rankFiles(files, '')).toHaveLength(4);
  });

  it('finds @ and / triggers under the caret', () => {
    expect(findTrigger('Look at @src/pr', 15)).toEqual({
      mode: 'file',
      start: 8,
      end: 15,
      query: 'src/pr',
    });
    expect(findTrigger('/rev', 4)).toEqual({ mode: 'command', start: 0, end: 4, query: 'rev' });
    expect(findTrigger('see /rev', 8)).toBeNull();
    expect(findTrigger('mail me@x', 9)).toBeNull();
    expect(findTrigger('/usr/bin', 8)).toBeNull();
  });
});
