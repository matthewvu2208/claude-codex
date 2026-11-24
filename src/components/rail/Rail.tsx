import {
  FolderTree,
  GitBranch,
  Globe,
  ListTree,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import { useRail, type PanelId } from '../../stores/rail';

const ITEMS: { id: PanelId; label: string; icon: LucideIcon }[] = [
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

/** The right rail (artboard 2): each icon toggles its panel. */
export function Rail() {
  const panel = useRail((s) => s.panel);
  const unseen = useRail((s) => s.unseenTerminal);
  const toggle = useRail((s) => s.toggle);
  return (
    <aside
      aria-label="Tools"
      className="flex w-[60px] flex-none flex-col items-center gap-1.5 border-l border-border-subtle bg-rail py-3.5"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={id === 'terminal' && unseen ? `${label}, new output` : label}
          aria-pressed={panel === id}
          title={label}
          onClick={() => toggle(id)}
          className={`relative flex size-11 items-center justify-center rounded-[10px] text-label hover:bg-raised ${
            panel === id ? 'bg-raised text-primary' : ''
          }`}
        >
          <Icon size={19} strokeWidth={1.7} aria-hidden />
          {id === 'terminal' && unseen ? (
            <span
              aria-hidden
              data-testid="terminal-dot"
              className="absolute top-[9px] right-[9px] size-[7px] rounded-full bg-danger"
            />
          ) : null}
        </button>
      ))}
    </aside>
  );
}
