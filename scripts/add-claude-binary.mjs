// Adds the Claude Code binary package for another CPU, so one macOS runner can build both the
// arm64 and x64 dmg (npm only installs the optional package for the runner's own CPU).
// Usage: node scripts/add-claude-binary.mjs darwin-x64
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2];
if (!/^(darwin|win32|linux)-(x64|arm64)(-musl)?$/.test(target ?? '')) {
  console.error('usage: add-claude-binary.mjs <platform-arch>');
  process.exit(1);
}
const sdk = JSON.parse(
  readFileSync('node_modules/@anthropic-ai/claude-agent-sdk/package.json', 'utf8'),
);
const name = `@anthropic-ai/claude-agent-sdk-${target}`;
const dest = join('node_modules', name);
if (existsSync(dest)) {
  console.log(`${name} already present`);
  process.exit(0);
}
const work = mkdtempSync(join(tmpdir(), 'claude-bin-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const file = execFileSync(npm, ['pack', `${name}@${sdk.version}`, '--silent'], {
  cwd: work,
  shell: process.platform === 'win32',
})
  .toString()
  .trim()
  .split('\n')
  .pop();
execFileSync('tar', ['-xzf', file], { cwd: work });
mkdirSync(join('node_modules', '@anthropic-ai'), { recursive: true });
renameSync(join(work, 'package'), dest);
console.log(`added ${name}@${sdk.version}`);
