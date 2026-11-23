import { KeyRound, LogIn, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AGENT_LABELS, type AgentId } from '../../../shared/agents';
import type { AccountStatus } from '../../../shared/events';
import { api } from '../../lib/ipc';
import { AgentIcon } from '../common/AgentIcon';

interface AccountsDialogProps {
  accounts: Partial<Record<AgentId, AccountStatus>>;
  onClose: () => void;
  onChanged: () => void;
}

function describe(s: AccountStatus | undefined): string {
  if (!s) return 'Checking…';
  if (!s.installed) return s.error ?? 'Not available on this system';
  if (!s.signedIn) return 'Not signed in';
  return (
    [s.method, s.plan && s.plan !== s.method ? s.plan : null].filter(Boolean).join(' · ') ||
    'Signed in'
  );
}

function AgentAccount({
  agent,
  status,
  onChanged,
}: {
  agent: AgentId;
  status: AccountStatus | undefined;
  onChanged: () => void;
}) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = AGENT_LABELS[agent];
  const keyName = agent === 'claude' ? 'Anthropic API key' : 'OpenAI API key';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={`${label} account`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-control p-4"
    >
      <div className="flex items-center gap-2.5">
        <AgentIcon agent={agent} size={18} />
        <span className="flex-1 text-[15px]">{label}</span>
        <span className="text-[13px] text-secondary" data-testid={`${agent}-account-status`}>
          {describe(status)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.agent.signIn({ agent }))}
          className="flex h-9 items-center gap-2 rounded-lg bg-action px-3 text-[14px] text-on-action hover:brightness-110 disabled:opacity-50"
        >
          <LogIn size={15} aria-hidden />
          Sign in to {label}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onChanged}
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-raised"
        >
          <RefreshCw size={15} aria-hidden />
          Check again
        </button>
      </div>
      <p className="m-0 text-[13px] text-muted">
        Sign-in opens {label}&apos;s own login{' '}
        {agent === 'codex' ? 'in your browser' : 'in a terminal'}. This app never sees your password
        or tokens.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim())
            void run(() => api.agent.setApiKey({ agent, key: key.trim() })).then(() => setKey(''));
        }}
      >
        <label className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-input px-2.5">
          <KeyRound size={15} className="text-muted" aria-hidden />
          <input
            type="password"
            autoComplete="off"
            aria-label={keyName}
            placeholder={status?.hasApiKey ? `${keyName} saved` : keyName}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !key.trim()}
          className="h-9 rounded-lg border border-border px-3 text-[14px] hover:bg-raised disabled:opacity-50"
        >
          Save key
        </button>
        {status?.hasApiKey ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.agent.setApiKey({ agent, key: null }))}
            className="h-9 rounded-lg px-3 text-[14px] text-secondary hover:bg-raised"
          >
            Remove key
          </button>
        ) : null}
      </form>
      <p className="m-0 text-[12px] text-muted">
        API keys are encrypted with your system keychain and stay on this device.
      </p>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Settings › Accounts. Sign-in always goes through each vendor's own flow. */
export function AccountsDialog({ accounts, onClose, onChanged }: AccountsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Accounts"
      onClose={onClose}
      className="m-auto w-[560px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-card bg-surface p-0 text-primary shadow-card backdrop:bg-black/50"
    >
      <div className="flex items-center border-b border-divider px-5 py-3.5">
        <h2 className="m-0 flex-1 text-[16px] font-normal">Accounts</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-raised"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <AgentAccount agent="claude" status={accounts.claude} onChanged={onChanged} />
        <AgentAccount agent="codex" status={accounts.codex} onChanged={onChanged} />
      </div>
    </dialog>
  );
}
