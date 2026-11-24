import { Copy, MessageSquareQuote } from 'lucide-react';
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { cutQuote, pathLabel, quoteLabel } from '../../lib/quotes';
import { isMac } from '../../lib/platform';
import { useQuotes } from '../../stores/quotes';

interface Picked {
  text: string;
  label: string;
  rect: { top: number; left: number; width: number };
}

/** The selection, if it lies inside one assistant message (or report) of this thread. */
function readSelection(root: HTMLElement | null): Picked | null {
  const sel = window.getSelection();
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const el = (n: Node | null) => (n instanceof Element ? n : (n?.parentElement ?? null));
  const startHost = el(range.startContainer)?.closest('[data-selectable]');
  const endHost = el(range.endContainer)?.closest('[data-selectable]');
  if (!startHost || startHost !== endHost || !root.contains(startHost)) return null;
  const text = sel.toString().trim();
  if (!text) return null;

  // "Selected text · pricing.ts:11" when the selection sits next to a file path in its block.
  let path: string | null = null;
  const block = el(range.startContainer)?.closest('li, p, td, blockquote, h3, h4');
  if (block && startHost.contains(block)) {
    for (const code of block.querySelectorAll('code')) {
      const p = pathLabel(code.textContent ?? '');
      if (p) {
        path = p;
        break;
      }
    }
  }
  const r = range.getBoundingClientRect();
  return {
    text: cutQuote(text),
    label: quoteLabel(path),
    rect: { top: r.top, left: r.left, width: r.width },
  };
}

/**
 * Select text in a reply to get "Ask about this" and "Copy" above it. Ask adds the text as a
 * quote to the composer. Shortcut: ⌘⇧A / Ctrl+Shift+A.
 */
export function SelectionToolbar({
  sessionId,
  scrollRef,
  onAsked,
}: {
  sessionId: string;
  scrollRef: RefObject<HTMLElement | null>;
  onAsked: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [full, setFull] = useState(false);
  const add = useQuotes((s) => s.add);

  const ask = useCallback(
    (p: Picked | null) => {
      if (!p) return;
      const ok = add(sessionId, { label: p.label, text: p.text });
      if (!ok) {
        setFull(true);
        return;
      }
      window.getSelection()?.removeAllRanges();
      setPicked(null);
      onAsked();
    },
    [add, sessionId, onAsked],
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const refresh = () =>
      setTimeout(() => {
        setFull(false);
        setPicked(readSelection(scrollRef.current));
      }, 0);
    const onSelectionChange = () => {
      if (window.getSelection()?.isCollapsed) setPicked(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        const p = readSelection(scrollRef.current);
        if (p) {
          e.preventDefault();
          ask(p);
        }
      } else if (e.key === 'Escape') {
        setPicked(null);
      }
    };
    const hide = () => setPicked(null);
    root.addEventListener('mouseup', refresh);
    root.addEventListener('keyup', refresh);
    root.addEventListener('scroll', hide);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('mouseup', refresh);
      root.removeEventListener('keyup', refresh);
      root.removeEventListener('scroll', hide);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKey);
    };
  }, [scrollRef, ask]);

  if (!picked) return null;
  const top = Math.max(8, picked.rect.top - 50);
  const left = Math.max(
    8,
    Math.min(window.innerWidth - 230, picked.rect.left + picked.rect.width / 2 - 100),
  );
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="fixed z-40 flex items-center gap-0.5 rounded-[10px] border border-border-popover bg-popover p-1 shadow-card"
      style={{ top, left }}
      // Keep the selection when the toolbar is clicked.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={() => ask(picked)}
        title={`Ask about this (${isMac ? '⌘⇧A' : 'Ctrl+Shift+A'})`}
        className="flex h-[34px] items-center gap-1.5 rounded-[7px] bg-action px-3 text-[13px] font-semibold text-on-action hover:brightness-110"
      >
        <MessageSquareQuote size={14} aria-hidden />
        Ask about this
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(picked.text);
          setPicked(null);
        }}
        className="flex h-[34px] items-center gap-1.5 rounded-[7px] px-3 text-[13px] text-primary hover:bg-raised"
      >
        <Copy size={14} aria-hidden />
        Copy
      </button>
      {full ? <span className="px-2 text-[12px] text-attention">Up to 3 quotes</span> : null}
    </div>
  );
}
