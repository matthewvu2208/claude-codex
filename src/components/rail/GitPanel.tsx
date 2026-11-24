import { ArrowLeft, GitBranch, Minus, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { IpcOutput } from '../../../shared/ipc';
import { api } from '../../lib/ipc';

type Status = NonNullable<IpcOutput<'git:status'>>;
type File = Status['files'][number];

const STATE_LABEL: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Conflict',
  '?': 'Untracked',
};

function diffClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted';
  if (line.startsWith('+')) return 'text-diff-add';
  if (line.startsWith('-')) return 'text-diff-remove';
  if (line.startsWith('@@')) return 'text-muted';
  return '';
}

function FileRow({
  file,
  staged,
  onOpen,
  onToggle,
}: {
  file: File;
  staged: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const letter = (staged ? file.index : file.workingDir).trim() || 'M';
  return (
    <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-raised">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-row"
        title={`${STATE_LABEL[letter] ?? letter}: ${file.path}`}
      >
        <span className="w-3 flex-none font-mono text-[12px] text-secondary">{letter}</span>
        <span className="min-w-0 truncate">{file.path}</span>
      </button>
      <button
        type="button"
        aria-label={`${staged ? 'Unstage' : 'Stage'} ${file.path}`}
        onClick={onToggle}
        className="flex size-6 flex-none items-center justify-center rounded text-secondary hover:bg-border hover:text-primary"
      >
        {staged ? <Minus size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
      </button>
    </div>
  );
}

/** Status, per-file diff, stage and commit, current branch — in the session folder or worktree. */
export function GitPanel({ sessionId, refreshKey }: { sessionId: string; refreshKey: unknown }) {
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [diff, setDiff] = useState<{ path: string; staged: boolean; text: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.git.status({ sessionId }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    // Refresh when the panel opens and whenever the session's turn state changes.
    void refresh(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [refresh, refreshKey]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  if (status === undefined) return null;
  if (status === null)
    return <p className="m-0 p-4 text-[13px] text-muted">This folder is not a git repository.</p>;

  if (diff) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
          <button
            type="button"
            aria-label="Back to changes"
            onClick={() => setDiff(null)}
            className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
          >
            <ArrowLeft size={15} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-label">
            {diff.path}
          </span>
          <span className="text-[12px] text-muted">{diff.staged ? 'Staged' : 'Unstaged'}</span>
        </div>
        <pre
          role="region"
          aria-label="Diff"
          className="m-0 min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-[1.6]"
        >
          {diff.text
            ? diff.text.split('\n').map((l, i) => (
                <span key={i} className={`block ${diffClass(l)}`}>
                  {l || ' '}
                </span>
              ))
            : 'No changes.'}
        </pre>
      </div>
    );
  }

  const staged = status.files.filter((f) => f.index.trim() && f.index !== '?');
  const changes = status.files.filter((f) => f.workingDir.trim());
  const openDiff = (f: File, isStaged: boolean) =>
    void api.git
      .diff({ sessionId, path: f.path, staged: isStaged })
      .then((text) => setDiff({ path: f.path, staged: isStaged, text }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
      <div className="flex items-center gap-2 px-1 text-[13px] text-label">
        <GitBranch size={14} aria-hidden />
        <span className="min-w-0 flex-1 truncate" data-testid="git-branch">
          {status.branch ?? 'Detached HEAD'}
        </span>
        {status.ahead || status.behind ? (
          <span className="text-[12px] text-muted">
            ↑{status.ahead} ↓{status.behind}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Refresh status"
          onClick={() => void refresh()}
          className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>

      {staged.length > 0 ? (
        <section aria-label="Staged changes" className="flex flex-col gap-1">
          <h3 className="m-0 px-2 text-[12px] font-normal text-muted">Staged ({staged.length})</h3>
          {staged.map((f) => (
            <FileRow
              key={`s:${f.path}`}
              file={f}
              staged
              onOpen={() => openDiff(f, true)}
              onToggle={() => void run(() => api.git.unstage({ sessionId, paths: [f.path] }))}
            />
          ))}
          <form
            className="mt-1 flex flex-col gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim())
                void run(() => api.git.commit({ sessionId, message })).then(() => setMessage(''));
            }}
          >
            <textarea
              aria-label="Commit message"
              placeholder="Commit message"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="resize-none rounded-lg border border-border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-border-strong"
            />
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="h-8 rounded-lg bg-action text-[13px] text-on-action hover:brightness-110 disabled:opacity-50"
            >
              Commit
            </button>
          </form>
        </section>
      ) : null}

      <section aria-label="Changes" className="flex flex-col gap-1">
        <div className="flex items-center px-2">
          <h3 className="m-0 flex-1 text-[12px] font-normal text-muted">
            Changes ({changes.length})
          </h3>
          {changes.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                void run(() => api.git.stage({ sessionId, paths: changes.map((f) => f.path) }))
              }
              className="text-[12px] text-secondary hover:text-primary"
            >
              Stage all
            </button>
          ) : null}
        </div>
        {changes.length === 0 ? (
          <p className="m-0 px-2 text-[13px] text-muted">No changes</p>
        ) : null}
        {changes.map((f) => (
          <FileRow
            key={`c:${f.path}`}
            file={f}
            staged={false}
            onOpen={() => openDiff(f, false)}
            onToggle={() => void run(() => api.git.stage({ sessionId, paths: [f.path] }))}
          />
        ))}
      </section>
      {error ? (
        <p role="alert" className="m-0 px-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
