import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface MenuOption {
  value: string;
  label: string;
  description?: string;
}

interface MenuProps {
  /** Accessible name, e.g. "Model: Opus 5.5". */
  ariaLabel: string;
  /** Button content. */
  children: ReactNode;
  options: MenuOption[];
  value: string | null;
  onSelect: (value: string) => void;
  buttonClassName: string;
  /** Opens above the button (composer) or below it. */
  placement?: 'above' | 'below';
  disabled?: boolean;
  emptyLabel?: string;
}

/** A single-choice menu: Enter/Space/ArrowDown open it, arrows move, Enter picks, Esc closes. */
export function Menu({
  ariaLabel,
  children,
  options,
  value,
  onSelect,
  buttonClassName,
  placement = 'above',
  disabled,
  emptyLabel = 'Nothing to choose',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const openMenu = () => {
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (
        !listRef.current?.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const pick = (i: number) => {
    const o = options[i];
    if (o) onSelect(o.value);
    close();
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        className={buttonClassName}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu();
          }
        }}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={listRef}
          id={id}
          role="menu"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`absolute left-0 z-30 max-h-80 min-w-[220px] overflow-y-auto rounded-xl border border-border-popover bg-popover p-1 shadow-card outline-none ${
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Tab') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              pick(active);
            }
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-muted">{emptyLabel}</div>
          ) : (
            options.map((o, i) => (
              <div
                key={o.value}
                role="menuitemradio"
                aria-checked={o.value === value}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex cursor-default items-start gap-2 rounded-lg px-2.5 py-2 text-[14px] ${
                  i === active ? 'bg-raised' : ''
                }`}
              >
                <span className="mt-0.5 flex size-4 flex-none items-center justify-center">
                  {o.value === value ? <Check size={14} aria-hidden /> : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-primary">{o.label}</span>
                  {o.description ? (
                    <span className="text-[12px] text-secondary">{o.description}</span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </span>
  );
}
