import { ArrowUp, ChevronDown, CornerDownLeft, Folder, Plus } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AgentId } from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import { AgentControls, type AgentSettings } from '../common/AgentControls';
import { usePicker } from '../common/usePicker';

interface CommandBoxProps {
  agent: AgentId;
  folderId: string | null;
  folderName: string | null;
  onChooseFolder: (at: { x: number; y: number }) => void;
  models: ModelInfo[] | undefined;
  settings: AgentSettings;
  fallbackModelLabel: string;
  onSettingsChange: (patch: Partial<AgentSettings>) => void;
  worktreeAvailable: boolean;
  onStart: (task: { text: string; worktree: boolean }) => void;
}

const toolButton = 'h-9 rounded-lg px-3 text-[15px] text-row hover:bg-raised';

export function CommandBox({
  agent,
  folderId,
  folderName,
  onChooseFolder,
  models,
  settings,
  fallbackModelLabel,
  onSettingsChange,
  worktreeAvailable,
  onStart,
}: CommandBoxProps) {
  const [text, setText] = useState('');
  const [worktree, setWorktree] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const picker = usePicker({
    textareaRef,
    text,
    setText,
    source: folderId ? { folderId } : null,
    agent,
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !folderName) return;
    onStart({ text, worktree: worktree && worktreeAvailable });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (picker.onKeyDown(e)) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className="relative flex flex-col rounded-[18px] border border-border-card bg-surface shadow-card"
      aria-label="New session"
    >
      <div className="flex flex-wrap items-center gap-5 border-b border-divider px-[18px] py-3">
        <button
          type="button"
          aria-label={folderName ? `Workspace folder: ${folderName}` : 'Open folder…'}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onChooseFolder({ x: Math.round(r.left), y: Math.round(r.bottom + 4) });
          }}
          className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[15px] text-primary hover:bg-raised"
        >
          <Folder size={17} strokeWidth={1.7} className="text-secondary" aria-hidden />
          {folderName ?? 'Open folder…'}
          <ChevronDown size={14} strokeWidth={2} className="text-secondary" aria-hidden />
        </button>
        <label
          className={`flex min-h-9 items-center gap-2.5 text-[15px] ${worktreeAvailable ? 'text-label' : 'text-disabled'}`}
          title={
            worktreeAvailable
              ? 'Work in a separate git worktree and branch'
              : 'This folder is not a git repository'
          }
        >
          <input
            type="checkbox"
            checked={worktree && worktreeAvailable}
            disabled={!worktreeAvailable}
            onChange={(e) => setWorktree(e.target.checked)}
            className="size-[18px] accent-action"
          />
          Worktree
        </label>
      </div>
      <div className="relative flex flex-col">
        {picker.popover}
        <textarea
          ref={textareaRef}
          aria-label="Task"
          placeholder="Describe a task, or paste an error to debug..."
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          {...picker.textareaProps}
          className="resize-none bg-transparent px-[22px] pt-[18px] pb-1.5 text-[17px] leading-normal text-primary outline-none focus-visible:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-2 pb-3.5">
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
          placement="below"
        />
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-[14px] text-muted" aria-hidden>
          <CornerDownLeft size={15} strokeWidth={1.8} />
          start
        </span>
        <button
          type="submit"
          aria-label="Start session"
          disabled={!folderName}
          title={folderName ? undefined : 'Open a folder first'}
          className="ml-2 flex size-12 items-center justify-center rounded-full bg-action text-on-action hover:brightness-110 disabled:opacity-50"
        >
          <ArrowUp size={20} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </form>
  );
}
