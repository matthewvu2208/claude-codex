import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ipcContract, type IpcChannel, type IpcInput, type IpcOutput } from '../../../shared/ipc';
import { isAllowedNavigation } from '../../../shared/security';

export type Handler<C extends IpcChannel> = (
  input: IpcInput<C>,
  event: IpcMainInvokeEvent,
) => IpcOutput<C> | Promise<IpcOutput<C>>;

export type Handlers = { [C in IpcChannel]: Handler<C> };

/** Only the app's own page may call into main. */
export function isTrustedSender(event: IpcMainInvokeEvent, appUrl: () => string): boolean {
  const url = event.senderFrame?.url;
  return !!url && isAllowedNavigation(url, appUrl());
}

/** Registers every channel: validate input, run the handler, validate output. */
export function registerIpc(handlers: Handlers, appUrl: () => string): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    const contract = ipcContract[channel];
    const handler = handlers[channel] as Handler<IpcChannel>;
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!isTrustedSender(event, appUrl))
        throw new Error(`Blocked ${channel} from an untrusted frame`);
      const parsed = contract.input.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid ${channel} payload: ${parsed.error.message}`);
      const result = await handler(parsed.data as never, event);
      return contract.output.parse(result);
    });
  }
}
