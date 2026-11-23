import { ArrowUp, Plus, Shield, Square } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { PERMISSION_LABELS, type Permission } from '../../../shared/agents';

interface ComposerProps {
  agentLabel: string;
  modelLabel: string;
  effortLabel: string;
  permission: Permission;
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const toolButton = 'h-9 rounded-lg px-3 text-[15px] text-row hover:bg-raised';

/** Sticky reply box. Enter sends, Shift+Enter adds a line, Esc stops a running turn. */
export function Composer({
  agentLabel,
  modelLabel,
  effortLabel,
  permission,
  running,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState('');

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && running) {
      e.preventDefault();
      onStop();
    }
  };

  return (
    <form
      aria-label="Reply"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex flex-col gap-2 rounded-[18px] border border-border-card bg-surface px-3.5 py-3 shadow-card focus-within:border-border-strong"
    >
      <textarea
        aria-label="Message"
        placeholder={`Reply to ${agentLabel}…`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-60 resize-none bg-transparent px-2 py-1.5 text-[16px] leading-normal text-primary outline-none focus-visible:outline-none [field-sizing:content]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Add context"
          className="flex size-10 items-center justify-center rounded-[10px] text-label hover:bg-raised"
        >
          <Plus size={20} strokeWidth={1.8} aria-hidden />
        </button>
        <button type="button" aria-label={`Model: ${modelLabel}`} className={toolButton}>
          {modelLabel}
        </button>
        <button type="button" aria-label={`Effort: ${effortLabel}`} className={toolButton}>
          {effortLabel}
        </button>
        <button
          type="button"
          aria-label={`Permission mode: ${PERMISSION_LABELS[permission]}`}
          className={`${toolButton} flex items-center gap-[7px]`}
        >
          <Shield size={16} strokeWidth={1.8} aria-hidden />
          {PERMISSION_LABELS[permission]}
        </button>
        <span className="flex-1" />
        {running ? (
          <button
            type="button"
            aria-label="Stop"
            title="Stop (Esc)"
            onClick={onStop}
            className="flex size-12 items-center justify-center rounded-full bg-action text-on-action hover:brightness-110"
          >
            <Square size={16} fill="currentColor" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="flex size-12 items-center justify-center rounded-full bg-action text-on-action hover:brightness-110 disabled:opacity-50"
          >
            <ArrowUp size={20} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}
