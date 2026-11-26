import { useLayoutEffect, useRef } from 'react';
import type { WordResult } from '../lib/scoring';

interface Props {
  words: readonly string[];
  currentIndex: number;
  results: readonly WordResult[];
  onTrack: boolean;
  fontSize: number;
  label: string;
  onClick?: () => void;
}

const LINE_HEIGHT = 1.6;
/** Upcoming words rendered after the current one (enough for two lines). */
const LOOKAHEAD = 80;

/**
 * Two lines of words, 10FastFingers style. The line holding the current word is
 * always the top line: when the current word wraps to line 2, the box scrolls.
 */
export function WordBox({
  words,
  currentIndex,
  results,
  onTrack,
  fontSize,
  label,
  onClick,
}: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const scroll = (): void => {
      const cur = currentRef.current;
      if (inner && cur) inner.style.transform = `translateY(${-cur.offsetTop}px)`;
    };
    scroll();
    if (!inner) return;
    const ro = new ResizeObserver(scroll);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [currentIndex, fontSize]);

  const lineHeightPx = fontSize * LINE_HEIGHT;
  const visible = words.slice(0, currentIndex + LOOKAHEAD);

  return (
    <div
      role="group"
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border border-border bg-surface px-4 py-3"
    >
      {/* Clips to exactly two lines so marks of the third line never peek in. */}
      <div className="overflow-hidden" style={{ height: lineHeightPx * 2 }}>
        <div
          ref={innerRef}
          className="relative flex flex-wrap content-start gap-x-[0.5em]"
          style={{ fontSize, lineHeight: LINE_HEIGHT }}
        >
          {visible.map((word, i) => {
            let cls = 'rounded px-1 ';
            if (i < currentIndex) {
              cls += results[i]?.correct
                ? 'text-ok'
                : 'text-bad underline decoration-wavy decoration-2 underline-offset-4';
            } else if (i === currentIndex) {
              cls += onTrack ? 'bg-highlight text-text' : 'bg-bad-soft text-bad';
            } else {
              cls += 'text-text';
            }
            return (
              <span
                key={i}
                ref={i === currentIndex ? currentRef : undefined}
                aria-current={i === currentIndex ? 'true' : undefined}
                className={cls}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
