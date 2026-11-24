import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { PANE_MAX, PANE_MIN, useRail } from '../../stores/rail';

/** Resizable side pane for the open panel. The handle drags, or moves with the arrow keys. */
export function RightPane({ title, children }: { title: string; children: ReactNode }) {
  const width = useRail((s) => s.width);
  const setWidth = useRail((s) => s.setWidth);
  const panel = useRail((s) => s.panel);
  const toggle = useRail((s) => s.toggle);
  const drag = useRef<{ x: number; w: number } | null>(null);

  return (
    <section
      aria-label={title}
      className="relative flex flex-none flex-col border-l border-border-subtle bg-sidebar"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuemin={PANE_MIN}
        aria-valuemax={PANE_MAX}
        aria-valuenow={width}
        tabIndex={0}
        className="absolute top-0 bottom-0 -left-[3px] z-10 w-[6px] cursor-col-resize hover:bg-selection/40 focus-visible:bg-selection/60"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) setWidth(drag.current.w + (drag.current.x - e.clientX));
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth(width + 24);
          if (e.key === 'ArrowRight') setWidth(width - 24);
        }}
      />
      <header className="flex h-11 flex-none items-center gap-2 border-b border-border-subtle px-3.5">
        <h2 className="m-0 flex-1 text-[14px] font-normal text-label">{title}</h2>
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={() => panel && toggle(panel)}
          className="flex size-7 items-center justify-center rounded-md text-secondary hover:bg-raised"
        >
          <X size={15} aria-hidden />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
