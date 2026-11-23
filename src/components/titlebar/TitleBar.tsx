import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { isMac, shortcut } from '../../lib/platform';
import { Kbd } from '../common/Kbd';

interface TitleBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const iconButton =
  'no-drag flex size-8 items-center justify-center rounded-lg text-secondary hover:bg-raised disabled:text-disabled disabled:hover:bg-transparent';

export function TitleBar({ onToggleSidebar, sidebarOpen }: TitleBarProps) {
  return (
    <header
      className="drag flex h-[var(--titlebar-height)] flex-none items-center gap-3.5 border-b border-border-subtle bg-sidebar"
      // Leave room for the native window controls: traffic lights on macOS, overlay buttons elsewhere.
      style={isMac ? { paddingLeft: 82, paddingRight: 16 } : { paddingLeft: 16, paddingRight: 154 }}
    >
      <button
        type="button"
        className={iconButton}
        aria-label="Toggle sidebar"
        aria-pressed={sidebarOpen}
        onClick={onToggleSidebar}
      >
        <PanelLeft size={18} strokeWidth={1.8} aria-hidden />
      </button>
      <button type="button" className={iconButton} aria-label="Back">
        <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
      </button>
      <button type="button" className={iconButton} aria-label="Forward" disabled>
        <ChevronRight size={18} strokeWidth={1.8} aria-hidden />
      </button>
      <span className="flex-1" />
      <button
        type="button"
        className="no-drag flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-secondary hover:bg-raised"
      >
        Commands <Kbd>{shortcut('K')}</Kbd>
      </button>
    </header>
  );
}
