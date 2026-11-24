import { FileText, SquareSlash } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { AgentId } from '../../../shared/agents';
import { api } from '../../lib/ipc';
import { findTrigger, type Trigger } from '../../lib/picker';

interface PickerItem {
  value: string;
  label: string;
  description?: string;
}

interface UsePickerOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (t: string) => void;
  /** Files come from the session's folder (or the chosen folder before a session starts). */
  source: { sessionId: string } | { folderId: string } | null;
  agent: AgentId;
}

const commandCache = new Map<AgentId, { name: string; description: string }[]>();

/**
 * `@` opens a file picker and `/` (first character) a command picker above the text box.
 * Arrow keys move, Enter or Tab inserts, Esc closes.
 */
export function usePicker({ textareaRef, text, setText, source, agent }: UsePickerOptions) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [items, setItems] = useState<PickerItem[]>([]);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const id = useId();
  const seq = useRef(0);
  const sourceKey = source
    ? 'sessionId' in source
      ? `s:${source.sessionId}`
      : `f:${source.folderId}`
    : '';

  // Recompute the trigger from the text and caret.
  const refresh = () => {
    const el = textareaRef.current;
    if (!el) return;
    const t = findTrigger(el.value, el.selectionStart ?? el.value.length);
    const key = t ? `${t.mode}:${t.start}` : null;
    setTrigger(t && key !== dismissed ? t : null);
  };

  useEffect(refresh, [text, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!trigger) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        let next: PickerItem[] = [];
        if (trigger.mode === 'file' && source) {
          const files = await api.fs.files({ ...source, query: trigger.query });
          next = files.map((f) => ({ value: f, label: f }));
        } else if (trigger.mode === 'command') {
          let commands = commandCache.get(agent);
          if (!commands) {
            commands = await api.agent.commands({ agent });
            commandCache.set(agent, commands);
          }
          const q = trigger.query.toLowerCase();
          next = commands
            .filter((c) => c.name.toLowerCase().includes(q))
            .slice(0, 50)
            .map((c) => ({ value: c.name, label: `/${c.name}`, description: c.description }));
        }
        if (n === seq.current) {
          setItems(next);
          setActive(0);
        }
      } catch {
        if (n === seq.current) setItems([]);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [trigger?.mode, trigger?.query, sourceKey, agent]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = !!trigger;
  // Results from an earlier trigger are not shown once it closes.
  const shown = open ? items : [];

  const insert = (item: PickerItem) => {
    if (!trigger) return;
    const piece = trigger.mode === 'file' ? `@${item.value} ` : `/${item.value} `;
    const next = text.slice(0, trigger.start) + piece + text.slice(trigger.end);
    setText(next);
    const caret = trigger.start + piece.length;
    setTrigger(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  /** Call first from the text box's onKeyDown; returns true when the picker used the key. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(`${trigger.mode}:${trigger.start}`);
      return true;
    }
    if (shown.length === 0) return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % shown.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + shown.length) % shown.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      insert(shown[active]!);
      return true;
    }
    return false;
  };

  const label = trigger?.mode === 'command' ? 'Commands' : 'Files';
  const popover = open ? (
    <div
      id={id}
      role="listbox"
      aria-label={label}
      className="absolute right-3 bottom-full left-3 z-30 mb-2 max-h-72 overflow-y-auto rounded-xl border border-border-popover bg-popover p-1 shadow-card"
    >
      {shown.length === 0 ? (
        <div className="px-3 py-2 text-[13px] text-muted">
          {trigger?.mode === 'command'
            ? 'No matching commands'
            : source
              ? 'No matching files'
              : 'Open a folder first'}
        </div>
      ) : (
        shown.map((item, i) => (
          <div
            key={item.value}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              insert(item);
            }}
            className={`flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] ${
              i === active ? 'bg-raised' : ''
            }`}
          >
            {trigger?.mode === 'command' ? (
              <SquareSlash size={14} className="flex-none text-secondary" aria-hidden />
            ) : (
              <FileText size={14} className="flex-none text-secondary" aria-hidden />
            )}
            <span className="min-w-0 truncate font-mono text-[13px]">{item.label}</span>
            {item.description ? (
              <span className="min-w-0 truncate text-[12px] text-secondary">
                {item.description}
              </span>
            ) : null}
          </div>
        ))
      )}
    </div>
  ) : null;

  const textareaProps = {
    'aria-controls': open ? id : undefined,
    'aria-activedescendant': open && shown.length ? `${id}-${active}` : undefined,
    onSelect: refresh,
    onClick: refresh,
  };

  return { open, onKeyDown, popover, textareaProps };
}
