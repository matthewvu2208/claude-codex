interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}

/** Row of mouse-friendly toggle buttons (no dropdown, no modifier keys). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={`rounded-md border px-3 py-1.5 text-base ${
                active
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border bg-surface text-text hover:bg-highlight'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
