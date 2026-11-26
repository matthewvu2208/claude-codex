import { useState } from 'react';
import { useStrings } from '../i18n';
import { loadResults } from '../lib/storage';

const SHOW = 50;

export function HistoryPage() {
  const t = useStrings();
  const [results] = useState(() => loadResults().slice(-SHOW).reverse());
  const fmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <h1 id="history-title" className="text-2xl font-semibold text-text">
        {t.history.title}
      </h1>
      {results.length === 0 ? (
        <p className="text-text">{t.history.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-base">
            <caption className="px-4 py-2 text-left text-sm text-muted">
              {t.history.count(results.length)}
            </caption>
            <thead className="border-b border-border text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-normal">
                  {t.history.date}
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  {t.history.lang}
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  {t.history.set}
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  {t.history.mode}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  {t.history.wpm}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  {t.history.accuracy}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  {t.history.words}
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 text-text">{fmt.format(new Date(r.createdAt))}</td>
                  <td className="px-4 py-2 text-text">
                    {r.lang === 'vi' ? t.options.langVi : t.options.langEn}
                  </td>
                  <td className="px-4 py-2 text-text">{t.options.words(r.wordSet)}</td>
                  <td className="px-4 py-2 text-text">
                    {r.mode === 'timed'
                      ? t.history.timed(r.durationSec)
                      : t.history.untimed(r.durationSec)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-text tabular-nums">{r.wpm}</td>
                  <td className="px-4 py-2 text-right font-mono text-text tabular-nums">
                    {(r.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    <span className="text-ok">{r.correctWords}</span>
                    <span className="text-muted"> / </span>
                    <span className="text-bad">{r.wrongWords}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
