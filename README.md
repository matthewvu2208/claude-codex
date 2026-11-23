# Claude Codex

Desktop app (Electron + React + TypeScript) that runs Claude and Codex sessions side by side.
See [docs/PLAN.md](docs/PLAN.md) for the plan and [CLAUDE.md](CLAUDE.md) for working rules.

```bash
npm install
npm run dev        # app with hot reload
npm test           # unit tests (Vitest)
npm run test:e2e   # builds, then end-to-end tests (Playwright + Electron)
npm run lint       # ESLint + Prettier
npm run typecheck  # tsc for main/preload and renderer
npm run build:mac  # dmg, arm64 + x64 (run on macOS)
npm run build:win  # NSIS installer, x64 (run on Windows)
```

`dependencies` is reserved for modules the main process loads at runtime (for example
better-sqlite3); renderer libraries are bundled by Vite and live in `devDependencies`.
