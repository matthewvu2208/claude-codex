import type { ClientRequest } from './protocol/ClientRequest';

/** A line-oriented duplex: the app-server's stdio, or in-memory streams in tests. */
export interface Transport {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(): void;
}

export type ClientMethod = ClientRequest['method'];
export type ParamsOf<M extends ClientMethod> = Extract<ClientRequest, { method: M }>['params'];

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

export interface ServerRequestHandler {
  (method: string, params: Json, id: number | string): Promise<unknown>;
}

/**
 * JSON-RPC 2.0 over newline-delimited JSON, as `codex app-server` speaks it: client requests
 * with ids, notifications both ways, and requests from the server (approvals, tool calls).
 */
export class RpcClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly notificationHandlers = new Set<(method: string, params: Json) => void>();
  private requestHandler: ServerRequestHandler | null = null;
  private closed = false;

  constructor(private readonly transport: Transport) {
    transport.onLine((line) => this.receive(line));
    transport.onClose((reason) => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Codex stopped (${reason})`));
      }
      this.pending.clear();
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  request<T, M extends ClientMethod = ClientMethod>(
    method: M,
    params: ParamsOf<M>,
    timeoutMs = 60_000,
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex is not running'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex did not answer ${method} in time`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) });
  }

  onNotification(cb: (method: string, params: Json) => void): () => void {
    this.notificationHandlers.add(cb);
    return () => this.notificationHandlers.delete(cb);
  }

  onRequest(handler: ServerRequestHandler): void {
    this.requestHandler = handler;
  }

  close(): void {
    this.transport.close();
  }

  private send(msg: Json) {
    if (!this.closed) this.transport.write(JSON.stringify(msg));
  }

  private receive(line: string) {
    let msg: Json;
    try {
      msg = JSON.parse(line) as Json;
    } catch {
      return; // Not protocol output.
    }
    const id = msg['id'] as number | string | undefined;
    const method = typeof msg['method'] === 'string' ? msg['method'] : null;
    const params = (msg['params'] ?? {}) as Json;

    if (method && id !== undefined) {
      void this.answer(id, method, params);
    } else if (method) {
      for (const cb of this.notificationHandlers) cb(method, params);
    } else if (typeof id === 'number') {
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      clearTimeout(p.timer);
      const error = msg['error'] as { message?: string; code?: number } | undefined;
      if (error) p.reject(new RpcError(error.message ?? 'Codex error', error.code ?? -1));
      else p.resolve(msg['result']);
    }
  }

  private async answer(id: number | string, method: string, params: Json) {
    try {
      if (!this.requestHandler) throw new RpcError(`Unsupported request ${method}`, -32601);
      const result = await this.requestHandler(method, params, id);
      this.send({ jsonrpc: '2.0', id, result });
    } catch (e) {
      const code = e instanceof RpcError ? e.code : -32603;
      this.send({
        jsonrpc: '2.0',
        id,
        error: { code, message: e instanceof Error ? e.message : String(e) },
      });
    }
  }
}
