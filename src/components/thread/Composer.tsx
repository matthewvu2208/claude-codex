import { ArrowUp, Plus, Square } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { AgentId } from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import { AgentControls, type AgentSettings } from '../common/AgentControls';
import { usePicker } from '../common/usePicker';

interface ComposerProps {
  sessionId: string;
  agent: AgentId;
  agentLabel: string;
  models: ModelInfo[] | undefined;
  settings: AgentSettings;
  fallbackModelLabel: string;
  onSettingsChange: (patch: Partial<AgentSettings>) => void;
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const toolButton = 'h-9 rounded-lg px-3 text-[15px] text-row hover:bg-raised';

/** Sticky reply box. Enter sends, Shift+Enter adds a line, Esc stops a running turn. */
export function Composer({
  sessionId,
  agent,
  agentLabel,
  models,
  settings,
  fallbackModelLabel,
  onSettingsChange,
  running,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const picker = usePicker({ textareaRef, text, setText, source: { sessionId }, agent });

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (picker.onKeyDown(e)) return;
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
      className="relative flex flex-col gap-2 rounded-[18px] border border-border-card bg-surface px-3.5 py-3 shadow-card focus-within:border-border-strong"
    >
      {picker.popover}
      <textarea
        ref={textareaRef}
        aria-label="Message"
        placeholder={`Reply to ${agentLabel}…`}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        {...picker.textareaProps}
        className="max-h-60 resize-none bg-transparent px-2 py-1.5 text-[16px] leading-normal text-primary outline-none focus-visible:outline-none [field-sizing:content]"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Add context"
          title="Reference a file (@)"
          onClick={() => {
            setText((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}@`);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          className="flex size-10 items-center justify-center rounded-[10px] text-label hover:bg-raised"
        >
          <Plus size={20} strokeWidth={1.8} aria-hidden />
        </button>
        <AgentControls
          agent={agent}
          models={models}
          value={settings}
          fallbackModelLabel={fallbackModelLabel}
          onChange={onSettingsChange}
          buttonClassName={toolButton}
        />
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
