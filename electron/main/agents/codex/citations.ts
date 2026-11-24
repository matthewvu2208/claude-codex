import { basename, isAbsolute, relative } from 'node:path';

/**
 * Codex writes directives such as `:codex-file-citation{path="/a/b.pdf" purpose="source"}`
 * for its own app to render. Here they become readable text: a file citation shows the file
 * (relative to the session folder when inside it, else its name) with any line range; other
 * directives show their [label] or nothing.
 */
const DIRECTIVE = /:codex-([a-z][a-z-]*)(?:\[([^\]\n]*)\])?\{([^}\n]*)\}/g;
const START = ':codex-';
/** Longest directive held back while streaming before it is shown as is. */
const MAX_HOLD = 2000;

function attrs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

function fileLabel(path: string, cwd?: string): string {
  if (cwd && isAbsolute(path)) {
    const rel = relative(cwd, path);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split('\\').join('/');
  }
  return basename(path) || path;
}

export function replaceCodexDirectives(text: string, cwd?: string): string {
  return text.replace(DIRECTIVE, (_all, name: string, label: string | undefined, body: string) => {
    const a = attrs(body);
    const path = a['path'] ?? a['file'];
    if (name.includes('citation') && path) {
      const start = a['line_range_start'] ?? a['start_line'] ?? a['line'];
      const end = a['line_range_end'] ?? a['end_line'];
      const lines = start ? `:${start}${end && end !== start ? `-${end}` : ''}` : '';
      return `\`${fileLabel(path, cwd)}${lines}\``;
    }
    return label?.trim() ?? '';
  });
}

/**
 * Streaming: text up to a directive that has not finished arriving is shown; the rest waits
 * for the next delta. Returns what to show now and what to keep.
 */
export function splitStreaming(text: string, cwd?: string): { show: string; keep: string } {
  let hold = text.length;
  const start = text.lastIndexOf(START);
  if (start >= 0) {
    const rest = text.slice(start);
    const m = /^:codex-[a-z][a-z-]*(?:\[[^\]\n]*\])?\{[^}\n]*\}/.exec(rest);
    const broken = /\n/.test(rest) && !m;
    if (!m && !broken && rest.length < MAX_HOLD) hold = start;
  }
  if (hold === text.length) {
    // The text may end with the first characters of a directive.
    for (let k = Math.min(START.length - 1, text.length); k > 0; k--) {
      if (START.startsWith(text.slice(-k))) {
        hold = text.length - k;
        break;
      }
    }
  }
  return { show: replaceCodexDirectives(text.slice(0, hold), cwd), keep: text.slice(hold) };
}
