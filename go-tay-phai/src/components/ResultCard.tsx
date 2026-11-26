import { useStrings } from '../i18n';
import type { Score } from '../lib/scoring';
import type { WordResult } from '../lib/scoring';

interface Props {
  score: Score;
  results: readonly WordResult[];
  saved: boolean | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-lg text-text tabular-nums">{value}</dd>
    </div>
  );
}

export function ResultCard({ score, results, saved }: Props) {
  const t = useStrings();
  const wrong = results.filter((r) => !r.correct);
  return (
    <section
      aria-labelledby="result-title"
      className="rounded-lg border border-border bg-surface p-6"
    >
      <h2 id="result-title" className="sr-only">
        {t.result.title}
      </h2>
      <div className="text-center">
        <p className="font-mono text-6xl font-semibold text-accent tabular-nums">{score.wpm}</p>
        <p className="mt-1 text-base text-text">{t.result.wpm}</p>
        <p className="text-sm text-muted">{t.result.wpmLong}</p>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <dl>
          <Stat label={t.result.keystrokes} value={`${score.correctChars} | ${score.wrongChars}`} />
          <Stat label={t.result.accuracy} value={`${(score.accuracy * 100).toFixed(1)}%`} />
          <Stat label={t.result.correctWords} value={String(score.correctWords)} />
          <Stat label={t.result.wrongWords} value={String(score.wrongWords)} />
          <Stat label={t.result.wordsPerMin} value={String(score.wordsPerMin)} />
          <Stat label={t.result.keysPerMin} value={String(score.keysPerMin)} />
          <Stat label={t.result.rawWpm} value={String(score.rawWpm)} />
        </dl>
        <div>
          <h3 className="mb-2 text-base text-muted">{t.result.wrongList}</h3>
          {wrong.length === 0 ? (
            <p className="text-text">{t.result.noWrong}</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-auto text-lg">
              {wrong.map((w, i) => (
                <li key={i}>
                  <span className="text-ok">{w.target}</span>
                  <span className="text-muted"> → </span>
                  <span className="text-bad">{w.typed}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {saved !== null && (
        <p className="mt-4 text-sm text-muted">{saved ? t.result.saved : t.result.notSaved}</p>
      )}
    </section>
  );
}
