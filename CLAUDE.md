# CLAUDE.md

## Project
Desktop app (Electron + React + TypeScript) that runs Claude (Agent SDK) and Codex (app-server)
sessions side by side, with cross-agent sub-sessions. Full plan: docs/PLAN.md.
Design: https://claude.ai/artifact/FbjBS8utmoe9sAzxxZRpyb

## Commands
npm run dev | npm test | npm run test:e2e | npm run lint | npm run typecheck
npm run build:mac | npm run build:win

## How to work
- One milestone at a time from docs/PLAN.md. Finish its "Done when" checks, commit
  (conventional commits), then stop and summarize for review.
- Use plan mode before M3, M4 and M6 and show the plan before writing code.
- Ask before adding a dependency that the plan does not list.
- Before calling a task done: typecheck, lint, unit tests; for UI, compare with the design.

## Rules
- UI copy is English, sentence case, short. Labels are not bold unless the design shows it.
- Colors and fonts only from src/styles/tokens.css. Icons only from lucide-react.
- Agent icons only through <AgentIcon />.
- The renderer never imports Node APIs or agent SDKs; all agent work lives in electron/main.
- Every IPC payload is validated with zod schemas from shared/.
- Adapters emit only AgentEvent; UI code does not branch on the agent except for icon and label.
- Never read, log or store Claude or OpenAI tokens. Sign-in always goes through each
  vendor's own flow. API keys are stored only with Electron safeStorage.
- Codex protocol types are generated (codex app-server generate-ts), never hand-edited.
  Pin CLI versions in docs/VERSIONS.md.
- Icon-only buttons need aria-label; everything is reachable by keyboard.