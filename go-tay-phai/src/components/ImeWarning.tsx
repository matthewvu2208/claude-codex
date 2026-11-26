import { useStrings } from '../i18n';
import type { ImeIssue } from '../lib/imeCheck';

/** Reminder only: never blocks the test. */
export function ImeWarning({ issue }: { issue: ImeIssue }) {
  const t = useStrings();
  return (
    <div role="status" aria-live="polite" className="min-h-0">
      {issue && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-base text-warn">
          {issue === 'vi-ime-on' ? t.ime.onInEnglish : t.ime.offInVietnamese}
        </p>
      )}
    </div>
  );
}
