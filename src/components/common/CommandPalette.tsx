import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Kbd } from './Kbd';

export interface Command {
  id: string;
  label: string;
  keys?: string;
  run: () => void;
}

/** "Commands" (⌘K / Ctrl K): type to filter, arrows to move, Enter to run, Esc to close. */
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);
  const current = Math.min(active, Math.max(0, shown.length - 1));

  const run = (c: Command | undefined) => {
    if (!c) return;
    ref.current?.close();
    c.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, shown.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((current - 1 + shown.length) % Math.max(1, shown.length));
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run(shown[current]);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-label="Commands"
      onClose={onClose}
      className="mx-auto mt-[12vh] w-[520px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-card bg-surface p-0 text-primary shadow-card backdrop:bg-backdrop"
    >
      <label className="flex h-12 items-center gap-2.5 border-b border-divider px-4 text-muted">
        <Search size={16} aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-label="Search commands"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={shown[current] ? `${listId}-${shown[current].id}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-primary outline-none placeholder:text-muted"
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label="Commands"
        className="m-0 max-h-[360px] list-none overflow-y-auto p-1.5"
      >
        {shown.map((c, i) => (
          <li
            key={c.id}
            id={`${listId}-${c.id}`}
            role="option"
            aria-selected={i === current}
            onMouseMove={() => setActive(i)}
            onClick={() => run(c)}
            className={`flex h-9 cursor-default items-center rounded-lg px-3 text-[14px] ${i === current ? 'bg-raised text-strong' : 'text-row'}`}
          >
            <span className="flex-1">{c.label}</span>
            {c.keys ? <Kbd>{c.keys}</Kbd> : null}
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-3 py-2 text-[14px] text-muted">No matching commands</li>
        ) : null}
      </ul>
    </dialog>
  );
}
