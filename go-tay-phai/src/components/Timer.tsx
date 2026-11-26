import { useStrings } from '../i18n';

interface Props {
  mode: 'timed' | 'words';
  durationSec: number;
  elapsed: number;
  wordsDone: number;
  wordCount: number;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Timer({ mode, durationSec, elapsed, wordsDone, wordCount }: Props) {
  const t = useStrings();
  if (mode === 'timed') {
    return (
      <div
        className="flex min-w-24 items-center justify-center rounded-lg bg-accent-soft px-4 py-2 font-mono text-2xl text-text tabular-nums"
        role="timer"
        aria-label={t.test.timeLeft}
      >
        {formatClock(durationSec - elapsed)}
      </div>
    );
  }
  return (
    <div className="flex min-w-24 flex-col justify-center rounded-lg bg-accent-soft px-4 py-2 text-center text-text">
      <div className="font-mono text-2xl tabular-nums" aria-label={t.test.elapsed}>
        {formatClock(Math.floor(elapsed))}
      </div>
      <div className="text-sm">{t.test.wordsProgress(wordsDone, wordCount)}</div>
    </div>
  );
}
