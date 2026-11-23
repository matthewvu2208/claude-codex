import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ApprovalDecision } from '../../../shared/events';
import type { ThreadItem } from '../../lib/thread';
import { ApprovalCard, ErrorRow, NoticeRow, UserBubble, WorkedRow } from './items';
import { Markdown } from './Markdown';

interface ThreadProps {
  items: ThreadItem[];
  agentLabel: string;
  onDecide: (requestId: string, d: ApprovalDecision) => void;
  /** Rendered after the last item, inside the scroll area (the sticky composer). */
  footer: ReactNode;
}

function renderItem(item: ThreadItem, agentLabel: string, onDecide: ThreadProps['onDecide']) {
  switch (item.kind) {
    case 'user':
      return <UserBubble text={item.text} />;
    case 'turn':
      return <WorkedRow item={item} />;
    case 'text':
      return <Markdown text={item.text} />;
    case 'approval':
      return (
        <ApprovalCard
          item={item}
          agentLabel={agentLabel}
          onDecide={(d) => onDecide(item.requestId, d)}
        />
      );
    case 'error':
      return <ErrorRow message={item.message} />;
    case 'notice':
      return <NoticeRow message={item.message} />;
  }
}

const NEAR_BOTTOM = 48;

/**
 * Virtualized thread. Follows new content while the reader is at the bottom; once they
 * scroll up it stays put and shows "Jump to latest".
 */
export function Thread({ items, agentLabel, onDecide, footer }: ThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is designed for this.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (i) => items[i]!.key,
  });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    atBottomRef.current = near;
    setAtBottom(near);
  }, []);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow along while at the bottom: new items, streamed text and late measurements.
  const lastItem = items[items.length - 1];
  const tail = lastItem
    ? `${items.length}:${lastItem.kind === 'text' ? lastItem.text.length : ''}`
    : '';
  const total = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    if (atBottomRef.current) scrollToEnd();
  }, [tail, total, scrollToEnd]);

  useEffect(() => {
    scrollToEnd();
  }, [scrollToEnd]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-7 pt-7"
        data-testid="thread-scroll"
      >
        <div
          className="relative w-full max-w-[860px] flex-none"
          style={{ height: virtualizer.getTotalSize() }}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
        >
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index]!;
            return (
              <div
                key={v.key}
                ref={virtualizer.measureElement}
                data-index={v.index}
                data-kind={item.kind}
                className="absolute top-0 left-0 flex w-full flex-col pb-[22px]"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                {renderItem(item, agentLabel, onDecide)}
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-4 mt-auto w-full max-w-[860px] flex-none pb-4">{footer}</div>
      </div>
      {!atBottom ? (
        <button
          type="button"
          onClick={() => {
            scrollToEnd();
            atBottomRef.current = true;
            setAtBottom(true);
          }}
          className="absolute bottom-40 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] text-primary shadow-card hover:bg-raised"
        >
          <ArrowDown size={14} aria-hidden />
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
