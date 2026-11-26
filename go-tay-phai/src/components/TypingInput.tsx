import { useRef, type RefObject } from 'react';

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  wrong: boolean;
  fontSize: number;
  label: string;
  lang: 'vi' | 'en';
  onValue: (value: string, composing: boolean) => void;
  onKey: (code: string) => void;
}

/**
 * A real <input> so the OS input method (Unikey, EVKey, macOS Telex) works.
 * The value is read in `input` events, never rebuilt from keydown. While a
 * composition is active, submission waits for compositionend.
 * The DOM owns the value (uncontrolled) so React never fights the IME.
 */
export function TypingInput({
  inputRef,
  disabled,
  wrong,
  fontSize,
  label,
  lang,
  onValue,
  onKey,
}: Props) {
  const composing = useRef(false);

  const emit = (el: HTMLInputElement, isComposing: boolean): void => {
    const value = el.value;
    onValue(value, isComposing);
    // A word was submitted (or a lone space typed): clear right away so a late
    // duplicate input event cannot submit the same text again.
    if (!isComposing && /\s$/.test(value)) el.value = '';
  };

  return (
    <input
      ref={inputRef}
      type="text"
      lang={lang}
      aria-label={label}
      aria-invalid={wrong}
      disabled={disabled}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="next"
      className={`w-full rounded-lg border-2 bg-surface px-4 py-2 text-text outline-none disabled:opacity-60 ${
        wrong ? 'border-bad' : 'border-border focus:border-accent'
      }`}
      style={{ fontSize }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        emit(e.currentTarget, false);
      }}
      onChange={(e) => {
        const native = e.nativeEvent as InputEvent;
        emit(e.currentTarget, composing.current || native.isComposing === true);
      }}
      onKeyDown={(e) => {
        // Enter does nothing while typing, so a slip never restarts the test.
        if (e.code === 'Enter' || e.code === 'NumpadEnter') e.preventDefault();
        if (!e.repeat && e.code) onKey(e.code);
      }}
    />
  );
}
