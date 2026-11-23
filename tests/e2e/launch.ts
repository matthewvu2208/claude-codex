import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { seedDesignData } from '../fixtures/seed';

/** Launches the built app (out/) with a clean environment. */
export async function launchApp(
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // Electron rejects some Node options, and the dev server URL would bypass the build.
    if (value !== undefined && key !== 'NODE_OPTIONS' && key !== 'ELECTRON_RENDERER_URL')
      env[key] = value;
  }
  // Chromium refuses to start its sandbox as root (CI containers only).
  const args = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
  return electron.launch({ args: ['.', ...args], env: { ...env, ...extraEnv } });
}
