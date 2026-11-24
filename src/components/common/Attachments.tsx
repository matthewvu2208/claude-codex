import { FileText, X } from 'lucide-react';
import { useEffect, useState, type ClipboardEvent, type DragEvent } from 'react';
import { formatBytes, MAX_ATTACHMENTS, type Attachment } from '../../../shared/attachments';
import { api } from '../../lib/ipc';

const previews = new Map<string, Promise<string | null>>();

/** Image attachments as data URLs, fetched once per id. */
function usePreview(a: Attachment): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (a.kind !== 'image') return;
    let alive = true;
    let p = previews.get(a.id);
    if (!p) {
      p = api.attachments.preview({ id: a.id }).catch(() => null);
      previews.set(a.id, p);
    }
    void p.then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [a.id, a.kind]);
  return url;
}

const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : String(e);

/**
 * Attachments for one message: the + button's file picker, files dropped on the box, and
 * images pasted into it. Each is copied into the app as soon as it is added.
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const add = async (get: () => Promise<Attachment[]>) => {
    setBusy(true);
    setError(null);
    try {
      const added = await get();
      setItems((cur) => {
        const next = [...cur, ...added];
        if (next.length > MAX_ATTACHMENTS)
          setError(`You can attach up to ${MAX_ATTACHMENTS} files to one message.`);
        return next.slice(0, MAX_ATTACHMENTS);
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    void add(async () => {
      const out: Attachment[] = [];
      for (const file of files.slice(0, MAX_ATTACHMENTS)) {
        const path = api.attachments.pathFor(file);
        if (path) out.push(...(await api.attachments.addPaths({ paths: [path] })));
        else {
          // Pasted images have no path: send the bytes.
          const ext = file.type.split('/')[1] ?? 'png';
          const name = file.name && file.name !== 'image.png' ? file.name : `Pasted image.${ext}`;
          out.push(
            await api.attachments.addData({ name, data: new Uint8Array(await file.arrayBuffer()) }),
          );
        }
      }
      return out;
    });
  };

  return {
    items,
    busy,
    error,
    dragging,
    pick: () => void add(() => api.attachments.pick()),
    remove: (id: string) => setItems((cur) => cur.filter((a) => a.id !== id)),
    clear: () => {
      setItems([]);
      setError(null);
    },
    /** Spread on the box that accepts dropped files. */
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles([...e.dataTransfer.files]);
      },
    },
    /** Spread on the text box: pasted files and images become attachments. */
    onPaste: (e: ClipboardEvent) => {
      const files = [...e.clipboardData.files];
      if (files.length === 0) return;
      e.preventDefault();
      addFiles(files);
    },
  };
}

function Thumb({ a, size }: { a: Attachment; size: number }) {
  const url = usePreview(a);
  return url ? (
    <img
      src={url}
      alt=""
      className="flex-none rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex flex-none items-center justify-center rounded-md bg-raised text-secondary"
      style={{ width: size, height: size }}
    >
      <FileText size={Math.round(size * 0.5)} aria-hidden />
    </span>
  );
}

/** Chips in a composer, with remove buttons. */
export function AttachmentChips({
  items,
  onRemove,
  busy,
  error,
}: {
  items: Attachment[];
  onRemove: (id: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  if (items.length === 0 && !busy && !error) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {items.length > 0 || busy ? (
        <ul aria-label="Attachments" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex h-12 max-w-[260px] items-center gap-2 rounded-[10px] border border-border bg-quote py-1.5 pr-1 pl-1.5"
            >
              <Thumb a={a} size={36} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-primary">{a.name}</span>
                <span className="text-[11px] text-muted">{formatBytes(a.size)}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemove(a.id)}
                className="flex size-7 flex-none items-center justify-center rounded-md text-label hover:bg-raised"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
          {busy ? (
            <li className="flex h-12 items-center px-2 text-[13px] text-muted">Adding…</li>
          ) : null}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Attachments on a sent message: image thumbnails and file chips. */
export function SentAttachments({ items }: { items: Attachment[] }) {
  return (
    <ul
      aria-label="Attachments"
      className="m-0 flex max-w-[75%] list-none flex-wrap justify-end gap-2 self-end p-0"
    >
      {items.map((a) =>
        a.kind === 'image' ? (
          <li key={a.id} title={a.name}>
            <SentImage a={a} />
          </li>
        ) : (
          <li
            key={a.id}
            className="flex h-11 items-center gap-2 rounded-[10px] border border-border-card bg-bubble py-1.5 pr-3 pl-1.5"
          >
            <Thumb a={a} size={32} />
            <span className="flex min-w-0 flex-col">
              <span className="max-w-[220px] truncate text-[13px]">{a.name}</span>
              <span className="text-[11px] text-muted">{formatBytes(a.size)}</span>
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

function SentImage({ a }: { a: Attachment }) {
  const url = usePreview(a);
  return url ? (
    <img
      src={url}
      alt={a.name}
      className="max-h-[240px] min-h-16 max-w-[320px] min-w-16 rounded-[12px] border border-border-card bg-bubble object-contain"
    />
  ) : (
    <span className="flex h-24 w-32 items-center justify-center rounded-[12px] border border-border-card bg-bubble text-[12px] text-muted">
      {a.name}
    </span>
  );
}
