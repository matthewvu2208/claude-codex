import { FolderOpen, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AGENT_IDS, AGENT_LABELS, type AgentId } from '../../../shared/agents';
import type { AccountStatus, ModelInfo } from '../../../shared/events';
import type { IpcOutput, Settings, TextSize } from '../../../shared/ipc';
import { api } from '../../lib/ipc';
import { SHORTCUTS } from '../../lib/shortcuts';
import { AgentControls, type AgentSettings } from '../common/AgentControls';
import { AgentIcon } from '../common/AgentIcon';
import { Kbd } from '../common/Kbd';
import { AgentAccount } from './AgentAccount';

export const SETTINGS_TABS = ['accounts', 'general', 'shortcuts'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
const TAB_LABELS: Record<SettingsTab, string> = {
  accounts: 'Accounts',
  general: 'General',
  shortcuts: 'Shortcuts',
};

const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  larger: 'Larger',
};

interface SettingsDialogProps {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  accounts: Partial<Record<AgentId, AccountStatus>>;
  onAccountsChanged: () => void;
  /** Defaults for new sessions (also what Welcome starts with). */
  defaultAgent: AgentId;
  onDefaultAgent: (agent: AgentId) => void;
  defaults: Record<AgentId, AgentSettings>;
  onDefaults: (agent: AgentId, patch: Partial<AgentSettings>) => void;
  models: Partial<Record<AgentId, ModelInfo[]>>;
  onClose: () => void;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider py-3.5 last:border-b-0">
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-[14px]">{label}</span>
        {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const select =
  'h-9 rounded-lg border border-border bg-input px-2.5 text-[14px] text-primary outline-none focus-visible:border-border-strong';
const button =
  'flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[14px] hover:bg-raised';
const controlButton =
  'flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] text-row hover:bg-raised';

function General(props: SettingsDialogProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<IpcOutput<'app:info'> | null>(null);
  useEffect(() => {
    void api.settings.get().then(setSettings);
    void api.app.info().then(setInfo);
  }, []);
  const save = (patch: Settings) => void api.settings.set(patch).then(setSettings);

  return (
    <div className="flex flex-col">
      <h3 className="m-0 mb-1 text-[13px] font-normal text-muted">New sessions</h3>
      <Row label="Agent" hint="Selected on the Welcome screen">
        <div role="radiogroup" aria-label="Default agent" className="flex gap-2">
          {AGENT_IDS.map((agent) => (
            <button
              key={agent}
              type="button"
              role="radio"
              aria-checked={props.defaultAgent === agent}
              onClick={() => props.onDefaultAgent(agent)}
              className={`${controlButton} ${props.defaultAgent === agent ? 'border-border-strong bg-card-selected text-strong' : ''}`}
            >
              <AgentIcon agent={agent} size={14} />
              {AGENT_LABELS[agent]}
            </button>
          ))}
        </div>
      </Row>
      {AGENT_IDS.map((agent) => (
        <Row
          key={agent}
          label={`${AGENT_LABELS[agent]} model, effort and access`}
          hint="Each session can change these later"
        >
          <div className="flex flex-wrap items-center gap-1.5" data-testid={`defaults-${agent}`}>
            <AgentControls
              agent={agent}
              models={props.models[agent]}
              value={props.defaults[agent]}
              fallbackModelLabel="Default model"
              onChange={(patch) => props.onDefaults(agent, patch)}
              buttonClassName={controlButton}
              placement="below"
            />
          </div>
        </Row>
      ))}

      <h3 className="m-0 mt-4 mb-1 text-[13px] font-normal text-muted">Sub-sessions</h3>
      <Row
        label="Running at once"
        hint="Per session; more requests wait for one to finish or get an error"
      >
        <select
          aria-label="Sub-sessions running at once"
          className={select}
          value={settings?.subsessionLimit ?? 3}
          onChange={(e) => save({ subsessionLimit: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Row>

      <h3 className="m-0 mt-4 mb-1 text-[13px] font-normal text-muted">Worktrees</h3>
      <Row label="Location" hint={settings?.worktreeRoot ?? info?.defaultWorktreeRoot ?? ''}>
        <button
          type="button"
          className={button}
          onClick={() =>
            void api.settings.chooseWorktreeRoot().then((p) => {
              if (p) setSettings((s) => ({ ...s, worktreeRoot: p }));
            })
          }
        >
          <FolderOpen size={15} aria-hidden />
          Choose…
        </button>
        {settings?.worktreeRoot ? (
          <button
            type="button"
            className="h-9 rounded-lg px-3 text-[14px] text-secondary hover:bg-raised"
            onClick={() => save({ worktreeRoot: null })}
          >
            Use default
          </button>
        ) : null}
      </Row>

      <h3 className="m-0 mt-4 mb-1 text-[13px] font-normal text-muted">Appearance</h3>
      <Row label="Text size">
        <select
          aria-label="Text size"
          className={select}
          value={settings?.textSize ?? 'default'}
          onChange={(e) => save({ textSize: e.target.value as TextSize })}
        >
          {Object.entries(TEXT_SIZE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Row>

      <h3 className="m-0 mt-4 mb-1 text-[13px] font-normal text-muted">Troubleshooting</h3>
      <Row label="Log file" hint="App events and errors only; no messages, files or credentials">
        <button type="button" className={button} onClick={() => void api.app.openLogs()}>
          <FolderOpen size={15} aria-hidden />
          Open log folder
        </button>
      </Row>
      {info ? <p className="m-0 mt-3 text-[12px] text-muted">Version {info.version}</p> : null}
    </div>
  );
}

function Shortcuts() {
  return (
    <table className="w-full border-collapse text-[14px]">
      <caption className="sr-only">Keyboard shortcuts</caption>
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.action} className="border-b border-divider last:border-b-0">
            <th scope="row" className="py-2.5 text-left font-normal">
              {s.action}
            </th>
            <td className="py-2.5 text-right">
              <Kbd>{s.keys}</Kbd>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Settings: Accounts (vendor sign-in, API keys), General and Shortcuts. */
export function SettingsDialog(props: SettingsDialogProps) {
  const { tab, onTab, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const onTabKey = (e: KeyboardEvent) => {
    const i = SETTINGS_TABS.indexOf(tab);
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? SETTINGS_TABS[(i + 1) % SETTINGS_TABS.length]
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? SETTINGS_TABS[(i + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length]
          : e.key === 'Home'
            ? SETTINGS_TABS[0]
            : e.key === 'End'
              ? SETTINGS_TABS[SETTINGS_TABS.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    onTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <dialog
      ref={ref}
      aria-label="Settings"
      onClose={onClose}
      className="m-auto flex h-[min(640px,calc(100vh-64px))] w-[720px] max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-border-card bg-surface p-0 text-primary shadow-card backdrop:bg-backdrop"
    >
      <div className="flex items-center border-b border-divider px-5 py-3.5">
        <h2 className="m-0 flex-1 text-[16px] font-normal">Settings</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-raised"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          onKeyDown={onTabKey}
          className="flex w-[168px] flex-none flex-col gap-1 border-r border-divider p-3"
        >
          {SETTINGS_TABS.map((t) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => onTab(t)}
              className={`h-9 rounded-lg px-3 text-left text-[14px] ${tab === t ? 'bg-raised text-strong' : 'text-secondary hover:bg-raised'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${tab}`}
          tabIndex={0}
          className="min-w-0 flex-1 overflow-y-auto p-5"
        >
          {tab === 'accounts' ? (
            <div className="flex flex-col gap-3">
              {AGENT_IDS.map((agent) => (
                <AgentAccount
                  key={agent}
                  agent={agent}
                  status={props.accounts[agent]}
                  onChanged={props.onAccountsChanged}
                />
              ))}
            </div>
          ) : tab === 'general' ? (
            <General {...props} />
          ) : (
            <Shortcuts />
          )}
        </div>
      </div>
    </dialog>
  );
}
