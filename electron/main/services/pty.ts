import { randomUUID } from 'node:crypto';
import { spawn, type IPty } from 'node-pty';

export interface PtyInfo {
  id: string;
  sessionId: string;
  title: string;
}

/** The user's shell: $SHELL on macOS/Linux, PowerShell on Windows (ConPTY). */
export function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  return { file: process.env['SHELL'] || '/bin/bash', args: ['-l'] };
}

/**
 * Terminals for the right rail: one real shell per tab, in the session's folder or worktree.
 * Output is batched (~16 ms) before it goes to the renderer.
 */
export class PtyManager {
  private readonly ptys = new Map<string, { pty: IPty; info: PtyInfo }>();
  private pending = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly onData: (batch: { id: string; data: string }[]) => void,
    private readonly onExit: (id: string, code: number) => void,
    private readonly shell = defaultShell,
  ) {}

  create(sessionId: string, cwd: string, cols: number, rows: number): PtyInfo {
    const { file, args } = this.shell();
    const pty = spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM_PROGRAM: 'ClaudeCodex' } as Record<string, string>,
    });
    const info: PtyInfo = {
      id: randomUUID(),
      sessionId,
      title: file
        .split(/[\\/]/)
        .pop()!
        .replace(/\.exe$/i, ''),
    };
    this.ptys.set(info.id, { pty, info });
    pty.onData((d) => {
      this.pending.set(info.id, (this.pending.get(info.id) ?? '') + d);
      this.timer ??= setTimeout(() => this.flush(), 16);
    });
    pty.onExit(({ exitCode }) => {
      this.flush();
      this.ptys.delete(info.id);
      this.onExit(info.id, exitCode);
    });
    return info;
  }

  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    const batch = [...this.pending].map(([id, data]) => ({ id, data }));
    this.pending = new Map();
    this.onData(batch);
  }

  list(sessionId: string): PtyInfo[] {
    return [...this.ptys.values()].filter((p) => p.info.sessionId === sessionId).map((p) => p.info);
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const p = this.ptys.get(id);
    if (p && cols > 0 && rows > 0) p.pty.resize(cols, rows);
  }

  kill(id: string): void {
    this.ptys.get(id)?.pty.kill();
  }

  killAll(): void {
    for (const { pty } of this.ptys.values()) pty.kill();
    this.ptys.clear();
  }
}
