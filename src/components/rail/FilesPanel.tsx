import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { highlight } from '../../lib/highlight';
import { api } from '../../lib/ipc';
import { buildFileTree, type TreeNode } from '../../lib/panels';

const LANG_BY_EXT: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  json: 'json',
  md: 'md',
  css: 'css',
  html: 'html',
  py: 'py',
  rs: 'rust',
  go: 'go',
  sh: 'sh',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  java: 'java',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cs: 'csharp',
};

function Preview({
  sessionId,
  path,
  onBack,
}: {
  sessionId: string;
  path: string;
  onBack: () => void;
}) {
  const [state, setState] = useState<{
    text: string | null;
    html: string | null;
    note: string | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void api.fs
      .read({ sessionId, path })
      .then(async (r) => {
        if (r.binary) return { text: null, html: null, note: 'Binary file; no preview.' };
        const lang = LANG_BY_EXT[path.split('.').pop()?.toLowerCase() ?? ''] ?? '';
        const html = r.content && lang ? await highlight(r.content, lang) : null;
        return { text: r.content, html, note: r.tooLarge ? 'Showing the first 512 KB.' : null };
      })
      .catch((e: unknown) => ({
        text: null,
        html: null,
        note: e instanceof Error ? e.message : String(e),
      }))
      .then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [sessionId, path]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
        <button
          type="button"
          aria-label="Back to files"
          onClick={onBack}
          className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
        >
          <ArrowLeft size={15} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-label" title={path}>
          {path}
        </span>
        <button
          type="button"
          onClick={() => void api.fs.open({ sessionId, path })}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-secondary hover:bg-raised hover:text-primary"
        >
          <ExternalLink size={13} aria-hidden />
          Open in editor
        </button>
      </div>
      {state?.note ? <p className="m-0 px-3 pt-2 text-[12px] text-muted">{state.note}</p> : null}
      <div
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12.5px] leading-[1.6]"
        aria-label="File preview"
        role="region"
      >
        {state?.html ? (
          // Shiki builds this HTML from the file text and escapes it.
          <div
            className="[&_pre]:m-0 [&_pre]:bg-transparent!"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        ) : state?.text !== undefined && state?.text !== null ? (
          <pre className="m-0 whitespace-pre">{state.text}</pre>
        ) : null}
      </div>
    </div>
  );
}

/** Files of the session folder (or worktree), respecting .gitignore, with a read-only preview. */
export function FilesPanel({ sessionId }: { sessionId: string }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void api.fs.tree({ sessionId }).then((p) => live && setPaths(p));
    return () => {
      live = false;
    };
  }, [sessionId, reload]);

  const rows = useMemo(() => {
    const out: { node: TreeNode; depth: number }[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ node: n, depth });
        if (n.dir && open.has(n.path)) walk(n.children, depth + 1);
      }
    };
    walk(buildFileTree(paths ?? []), 0);
    return out;
  }, [paths, open]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is designed for this.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  if (selected)
    return <Preview sessionId={sessionId} path={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end px-2 pt-1.5">
        <button
          type="button"
          aria-label="Refresh files"
          onClick={() => setReload((r) => r + 1)}
          className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
        >
          <RefreshCw size={14} aria-hidden />
        </button>
      </div>
      {paths && paths.length === 0 ? (
        <p className="m-0 p-4 text-[13px] text-muted">No files</p>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
        role="tree"
        aria-label="Files"
      >
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const { node, depth } = rows[v.index]!;
            const isOpen = open.has(node.path);
            return (
              <button
                key={node.path + (node.dir ? '/' : '')}
                type="button"
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={node.dir ? isOpen : undefined}
                onClick={() => {
                  if (!node.dir) return setSelected(node.path);
                  setOpen((o) => {
                    const next = new Set(o);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
                }}
                className="absolute top-0 left-0 flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] text-row hover:bg-raised"
                style={{ transform: `translateY(${v.start}px)`, paddingLeft: 6 + depth * 14 }}
              >
                {node.dir ? (
                  <>
                    {isOpen ? (
                      <ChevronDown size={13} className="flex-none text-muted" aria-hidden />
                    ) : (
                      <ChevronRight size={13} className="flex-none text-muted" aria-hidden />
                    )}
                    <Folder size={14} className="flex-none text-secondary" aria-hidden />
                  </>
                ) : (
                  <FileText size={14} className="ml-[19px] flex-none text-secondary" aria-hidden />
                )}
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
