// Entry for the scripted Codex app-server used by end-to-end tests. Run with ELECTRON_RUN_AS_NODE.
import { createInterface } from 'node:readline';
import { createFakeAppServer } from './agents/codex/fakeServer';

const onLine = createFakeAppServer((line) => process.stdout.write(`${line}\n`));
createInterface({ input: process.stdin }).on('line', onLine);
