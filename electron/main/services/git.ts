import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { simpleGit } from 'simple-git';

export function isGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}

/** "Fix the build!" → "fix-the-build-3f9a" (unique enough for a branch and a folder). */
export function sessionSlug(title: string): string {
  const base =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'session';
  return `${base}-${randomBytes(2).toString('hex')}`;
}

export interface Worktree {
  path: string;
  branch: string;
}

/** `git worktree add <root>/<repo>/<slug> -b agent/<slug>` from the repo's current HEAD. */
export async function createWorktree(
  repoPath: string,
  root: string,
  title: string,
): Promise<Worktree> {
  const slug = sessionSlug(title);
  const dir = join(root, basename(repoPath), slug);
  mkdirSync(join(root, basename(repoPath)), { recursive: true });
  const branch = `agent/${slug}`;
  await simpleGit(repoPath).raw(['worktree', 'add', dir, '-b', branch]);
  return { path: dir, branch };
}

/** Removes the worktree folder; the branch is kept so nothing is lost. */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await simpleGit(repoPath).raw(['worktree', 'remove', worktreePath]);
}

/**
 * Commits any uncommitted work in the worktree, then merges its branch into the main
 * checkout's current branch.
 */
export async function mergeWorktree(
  repoPath: string,
  wt: Worktree,
  message: string,
): Promise<string> {
  const worktree = simpleGit(wt.path);
  const status = await worktree.status();
  if (!status.isClean()) {
    await worktree.add(['-A']);
    await worktree.commit(message);
  }
  const main = simpleGit(repoPath);
  const result = await main.merge([wt.branch, '--no-edit']);
  return result.result;
}

const SKIP = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'out',
  'build',
  '.venv',
  '__pycache__',
]);
const MAX_FILES = 20_000;

/** Files under `root` (relative, forward slashes), respecting .gitignore in git repos. */
export async function listFiles(root: string): Promise<string[]> {
  if (isGitRepo(root)) {
    try {
      const out = await simpleGit(root).raw([
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
      ]);
      return out.split('\n').filter(Boolean).slice(0, MAX_FILES);
    } catch {
      // Fall back to walking the folder.
    }
  }
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (files.length >= MAX_FILES || depth > 12) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(full, depth + 1);
      } else if (e.isFile()) {
        files.push(relative(root, full).split(sep).join('/'));
        if (files.length >= MAX_FILES) return;
      }
    }
  };
  walk(root, 0);
  return files;
}

/** Ranks paths for a picker query: name matches first, then subsequence matches. */
export function rankFiles(files: string[], query: string, limit = 50): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, limit);
  const scored: [number, string][] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    const name = lower.slice(lower.lastIndexOf('/') + 1);
    let score: number;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(q)) score = 1;
    else if (lower.includes(q)) score = 2;
    else {
      let i = 0;
      for (const ch of lower) if (ch === q[i]) i++;
      if (i < q.length) continue;
      score = 3;
    }
    scored.push([score * 1000 + f.length, f]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, f]) => f);
}

export interface GitFile {
  path: string;
  /** Staged state letter (M, A, D, R, ?), or ' ' when nothing is staged. */
  index: string;
  /** Working tree state letter, or ' ' when clean. */
  workingDir: string;
}

export interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const s = await simpleGit(cwd).status();
  return {
    branch: s.current,
    ahead: s.ahead,
    behind: s.behind,
    files: s.files.map((f) => ({ path: f.path, index: f.index, workingDir: f.working_dir })),
  };
}

/** Diff of one file: staged (index vs HEAD) or unstaged (working tree vs index). */
export async function gitDiff(cwd: string, path: string, staged: boolean): Promise<string> {
  const git = simpleGit(cwd);
  const diff = await git.diff([...(staged ? ['--cached'] : []), '--', path]);
  if (diff || staged) return diff;
  // Untracked files have no diff against the index; show them as new.
  const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '--', path]);
  return untracked.trim()
    ? await git
        .raw(['diff', '--no-index', '--', devNull(), path])
        .catch((e: { message?: string }) => e.message ?? '')
    : '';
}

const devNull = () => (process.platform === 'win32' ? 'NUL' : '/dev/null');

export async function gitStage(cwd: string, paths: string[]): Promise<void> {
  await simpleGit(cwd).add(paths);
}

export async function gitUnstage(cwd: string, paths: string[]): Promise<void> {
  await simpleGit(cwd).raw(['restore', '--staged', '--', ...paths]);
}

export async function gitCommit(cwd: string, message: string): Promise<string> {
  const r = await simpleGit(cwd).commit(message);
  return r.commit;
}
