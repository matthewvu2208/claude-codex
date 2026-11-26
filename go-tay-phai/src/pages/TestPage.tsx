import { useCallback, useEffect, useRef, useState } from 'react';
import { ImeWarning } from '../components/ImeWarning';
import { ResultCard } from '../components/ResultCard';
import { Segmented } from '../components/Segmented';
import { Timer } from '../components/Timer';
import { TypingInput } from '../components/TypingInput';
import { WordBox } from '../components/WordBox';
import { getPool } from '../data/words';
import type { TestConfig } from '../engine/typingReducer';
import { useTypingTest } from '../engine/useTypingTest';
import { useStrings } from '../i18n';
import { randomSeed } from '../lib/generator';
import { detectImeIssue } from '../lib/imeCheck';
import type { Duration, Settings, WordSet } from '../lib/storage';
import { useSettings } from '../state/SettingsContext';

const DURATIONS: Duration[] = [15, 30, 60, 120, 0];
const WORD_COUNTS = [10, 25, 50, 100];
const FONT_STEP = 4;

function configFrom(s: Settings): TestConfig {
  return {
    lang: s.lang,
    wordSet: s.wordSet,
    mode: s.durationSec === 0 ? 'words' : 'timed',
    durationSec: s.durationSec,
    wordCount: s.wordCount,
    seed: randomSeed(),
  };
}

/** True when focus sits on a control that handles Enter itself. */
function focusOnControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, select, textarea') !== null;
}

function TypingTest({ config, onRestart }: { config: TestConfig; onRestart: () => void }) {
  const t = useStrings();
  const { settings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const test = useTypingTest(config, getPool(config.lang, config.wordSet));
  const { state } = test;
  const finished = state.status === 'finished';
  const target = state.words[state.currentIndex] ?? '';

  // Focus the input on mount (each new test mounts a fresh component).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Enter (or Esc) starts a new test, but Enter only when not mid-test.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
      if (
        e.code === 'Escape' ||
        (enter && state.status !== 'running' && !focusOnControl(e.target))
      ) {
        e.preventDefault();
        onRestart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.status, onRestart]);

  const issue = detectImeIssue(config.lang, state.results, state.currentInput, target);

  return (
    <div className="flex flex-col gap-4">
      <WordBox
        words={state.words}
        currentIndex={state.currentIndex}
        results={state.results}
        onTrack={test.onTrack}
        fontSize={settings.fontSize}
        label={t.test.wordBox}
        onClick={() => inputRef.current?.focus()}
      />
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="min-w-60 flex-1">
          <TypingInput
            inputRef={inputRef}
            disabled={finished}
            wrong={!test.onTrack}
            fontSize={settings.fontSize}
            label={t.test.inputLabel}
            lang={config.lang}
            onValue={test.input}
            onKey={test.keydown}
          />
        </div>
        <Timer
          mode={config.mode}
          durationSec={config.durationSec}
          elapsed={test.elapsed}
          wordsDone={state.results.length}
          wordCount={config.wordCount}
        />
        <button
          type="button"
          onClick={onRestart}
          className="rounded-lg bg-accent px-5 py-2 text-lg text-on-accent hover:opacity-90"
        >
          {t.test.restart}
        </button>
      </div>
      <ImeWarning issue={issue} />
      <p className="text-sm text-muted">
        {state.status === 'idle' ? t.test.startHint : finished ? t.test.restartHint : ' '}
      </p>
      {finished && test.score && (
        <ResultCard score={test.score} results={state.results} saved={test.saved} />
      )}
    </div>
  );
}

export function TestPage() {
  const t = useStrings();
  const { settings, update } = useSettings();
  const [config, setConfig] = useState(() => configFrom(settings));
  const [testId, setTestId] = useState(0);

  const restartWith = useCallback((s: Settings) => {
    setConfig(configFrom(s));
    setTestId((n) => n + 1);
  }, []);
  const restart = useCallback(() => restartWith(settings), [restartWith, settings]);

  const change = (patch: Partial<Settings>): void => {
    update(patch);
    restartWith({ ...settings, ...patch });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Segmented
          label={t.options.language}
          value={settings.lang}
          options={[
            { value: 'vi', label: t.options.langVi },
            { value: 'en', label: t.options.langEn },
          ]}
          onChange={(lang) => change({ lang })}
        />
        <Segmented<WordSet>
          label={t.options.wordSet}
          value={settings.wordSet}
          options={[
            { value: 200, label: t.options.words(200) },
            { value: 1000, label: t.options.words(1000) },
          ]}
          onChange={(wordSet) => change({ wordSet })}
        />
        <Segmented<Duration>
          label={t.options.duration}
          value={settings.durationSec}
          options={DURATIONS.map((d) => ({
            value: d,
            label: d === 0 ? t.options.unlimited : t.options.seconds(d),
          }))}
          onChange={(durationSec) => change({ durationSec })}
        />
        {settings.durationSec === 0 && (
          <Segmented<number>
            label={t.options.wordCount}
            value={settings.wordCount}
            options={WORD_COUNTS.map((n) => ({ value: n, label: String(n) }))}
            onChange={(wordCount) => change({ wordCount })}
          />
        )}
        <div role="group" aria-label={t.options.fontSize} className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t.options.fontSize}</span>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={t.options.smaller}
              onClick={() => update({ fontSize: settings.fontSize - FONT_STEP })}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-base text-text hover:bg-highlight"
            >
              A−
            </button>
            <span className="min-w-12 self-center text-center font-mono text-text tabular-nums">
              {settings.fontSize}
            </span>
            <button
              type="button"
              aria-label={t.options.larger}
              onClick={() => update({ fontSize: settings.fontSize + FONT_STEP })}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-lg text-text hover:bg-highlight"
            >
              A+
            </button>
          </div>
        </div>
      </div>
      <TypingTest key={testId} config={config} onRestart={restart} />
    </div>
  );
}
