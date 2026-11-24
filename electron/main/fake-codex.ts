// Entry for the scripted Codex app-server used by end-to-end tests. Run with ELECTRON_RUN_AS_NODE.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createFakeAppServer } from './agents/codex/fakeServer';

// CLAUDE_CODEX_FAKE_LOG records the JSON-RPC traffic, for debugging tests.
const logFile = process.env['CLAUDE_CODEX_FAKE_LOG'];
const log = (dir: string, line: string) => {
  if (logFile) appendFileSync(logFile, `${dir} ${line.slice(0, 300)}\n`);
};
const onLine = createFakeAppServer((line) => {
  log('<<', line);
  process.stdout.write(`${line}\n`);
});
createInterface({ input: process.stdin }).on('line', (line) => {
  log('>>', line);
  onLine(line);
});
