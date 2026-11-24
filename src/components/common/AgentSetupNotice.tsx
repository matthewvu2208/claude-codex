import { KeyRound, LogIn, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AGENT_LABELS, type AgentId } from '../../../shared/agents';
import type { AccountStatus } from '../../../shared/events';
import { api } from '../../lib/ipc';
import { AgentIcon } from './AgentIcon';

/** Ready to chat: installed and signed in (an API key counts). */
export function agentReady(status: AccountStatus | undefined): boolean {
  return !!status && status.installed && status.signedIn;
}

const INSTALL: Record<AgentId, string> = {
  claude: 'Claude Code is bundled with this app; reinstall the app if it is missing.',
  codex: 'Install the Codex CLI, then check again:',
};

/**
 * Shown above the message box while the chosen agent cannot answer yet: how to sign in or
 * install it, right where the person is typing.
 */
export function AgentSetupNotice({
  agent,
  status,
  emphasize,
  onRecheck,
  onOpenAccounts,
}: {
  agent: AgentId;
  status: AccountStatus | undefined;
  /** The person tried to send; say that the message is kept. */
  emphasize?: boolean;
  onRecheck: () => void;
  onOpenAccounts: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status || agentReady(status)) return null;
  const label = AGENT_LABELS[agent];
  const installed = status.installed;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.agent.signIn({ agent });
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
      aria-label={`${label} setup`}
      className={`flex flex-col gap-2.5 rounded-[14px] border bg-surface px-4 py-3.5 ${emphasize ? 'border-attention' : 'border-border-card'}`}
    >
      <div className="flex items-center gap-2.5 text-[15px]">
        <AgentIcon agent={agent} size={18} />
        <span className="flex-1">
          {installed
            ? `Sign in to ${label} to start chatting.`
            : `${label} is not installed on this computer.`}
          {emphasize ? <span role="alert"> Your message is kept.</span> : null}
        </span>
      </div>
      {installed ? (
        <p className="m-0 text-[13px] text-secondary">
          {agent === 'claude'
            ? 'Sign-in opens Claude Code’s own login in a terminal. Finish it there, then come back.'
            : 'Sign-in opens ChatGPT’s login in your browser. Finish it there, then come back.'}{' '}
          You can also use an API key.
        </p>
      ) : (
        <p className="m-0 text-[13px] text-secondary">
          {INSTALL[agent]}{' '}
          {agent === 'codex' ? (
            <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-primary">
              npm install -g @openai/codex
            </code>
          ) : null}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {installed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void signIn()}
            className="flex h-9 items-center gap-2 rounded-lg bg-action px-3 text-[14px] text-on-action hover:brightness-110 disabled:opacity-50"
          >
            <LogIn size={15} aria-hidden />
            Sign in to {label}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenAccounts}
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-raised"
        >
          <KeyRound size={15} aria-hidden />
          Use an API key
        </button>
        <button
          type="button"
          onClick={onRecheck}
          className="flex h-9 items-center gap-2 rounded-lg px-3 text-[14px] text-secondary hover:bg-raised"
        >
          <RefreshCw size={15} aria-hidden />
          Check again
        </button>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
