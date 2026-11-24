import { useRail } from '../../stores/rail';
import { buildOutline } from '../../lib/panels';
import type { ThreadItem } from '../../lib/thread';

export function OutlinePanel({ items }: { items: readonly ThreadItem[] }) {
  const scrollTo = useRail((s) => s.scrollTo);
  const entries = buildOutline(items);
  if (entries.length === 0) {
    return (
      <p className="m-0 p-4 text-[13px] text-muted">
        The outline fills in as the conversation grows.
      </p>
    );
  }
  return (
    <nav aria-label="Outline" className="flex flex-col overflow-y-auto p-2">
      {entries.map((e, i) => (
        <button
          key={`${e.index}-${i}`}
          type="button"
          onClick={() => scrollTo(e.index)}
          className={`truncate rounded-md py-1.5 pr-2 text-left text-[13px] hover:bg-raised ${
            e.level === 0 ? 'pl-2 text-primary' : 'pl-6 text-secondary'
          }`}
        >
          {e.label}
        </button>
      ))}
    </nav>
  );
}
