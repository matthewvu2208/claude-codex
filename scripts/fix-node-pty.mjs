// node-pty's macOS prebuilds ship `spawn-helper` without the execute bit, so every terminal
// fails with "posix_spawnp failed". Restore it after install (packaging keeps file modes).
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const prebuilds = join(import.meta.dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper');
    if (existsSync(helper) && (statSync(helper).mode & 0o111) === 0) {
      chmodSync(helper, 0o755);
      console.log(`node-pty: made ${dir}/spawn-helper executable`);
    }
  }
}
