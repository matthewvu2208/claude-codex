import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

const nodeRequire = createRequire(import.meta.url);

/**
 * Path of the unmodified Claude Code binary that ships with the Agent SDK for this platform.
 * Inside a packaged app it lives in app.asar.unpacked so it can be executed.
 */
export function bundledClaudeBinary(): string | null {
  const { platform, arch } = process;
  const names =
    platform === 'linux' ? [`linux-${arch}`, `linux-${arch}-musl`] : [`${platform}-${arch}`];
  const file = platform === 'win32' ? 'claude.exe' : 'claude';
  for (const name of names) {
    try {
      const pkg = nodeRequire.resolve(`@anthropic-ai/claude-agent-sdk-${name}/package.json`);
      const bin = join(dirname(pkg), file).replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
      if (existsSync(bin)) return bin;
    } catch {
      // Not installed for this platform; try the next one.
    }
  }
  return null;
}
