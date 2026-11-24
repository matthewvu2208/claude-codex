import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Local log file (`<logs>/main.log`, rotated to `main.1.log` at 5 MB). It records app events and
 * errors only: never prompts, replies, file contents or credentials. Anything shaped like a key
 * or token is redacted as a second line of defence.
 */
export type LogLevel = 'info' | 'warn' | 'error';

const MAX_BYTES = 5 * 1024 * 1024;

const REDACTIONS: [RegExp, string][] = [
  [/\bsk-ant-[\w-]{8,}/g, 'sk-ant-…'],
  [/\bsk-[\w-]{16,}/g, 'sk-…'],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, '$1 …'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '<jwt>'],
  [
    /("?(?:access_?token|refresh_?token|id_?token|api_?key|apiKey|authorization|password|secret)"?\s*[:=]\s*)("[^"]*"|[^\s,}]+)/gi,
    '$1"…"',
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, by] of REDACTIONS) out = out.replace(re, by);
  return out;
}

function describe(detail: unknown): string {
  if (detail === undefined) return '';
  if (detail instanceof Error) return ` ${detail.stack ?? detail.message}`;
  if (typeof detail === 'string') return ` ${detail}`;
  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ` ${String(detail)}`;
  }
}

export class Logger {
  readonly file: string | null;

  constructor(
    readonly dir: string | null,
    private readonly maxBytes = MAX_BYTES,
    private readonly echo = false,
  ) {
    this.file = dir ? join(dir, 'main.log') : null;
    if (dir) mkdirSync(dir, { recursive: true });
  }

  write(level: LogLevel, message: string, detail?: unknown): void {
    const line = redact(
      `${new Date().toISOString()} ${level.toUpperCase()} ${message}${describe(detail)}`,
    );
    if (this.echo || !this.file) (level === 'error' ? console.error : console.log)(line);
    if (!this.file) return;
    try {
      if (existsSync(this.file) && statSync(this.file).size > this.maxBytes) {
        const old = join(this.dir!, 'main.1.log');
        rmSync(old, { force: true });
        renameSync(this.file, old);
      }
      appendFileSync(this.file, `${line}\n`);
    } catch {
      // Logging never breaks the app.
    }
  }

  info(message: string, detail?: unknown) {
    this.write('info', message, detail);
  }
  warn(message: string, detail?: unknown) {
    this.write('warn', message, detail);
  }
  error(message: string, detail?: unknown) {
    this.write('error', message, detail);
  }
}

/** The app's logger; console-only until `initLog` points it at the logs folder. */
export let log = new Logger(null);

export function initLog(dir: string, echo = false): Logger {
  log = new Logger(dir, MAX_BYTES, echo);
  return log;
}
