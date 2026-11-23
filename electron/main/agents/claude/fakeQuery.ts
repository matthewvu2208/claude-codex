import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CanUseTool,
  Options,
  Query,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { AsyncQueue } from '../asyncQueue';

/**
 * A scripted stand-in for Claude Code, used only by end-to-end tests (never in packaged builds).
 * It speaks the same SDK message shapes, asks for approval through canUseTool, really edits a
 * file in the session folder, streams slowly for interrupt tests, and remembers turns per
 * session id so resume can be checked.
 *
 * Prompts: "read …" reads README.md, "edit …" edits notes.txt after approval,
 * "slow …" streams until interrupted, anything else replies with a short greeting.
 */
export function fakeQuery(params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query {
  const options = params.options ?? {};
  const out = new AsyncQueue<SDKMessage>();
  const sessionId = options.resume ?? options.sessionId ?? randomUUID();
  const store = join(process.env['CLAUDE_CODEX_FAKE_DIR'] ?? tmpdir(), 'claude-codex-fake');
  mkdirSync(store, { recursive: true });
  const transcript = join(store, `${sessionId}.json`);
  const history: string[] = existsSync(transcript)
    ? (JSON.parse(readFileSync(transcript, 'utf8')) as string[])
    : [];
  let interrupted = false;
  let abort = new AbortController();
  let cost = 0;
  let closed = false;

  const base = { parent_tool_use_id: null, uuid: randomUUID(), session_id: sessionId };
  const emit = (m: Record<string, unknown>) =>
    out.push({ ...base, uuid: randomUUID(), ...m } as unknown as SDKMessage);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const streamText = async (text: string, chunks = 3, delay = 30) => {
    const id = `msg_${randomUUID()}`;
    emit({ type: 'stream_event', event: { type: 'message_start', message: { id } } });
    emit({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    });
    const size = Math.ceil(text.length / chunks);
    for (let i = 0; i < text.length; i += size) {
      if (interrupted) return;
      emit({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: text.slice(i, i + size) },
        },
      });
      await sleep(delay);
    }
    emit({
      type: 'assistant',
      message: { id, role: 'assistant', content: [{ type: 'text', text }] },
    });
  };

  const tool = async (name: string, input: Record<string, unknown>, run: () => boolean) => {
    const id = `toolu_${randomUUID()}`;
    emit({
      type: 'assistant',
      message: {
        id: `msg_${randomUUID()}`,
        role: 'assistant',
        content: [{ type: 'tool_use', id, name, input }],
      },
    });
    let ok = true;
    if (
      name === 'Edit' &&
      options.permissionMode !== 'bypassPermissions' &&
      options.permissionMode !== 'acceptEdits'
    ) {
      const decide = options.canUseTool as CanUseTool;
      const result = await decide(name, input, {
        signal: abort.signal,
        suggestions: [],
        toolUseID: id,
        requestId: randomUUID(),
      });
      ok = result?.behavior === 'allow';
    }
    if (ok) ok = run();
    emit({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: id, content: ok ? 'ok' : 'denied', is_error: !ok },
        ],
      },
    });
    return ok;
  };

  const turn = async (text: string) => {
    const started = Date.now();
    interrupted = false;
    abort = new AbortController();
    const cwd = options.cwd ?? process.cwd();
    const lower = text.toLowerCase();
    if (history.length > 0 && lower.includes('remember')) {
      await streamText(
        `I remember ${history.length} earlier message${history.length === 1 ? '' : 's'}. The first was: ${history[0]}`,
      );
    } else if (lower.includes('slow')) {
      await streamText('Working through this slowly. '.repeat(200), 400, 50);
    } else if (lower.includes('edit')) {
      const file = join(cwd, 'notes.txt');
      const ok = await tool(
        'Edit',
        { file_path: file, old_string: 'draft', new_string: 'final' },
        () => {
          const before = existsSync(file) ? readFileSync(file, 'utf8') : 'draft';
          writeFileSync(file, before.replace('draft', 'final'));
          return true;
        },
      );
      if (!interrupted)
        await streamText(
          ok
            ? 'I changed **draft** to **final** in `notes.txt`.'
            : 'Okay, I left `notes.txt` as it was.',
        );
    } else if (lower.includes('read')) {
      const file = join(cwd, 'README.md');
      await tool('Read', { file_path: file }, () => existsSync(file));
      await streamText('Here is what `README.md` says:\n\n```ts\nconst answer = 42;\n```');
    } else {
      await streamText('Hello from the test agent.');
    }
    history.push(text);
    writeFileSync(transcript, JSON.stringify(history));
    cost += 0.01;
    emit({
      type: 'result',
      subtype: interrupted ? 'error_during_execution' : 'success',
      is_error: interrupted,
      duration_ms: Date.now() - started,
      total_cost_usd: cost,
      modelUsage: {},
    });
  };

  void (async () => {
    emit({
      type: 'system',
      subtype: 'init',
      model: options.model ?? 'opus',
      cwd: options.cwd,
      tools: [],
    });
    for await (const msg of params.prompt) {
      if (closed) break;
      const content = msg.message.content;
      await turn(typeof content === 'string' ? content : JSON.stringify(content));
    }
    out.close();
  })();

  const q = {
    [Symbol.asyncIterator]: () => out[Symbol.asyncIterator](),
    next: () => out[Symbol.asyncIterator]().next(),
    interrupt: async () => {
      interrupted = true;
      abort.abort();
      return undefined;
    },
    setModel: async () => undefined,
    setPermissionMode: async (mode: NonNullable<Options['permissionMode']>) => {
      options.permissionMode = mode;
    },
    supportedModels: async () => [
      {
        value: 'opus',
        displayName: 'Opus 5.5',
        description: 'Test model',
        supportedEffortLevels: ['low', 'medium', 'high'],
      },
      {
        value: 'sonnet',
        displayName: 'Sonnet 5.5',
        description: 'Test model',
        supportedEffortLevels: ['low', 'medium', 'high'],
      },
    ],
    accountInfo: async () => ({ subscriptionType: 'max', email: 'test@example.com' }),
    getContextUsage: async () => ({
      totalTokens: 12_000 + history.length * 1000,
      maxTokens: 200_000,
      percentage: 6,
    }),
    close: () => {
      closed = true;
      out.close();
    },
  };
  return q as unknown as Query;
}
