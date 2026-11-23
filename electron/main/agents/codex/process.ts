import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Transport } from './rpc';

export interface CodexCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Where GUI apps should look for `codex`; they do not inherit the login shell's PATH. */
function searchDirs(): string[] {
  const home = homedir();
  const fromPath = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
  const extra =
    process.platform === 'win32'
      ? [
          join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'npm'),
          join(home, '.codex', 'bin'),
        ]
      : [
          '/opt/homebrew/bin',
          '/usr/local/bin',
          join(home, '.local', 'bin'),
          join(home, '.npm-global', 'bin'),
          join(home, '.codex', 'bin'),
          join(home, '.volta', 'bin'),
        ];
  return [...new Set([...fromPath, ...extra])];
}

/** The user's installed Codex CLI, or null. `CODEX_PATH` wins when set. */
export function findCodex(): string | null {
  const override = process.env['CODEX_PATH'];
  if (override) return existsSync(override) ? override : null;
  const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];
  for (const dir of searchDirs()) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** Spawns `codex app-server` and exposes its stdio as a line transport. */
export function spawnAppServer(cmd: CodexCommand): Transport {
  const isCmdShim = process.platform === 'win32' && cmd.command.toLowerCase().endsWith('.cmd');
  const child = spawn(isCmdShim ? `"${cmd.command}"` : cmd.command, cmd.args, {
    env: { ...process.env, ...cmd.env } as NodeJS.ProcessEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: isCmdShim,
  });
  const lines = createInterface({ input: child.stdout });
  // Codex logs to stderr; it can contain prompts, so it is not kept.
  child.stderr.resume();
  const closeHandlers: ((reason: string) => void)[] = [];
  let closed = false;
  const fireClose = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const cb of closeHandlers) cb(reason);
  };
  child.on('exit', (code, signal) => fireClose(signal ? `signal ${signal}` : `exit ${code}`));
  child.on('error', (e) => fireClose(e.message));
  child.stdin.on('error', () => undefined);
  return {
    write: (line) => {
      if (!closed) child.stdin.write(`${line}\n`);
    },
    onLine: (cb) => lines.on('line', cb),
    onClose: (cb) => closeHandlers.push(cb),
    close: () => {
      child.stdin.end();
      setTimeout(() => {
        if (!closed) child.kill();
      }, 2000).unref();
    },
  };
}
