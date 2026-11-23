import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Json = Record<string, unknown>;

/**
 * A scripted stand-in for `codex app-server`, used only by tests (never in packaged builds).
 * It speaks the same JSON-RPC: threads, turns, streamed agent messages, command and file-change
 * items, approvals as server requests, interrupt and resume. Prompts: "read …" runs a command,
 * "edit …" changes notes.txt after approval, "slow …" streams until interrupted, "remember"
 * recalls earlier messages in the thread.
 */
export function createFakeAppServer(write: (line: string) => void): (line: string) => void {
  const store = join(process.env['CLAUDE_CODEX_FAKE_DIR'] ?? tmpdir(), 'codex-fake');
  mkdirSync(store, { recursive: true });
  const threads = new Map<string, { cwd: string; history: string[] }>();
  const waiting = new Map<number, (result: Json) => void>();
  let serverRequestId = 1000;
  const interrupted = new Set<string>();

  const send = (msg: Json) => write(JSON.stringify(msg));
  const notify = (method: string, params: Json) => send({ method, params });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ask = (method: string, params: Json) =>
    new Promise<Json>((resolve) => {
      const id = serverRequestId++;
      waiting.set(id, resolve);
      send({ id, method, params });
    });

  const loadThread = (threadId: string, cwd: string) => {
    const file = join(store, `${threadId}.json`);
    const history = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as string[]) : [];
    const t = { cwd, history };
    threads.set(threadId, t);
    return t;
  };

  const streamMessage = async (
    threadId: string,
    turnId: string,
    text: string,
    chunk = 8,
    delay = 20,
  ) => {
    const id = `msg_${randomUUID()}`;
    notify('item/started', {
      threadId,
      turnId,
      item: { type: 'agentMessage', id, text: '' },
      startedAtMs: Date.now(),
    });
    for (let i = 0; i < text.length; i += chunk) {
      if (interrupted.has(turnId)) return;
      notify('item/agentMessage/delta', {
        threadId,
        turnId,
        itemId: id,
        delta: text.slice(i, i + chunk),
      });
      await sleep(delay);
    }
    notify('item/completed', { threadId, turnId, item: { type: 'agentMessage', id, text } });
  };

  const runTurn = async (threadId: string, turnId: string, text: string) => {
    const t = threads.get(threadId)!;
    const started = Date.now();
    notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress', items: [] } });
    const lower = text.toLowerCase();
    if (lower.includes('remember') && t.history.length > 0) {
      await streamMessage(
        threadId,
        turnId,
        `I remember ${t.history.length} earlier messages. The first was: ${t.history[0]}`,
      );
    } else if (lower.includes('slow')) {
      await streamMessage(threadId, turnId, 'Working through this slowly. '.repeat(200), 6, 50);
    } else if (lower.includes('edit')) {
      const file = join(t.cwd, 'notes.txt');
      const id = `fc_${randomUUID()}`;
      const item = {
        type: 'fileChange',
        id,
        changes: [
          {
            path: file,
            kind: { type: 'update', move_path: null },
            diff: '@@ -1 +1 @@\n-status: draft\n+status: final',
          },
        ],
        status: 'inProgress',
      };
      notify('item/started', { threadId, turnId, item, startedAtMs: Date.now() });
      const answer = await ask('item/fileChange/requestApproval', {
        threadId,
        turnId,
        itemId: id,
        startedAtMs: Date.now(),
      });
      const ok = answer['decision'] === 'accept' || answer['decision'] === 'acceptForSession';
      if (ok) writeFileSync(file, readFileSync(file, 'utf8').replace('draft', 'final'));
      notify('item/completed', {
        threadId,
        turnId,
        item: { ...item, status: ok ? 'completed' : 'declined' },
      });
      if (!interrupted.has(turnId)) {
        await streamMessage(
          threadId,
          turnId,
          ok
            ? 'I changed **draft** to **final** in `notes.txt`.'
            : 'Okay, I left `notes.txt` as it was.',
        );
      }
    } else if (lower.includes('read')) {
      const id = `cmd_${randomUUID()}`;
      const item = {
        type: 'commandExecution',
        id,
        command: 'cat README.md',
        cwd: t.cwd,
        status: 'inProgress',
        exitCode: null,
      };
      notify('item/started', { threadId, turnId, item, startedAtMs: Date.now() });
      const content = existsSync(join(t.cwd, 'README.md'))
        ? readFileSync(join(t.cwd, 'README.md'), 'utf8')
        : '';
      notify('item/commandExecution/outputDelta', { threadId, turnId, itemId: id, delta: content });
      notify('item/completed', {
        threadId,
        turnId,
        item: { ...item, status: 'completed', exitCode: 0 },
      });
      await streamMessage(
        threadId,
        turnId,
        'Here is what `README.md` says:\n\n```ts\nconst answer = 42;\n```',
      );
    } else {
      await streamMessage(threadId, turnId, 'Hello from the test agent.');
    }
    t.history.push(text);
    writeFileSync(join(store, `${threadId}.json`), JSON.stringify(t.history));
    notify('thread/tokenUsage/updated', {
      threadId,
      turnId,
      tokenUsage: {
        total: { totalTokens: 9000 * t.history.length },
        last: { totalTokens: 9000 + t.history.length * 1000 },
        modelContextWindow: 272_000,
      },
    });
    const status = interrupted.has(turnId) ? 'interrupted' : 'completed';
    interrupted.delete(turnId);
    notify('turn/completed', {
      threadId,
      turn: { id: turnId, status, items: [], error: null, durationMs: Date.now() - started },
    });
  };

  const handle = (msg: Json): Json | Promise<Json> => {
    const method = msg['method'] as string;
    const p = (msg['params'] ?? {}) as Json;
    switch (method) {
      case 'initialize':
        return {
          userAgent: 'fake-codex',
          codexHome: store,
          platformFamily: 'unix',
          platformOs: 'linux',
        };
      case 'account/read':
        return {
          account: {
            type: 'chatgpt',
            email: 'test@example.com',
            planType: 'go',
            workspaceName: null,
          },
          userId: 'u',
          requiresOpenaiAuth: true,
          workspaceRouting: null,
        };
      case 'account/rateLimits/read':
        return {
          rateLimits: {
            primary: {
              usedPercent: 10,
              windowDurationMins: 10080,
              resetsAt: Math.floor(Date.now() / 1000) + 27 * 86400,
            },
          },
        };
      case 'account/login/start':
        return { type: 'chatgpt', loginId: 'l', authUrl: 'https://auth.example.com/login' };
      case 'model/list':
        return {
          data: [
            {
              model: 'gpt-test',
              displayName: 'GPT Test',
              description: 'Test model',
              hidden: false,
              isDefault: true,
              supportedReasoningEfforts: [
                { reasoningEffort: 'low' },
                { reasoningEffort: 'medium' },
              ],
              defaultReasoningEffort: 'medium',
            },
          ],
          nextCursor: null,
        };
      case 'thread/start': {
        const id = randomUUID();
        loadThread(id, String(p['cwd']));
        return { thread: { id } };
      }
      case 'thread/resume': {
        const id = String(p['threadId']);
        loadThread(id, String(p['cwd']));
        return { thread: { id } };
      }
      case 'turn/start': {
        const turnId = `turn_${randomUUID()}`;
        const input = (p['input'] as { text?: string }[])[0]?.text ?? '';
        setTimeout(() => void runTurn(String(p['threadId']), turnId, input), 0);
        return { turn: { id: turnId, status: 'inProgress', items: [] } };
      }
      case 'turn/steer':
        return { turnId: String(p['expectedTurnId']) };
      case 'turn/interrupt': {
        interrupted.add(String(p['turnId']));
        for (const [id, resolve] of waiting) {
          waiting.delete(id);
          resolve({ decision: 'cancel' });
        }
        return {};
      }
      default:
        throw new Error(`fake app-server: ${method} not supported`);
    }
  };

  return (line: string) => {
    let msg: Json;
    try {
      msg = JSON.parse(line) as Json;
    } catch {
      return;
    }
    const id = msg['id'] as number | undefined;
    if (msg['method'] === undefined && id !== undefined) {
      // A response to one of our server requests (an approval decision).
      const resolve = waiting.get(id);
      waiting.delete(id);
      resolve?.((msg['result'] ?? {}) as Json);
      return;
    }
    if (id === undefined) return; // Notifications like `initialized`.
    Promise.resolve()
      .then(() => handle(msg))
      .then(
        (result) => send({ id, result }),
        (e: unknown) =>
          send({
            id,
            error: { code: -32601, message: e instanceof Error ? e.message : String(e) },
          }),
      );
  };
}
