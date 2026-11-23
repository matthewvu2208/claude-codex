import { spawn } from 'node:child_process';

const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Opens the OS terminal running `command` in `cwd`, so sign-in happens in the vendor's own
 * interactive flow. The app never sees what the user types there.
 */
export function openTerminal(command: string, args: string[], cwd: string): void {
  const line = [command, ...args].map(shQuote).join(' ');
  if (process.platform === 'darwin') {
    const script = `tell application "Terminal"\n activate\n do script "cd ${shQuote(cwd).replace(/"/g, '\\"')} && ${line.replace(/"/g, '\\"')}"\nend tell`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', command, ...args], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: false,
    }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', 'sh', '-c', line], {
      cwd,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}
