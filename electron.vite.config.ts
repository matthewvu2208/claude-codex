import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './shared/security';

/** Fills the CSP meta tag: strict in builds, relaxed only for the dev server. */
function cspPlugin(): Plugin {
  let dev = false;
  return {
    name: 'app-csp',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      return html.replace('%APP_CSP%', contentSecurityPolicy(dev));
    },
  };
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('electron/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('electron/preload/index.ts') },
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src'),
    build: {
      rollupOptions: { input: { index: resolve('src/index.html') } },
    },
    plugins: [react(), tailwindcss(), cspPlugin()],
  },
});
