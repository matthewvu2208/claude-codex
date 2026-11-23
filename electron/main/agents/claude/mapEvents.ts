import { isAbsolute, relative } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, ToolKind } from '../../../../shared/events';

/** Tool name → thread kind. */
export function toolKind(name: string): ToolKind {
  if (name.startsWith('mcp__')) return 'mcp';
  switch (name) {
    case 'Read':
    case 'Glob':
    case 'LS':
    case 'NotebookRead':
      return 'read';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'edit';
    case 'Bash':
    case 'BashOutput':
    case 'PowerShell':
      return 'command';
    case 'Grep':
    case 'WebSearch':
    case 'WebFetch':
      return 'search';
    default:
      return 'other';
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Shows paths inside the session folder relative to it, like the design ("review-test/pricing.ts"). */
export function displayPath(path: string, cwd?: string): string {
  if (!cwd || !isAbsolute(path)) return path;
  const rel = relative(cwd, path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split('\\').join('/') : path;
}

const withRelativePaths = (
  input: Record<string, unknown>,
  cwd?: string,
): Record<string, unknown> => {
  const out = { ...input };
  for (const k of ['file_path', 'notebook_path', 'path']) {
    const v = str(out[k]);
    if (v) out[k] = displayPath(v, cwd);
  }
  return out;
};

/** One monospace line for the "Worked" block, e.g. "Read src/app.ts". */
export function toolTitle(name: string, rawInput: Record<string, unknown>, cwd?: string): string {
  const input = withRelativePaths(rawInput, cwd);
  const path = str(input['file_path']) ?? str(input['notebook_path']) ?? str(input['path']);
  switch (name) {
    case 'Read':
      return `Read ${path ?? 'file'}`;
    case 'Edit':
    case 'MultiEdit':
      return `Edit ${path ?? 'file'}`;
    case 'Write':
      return `Write ${path ?? 'file'}`;
    case 'NotebookEdit':
      return `Edit ${path ?? 'notebook'}`;
    case 'Bash':
    case 'PowerShell':
      return `Run ${oneLine(str(input['command']) ?? '')}`;
    case 'Glob':
      return `Find ${str(input['pattern']) ?? ''}`.trim();
    case 'Grep':
      return `Search ${str(input['pattern']) ?? ''}`.trim();
    case 'WebSearch':
      return `Search the web for ${str(input['query']) ?? ''}`.trim();
    case 'WebFetch':
      return `Fetch ${str(input['url']) ?? ''}`.trim();
    default: {
      if (name.startsWith('mcp__')) {
        const [, server, tool] = name.split('__');
        return `${server ?? 'mcp'} · ${tool ?? name}`;
      }
      return name;
    }
  }
}

export function oneLine(s: string, max = 160): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Approval card content for a tool call. */
export function approvalContent(
  name: string,
  rawInput: Record<string, unknown>,
  cwd?: string,
): { kind: 'command' | 'edit' | 'tool'; title: string; detail: string } {
  const input = withRelativePaths(rawInput, cwd);
  const kind = toolKind(name);
  if (kind === 'command') {
    return { kind: 'command', title: 'Run a command', detail: str(input['command']) ?? '' };
  }
  if (kind === 'edit') {
    const path = str(input['file_path']) ?? str(input['notebook_path']) ?? 'file';
    if (name === 'Write') {
      return { kind: 'edit', title: `Write ${path}`, detail: clip(str(input['content']) ?? '') };
    }
    const edits = Array.isArray(input['edits'])
      ? (input['edits'] as Record<string, unknown>[])
      : [input];
    const detail = edits
      .map((e) => {
        const minus = (str(e['old_string']) ?? '').split('\n').map((l) => `- ${l}`);
        const plus = (str(e['new_string']) ?? '').split('\n').map((l) => `+ ${l}`);
        return [...minus, ...plus].join('\n');
      })
      .join('\n…\n');
    return { kind: 'edit', title: `Edit ${path}`, detail: clip(detail) };
  }
  return {
    kind: 'tool',
    title: toolTitle(name, input),
    detail: clip(JSON.stringify(input, null, 2)),
  };
}

const clip = (s: string, max = 8000) => (s.length > max ? `${s.slice(0, max)}\n…` : s);

/**
 * Stateful translation of one Claude session's SDK messages into AgentEvents.
 * Turn boundaries (turn.started) are emitted by the adapter when it sends input.
 */
export class ClaudeEventMapper {
  /** Text block counters per assistant message id, for streamed vs. final blocks. */
  private streamedText = new Map<string, number>();
  private finalText = new Map<string, number>();
  private streamBlockItem = new Map<string, string>();
  private currentMessageId: string | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly cwd?: string,
  ) {}

  map(msg: SDKMessage): AgentEvent[] {
    const sessionId = this.sessionId;
    switch (msg.type) {
      case 'stream_event': {
        if (msg.parent_tool_use_id) return [];
        const ev = msg.event;
        if (ev.type === 'message_start') {
          this.currentMessageId = ev.message.id;
          return [];
        }
        const mid = this.currentMessageId ?? 'msg';
        if (ev.type === 'content_block_start' && ev.content_block.type === 'text') {
          const n = this.streamedText.get(mid) ?? 0;
          this.streamedText.set(mid, n + 1);
          this.streamBlockItem.set(`${mid}:${ev.index}`, `${mid}:text:${n}`);
          return [];
        }
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          const itemId = this.streamBlockItem.get(`${mid}:${ev.index}`) ?? `${mid}:text:0`;
          return [{ t: 'text.delta', sessionId, itemId, text: ev.delta.text }];
        }
        return [];
      }
      case 'assistant': {
        if (msg.parent_tool_use_id) return [];
        const out: AgentEvent[] = [];
        const mid = msg.message.id;
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            const n = this.finalText.get(mid) ?? 0;
            this.finalText.set(mid, n + 1);
            if (block.text.trim())
              out.push({ t: 'text.done', sessionId, itemId: `${mid}:text:${n}`, text: block.text });
          } else if (block.type === 'tool_use') {
            const input = (block.input ?? {}) as Record<string, unknown>;
            out.push({
              t: 'tool.started',
              sessionId,
              itemId: block.id,
              kind: toolKind(block.name),
              title: toolTitle(block.name, input, this.cwd),
            });
          }
        }
        if (msg.error) out.push(assistantError(sessionId, msg.error));
        return out;
      }
      case 'user': {
        if (msg.parent_tool_use_id) return [];
        const content = msg.message.content;
        if (!Array.isArray(content)) return [];
        const out: AgentEvent[] = [];
        for (const b of content) {
          if (b.type === 'tool_result') {
            out.push({ t: 'tool.done', sessionId, itemId: b.tool_use_id, ok: !b.is_error });
          }
        }
        return out;
      }
      case 'system': {
        if (msg.subtype === 'api_retry') {
          return [
            {
              t: 'notice',
              sessionId,
              kind: 'retrying',
              message: `Retrying… (attempt ${msg.attempt} of ${msg.max_retries})`,
            },
          ];
        }
        return [];
      }
      default:
        return [];
    }
  }
}

const ERROR_COPY: Record<string, string> = {
  authentication_failed: 'Claude is not signed in. Sign in to Claude and try again.',
  oauth_org_not_allowed: 'This organization cannot use Claude here.',
  account_on_hold: 'Your Claude account is on hold.',
  billing_error: 'Claude reported a billing problem.',
  rate_limit: 'Claude is rate limited. Try again soon.',
  overloaded: 'Claude is overloaded. Try again soon.',
  model_not_found: 'That model is not available.',
  max_output_tokens: 'The reply hit the output limit.',
};

export function assistantError(sessionId: string, code: string): AgentEvent {
  return {
    t: 'error',
    sessionId,
    message: ERROR_COPY[code] ?? `Claude reported an error (${code}).`,
    retryable: code === 'rate_limit' || code === 'overloaded' || code === 'server_error',
  };
}
