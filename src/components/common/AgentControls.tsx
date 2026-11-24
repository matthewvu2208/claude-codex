import { Shield, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AGENT_LABELS,
  PERMISSION_LABELS,
  PERMISSIONS,
  type AgentId,
  type Permission,
} from '../../../shared/agents';
import type { ModelInfo } from '../../../shared/events';
import { Menu } from './Menu';

const EFFORT_LABELS: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};
export const effortLabel = (e: string | null | undefined) =>
  e ? (EFFORT_LABELS[e] ?? e.charAt(0).toUpperCase() + e.slice(1)) : 'Default';

const PERMISSION_HINTS: Record<Permission, string> = {
  ask: 'Asks before commands and edits',
  'auto-edit': 'Edits files without asking; asks before commands',
  'read-only': 'Reads and plans; changes nothing',
  full: 'Runs everything without asking',
};

export interface AgentSettings {
  model: string | null;
  effort: string | null;
  permission: Permission;
}

interface AgentControlsProps {
  agent: AgentId;
  models: ModelInfo[] | undefined;
  value: AgentSettings;
  /** Shown while models are loading or unknown. */
  fallbackModelLabel: string;
  onChange: (patch: Partial<AgentSettings>) => void;
  buttonClassName: string;
  placement?: 'above' | 'below';
}

function FullAccessDialog({
  agent,
  onConfirm,
  onCancel,
}: {
  agent: AgentId;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Full access"
      onClose={onCancel}
      className="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-card bg-surface p-5 text-primary shadow-card backdrop:bg-black/50"
    >
      <div className="flex items-center gap-2.5">
        <ShieldAlert size={18} className="text-attention" aria-hidden />
        <h2 className="m-0 text-[16px] font-normal">Give {AGENT_LABELS[agent]} full access?</h2>
      </div>
      <p className="mt-3 mb-5 text-[14px] text-secondary">
        {AGENT_LABELS[agent]} will run commands and change files without asking, including outside
        this folder. Use it only in a folder you trust.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="h-9 rounded-lg px-3.5 text-[14px] text-secondary hover:bg-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            ref.current?.close();
          }}
          className="h-9 rounded-lg bg-action px-3.5 text-[14px] text-on-action hover:brightness-110"
        >
          Allow full access
        </button>
      </div>
    </dialog>
  );
}

/** Model, effort and permission menus; effort choices come from the selected model. */
export function AgentControls({
  agent,
  models,
  value,
  fallbackModelLabel,
  onChange,
  buttonClassName,
  placement,
}: AgentControlsProps) {
  const [confirmFull, setConfirmFull] = useState(false);
  const current =
    models?.find((m) => m.value === value.model) ?? (value.model ? undefined : models?.[0]);
  const modelLabel = current?.displayName ?? fallbackModelLabel;
  const efforts = current?.efforts ?? [];

  return (
    <>
      <Menu
        ariaLabel={`Model: ${modelLabel}`}
        buttonClassName={buttonClassName}
        placement={placement ?? 'above'}
        value={current?.value ?? value.model}
        options={(models ?? []).map((m) => ({
          value: m.value,
          label: m.displayName,
          description: m.description,
        }))}
        emptyLabel={`Sign in to ${AGENT_LABELS[agent]} to see models`}
        onSelect={(model) => {
          const next = models?.find((m) => m.value === model);
          // Keep the effort when the new model supports it, else use the model's default.
          const effort =
            value.effort && next?.efforts.includes(value.effort)
              ? value.effort
              : (next?.defaultEffort ?? next?.efforts[0] ?? null);
          onChange({ model, ...(effort && effort !== value.effort ? { effort } : {}) });
        }}
      >
        {modelLabel}
      </Menu>
      <Menu
        ariaLabel={`Effort: ${effortLabel(value.effort)}`}
        buttonClassName={buttonClassName}
        placement={placement ?? 'above'}
        value={value.effort}
        options={efforts.map((e) => ({ value: e, label: effortLabel(e) }))}
        emptyLabel="This model has one effort level"
        onSelect={(effort) => onChange({ effort })}
      >
        {effortLabel(value.effort)}
      </Menu>
      <Menu
        ariaLabel={`Permission mode: ${PERMISSION_LABELS[value.permission]}`}
        buttonClassName={`${buttonClassName} flex items-center gap-[7px]`}
        placement={placement ?? 'above'}
        value={value.permission}
        options={PERMISSIONS.map((p) => ({
          value: p,
          label: PERMISSION_LABELS[p],
          description: PERMISSION_HINTS[p],
        }))}
        onSelect={(p) => {
          if (p === 'full' && value.permission !== 'full') setConfirmFull(true);
          else onChange({ permission: p as Permission });
        }}
      >
        <Shield size={16} strokeWidth={1.8} aria-hidden />
        {PERMISSION_LABELS[value.permission]}
      </Menu>
      {confirmFull ? (
        <FullAccessDialog
          agent={agent}
          onConfirm={() => onChange({ permission: 'full' })}
          onCancel={() => setConfirmFull(false)}
        />
      ) : null}
    </>
  );
}
