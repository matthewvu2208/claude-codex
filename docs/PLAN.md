# Build plan: Multi-agent desktop app (Claude + Codex)

Nov 23, 2026 · @HoangManh

## Overview

Build a desktop app for macOS and Windows where each session runs Claude (through the Claude Agent SDK) or Codex (through the Codex app-server), any session can start a sub-session on the other agent, and all sessions live in one sidebar. Antigravity comes after v1.

**In scope for v1** (everything shown in the mockup):

- Welcome screen: pick the agent, folder, Worktree, model, effort and permission mode.
- Sidebar: sessions grouped by folder, nested sub-sessions, one agent icon per session, usage meters, accounts.
- Session view: streamed replies, "Worked" blocks, sub-session cards, "reported back" events, a sticky composer.
- Select-to-ask: highlight text in a reply, click "Ask about this", and the text is quoted into the composer.
- Approval cards for Ask mode.
- Right rail panels: Outline, Browser, Files, Git, Terminal.
- Context, cost and plan-usage indicators.

**Out of scope for v1:** Antigravity, cloud sync, multiple users, mobile, light theme.

**How to use this plan with Claude Code:** export this doc as Markdown to `docs/PLAN.md` in the repo, add the `CLAUDE.md` from Working rules, then paste the Kickoff prompt. Claude Code works one milestone at a time, and each milestone ends only when its "Done when" checks pass.

## Design reference

The [design canvas](https://claude.ai/artifact/FbjBS8utmoe9sAzxxZRpyb) is the source of truth: artboard 1 is the Welcome screen, artboard 2 the Active session (a draft, refined during M3). Match it rather than reinvent it.

| Token | Value | Used for |
| --- | --- | --- |
| `bg.sidebar` | #141518 | Sidebar, title bar |
| `bg.main` | #1A1D24 | Main area |
| `bg.surface` | #20242C | Composer, cards |
| `bg.raised` | #262A33 | Active row, inline code |
| `border` | #2C313B | Borders, dividers |
| `text.primary` | #E8EAEE | Body text |
| `text.secondary` | #9BA1AD | Labels, status rows |
| `text.muted` | #868D9A | Hints, placeholders |
| `accent.claude` | #E07A55 | Claude icon |
| `accent.codex` | #7B93FF | Codex icon, sub-session dot |
| `accent.action` | #C98A3D | Start/Send button, quote bar |
| `selection` | #2F5FC4 | Highlighted text |

**Type.** UI and replies use `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Segoe UI", system-ui, sans-serif`: SF Pro on macOS through the system font, Segoe UI on Windows. Never bundle SF Pro (Apple licenses it for Apple platforms only). Code uses `"SF Mono", ui-monospace, Menlo, Consolas, monospace`. Sizes: replies 15–16 px, labels 13–14 px, captions 12 px. Weight 400 for labels and titles; 600 only for the Welcome title. "New session" and the session title are not bold.

**Copy.** All UI text is English, sentence case, short, in Anthropic's style: "New session", "Search sessions", "Reply to Claude…", "Ask about this", "Worked for 9s", "reported back". Session titles and messages stay exactly as the user typed them.

**Icons.** Lucide React everywhere. Claude = `Asterisk` in `accent.claude`; Codex = `Cloud` in `accent.codex` with a 22% fill. Both are placeholders behind one `AgentIcon` component so official assets can be swapped in later, after checking each brand's guidelines.

**Agent icon rule.** A session row shows its own agent's icon at the right. If any descendant sub-session runs on the other agent, an 8 px dot in that agent's color sits at the icon's bottom-right. Sub-sessions are indented under their parent with a tree connector, and parents get a chevron to collapse them.

## Tech stack

Electron with React and TypeScript, as agreed; every other pick below serves one of the features in scope.

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Electron (latest stable) + electron-vite | One codebase for macOS and Windows; Node in the main process can spawn the agent CLIs |
| UI | React 19, TypeScript strict, Tailwind CSS v4, Lucide React | Per the spec |
| State | Zustand (renderer only) | Small, no boilerplate |
| Replies | react-markdown + remark-gfm + Shiki | Replies are markdown with code |
| Long lists | @tanstack/react-virtual | Long threads and big file trees stay fast |
| Claude | `@anthropic-ai/claude-agent-sdk` | Official; runs Claude Code as a library |
| Codex | `codex app-server` over stdio JSON-RPC, types from `codex app-server generate-ts` | Gives approvals, login, rate limits and custom tools; the TypeScript SDK wraps the non-interactive CLI |
| Storage | better-sqlite3 in the main process | Sessions, events, settings; simple sync API |
| Terminal | node-pty + xterm.js | Real shell in the session folder, ConPTY on Windows |
| Git | simple-git | Status, diff, worktrees |
| Browser panel | Electron `WebContentsView` | Preview local dev servers |
| Validation | zod | Every IPC payload |
| Tests | Vitest (unit), Playwright `_electron` (end-to-end) |  |
| Packaging | electron-builder: dmg (arm64 + x64), NSIS (x64) | CI builds on macOS and Windows runners |
| Quality | ESLint, Prettier, `tsc --noEmit` | Run before every commit |

## Architecture

The main process owns agents, data and the OS; the renderer only draws; a typed preload bridge sits between them. Both agents are translated into one event model, so the UI never branches on which agent produced an event (except icons and labels).

&#91;embedded content: app architecture · renderer, main process, agent CLIs\]

Both adapters emit the same AgentEvent stream, which the IPC router forwards to the renderer; the orchestrator is the only part that talks to both agents.

**Folder layout**

```text
electron/
  main/
    index.ts          window, menus, lifecycle
    ipc/              one handler file per domain: sessions, agents, fs, git, pty, usage
    agents/
      types.ts        AgentAdapter, AgentEvent
      claude/         ClaudeAdapter (Agent SDK)
      codex/          CodexAdapter + protocol/ (generated types)
      hub/            sub-session tools + orchestrator
    store/            SQLite schema, migrations, repositories
    services/         git, worktree, pty, files, usage
  preload/index.ts    contextBridge -> window.api
src/                  renderer
  components/         sidebar/, thread/, composer/, welcome/, rail/, common/
  stores/             zustand stores
  lib/                ipc client, selection, formatting
  styles/             tokens.css, tailwind
shared/               zod schemas + types used by main and renderer
tests/                unit/, e2e/
```

**Adapter contract** (`electron/main/agents/types.ts`)

```ts
type AgentId = 'claude' | 'codex';
type Permission = 'ask' | 'auto-edit' | 'read-only' | 'full';

interface StartOptions {
  sessionId: string;            // our id
  cwd: string;                  // folder or worktree
  model?: string;
  effort?: string;              // values come from the agent's model list
  permission: Permission;
  resumeId?: string;            // Claude session_id or Codex threadId
  hubTools: HubTools;           // sub-session tools
}

interface AgentAdapter {
  id: AgentId;
  status(): Promise<{ installed: boolean; signedIn: boolean; account?: AccountInfo }>;
  start(o: StartOptions): Promise<{ nativeId: string }>;
  send(sessionId: string, input: UserInput): Promise<void>;   // text, quotes, images
  interrupt(sessionId: string): Promise<void>;
  respondApproval(requestId: string, d: 'allow' | 'allow-session' | 'deny'): Promise<void>;
  setModel(sessionId: string, model: string): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  readUsage(): Promise<UsageSnapshot | null>;
  close(sessionId: string): Promise<void>;
  onEvent(cb: (e: AgentEvent) => void): () => void;
}

type AgentEvent =
  | { t: 'turn.started'; sessionId: string; turnId: string }
  | { t: 'text.delta' | 'text.done'; sessionId: string; itemId: string; text: string }
  | { t: 'tool.started'; sessionId: string; itemId: string; kind: 'read' | 'edit' | 'command' | 'search' | 'mcp' | 'other'; title: string }
  | { t: 'tool.output'; sessionId: string; itemId: string; chunk: string }
  | { t: 'tool.done'; sessionId: string; itemId: string; ok: boolean }
  | { t: 'approval.request'; sessionId: string; requestId: string; kind: 'command' | 'edit' | 'tool'; title: string; detail: string }
  | { t: 'subsession.started' | 'subsession.reported'; sessionId: string; childId: string; summary?: string }
  | { t: 'usage'; sessionId: string; contextTokens?: number; contextMax?: number; costUsd?: number }
  | { t: 'turn.done'; sessionId: string; turnId: string; status: 'completed' | 'interrupted' | 'failed'; durationMs: number }
  | { t: 'error'; sessionId: string; message: string; retryable: boolean };
```

**IPC.** Renderer calls `window.api.<domain>.<action>()`, which maps to `ipcRenderer.invoke` channels such as `sessions:create`, `agent:send`, `agent:approve`, `git:diff`, `pty:write`; main validates every payload with zod. Agent events flow main → renderer on one `agent:event` channel, batched every 16 ms. Window settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, no remote content in the main window.

**Data model** (SQLite, in the app data folder)

| Table | Columns |
| --- | --- |
| `folders` | id, path, name, last\_opened\_at |
| `sessions` | id, folder\_id, parent\_id, agent, native\_id, title, cwd, worktree\_path, branch, model, effort, permission, status, created\_at, updated\_at |
| `events` | session\_id, seq, ts, type, payload (JSON) |
| `settings` | key, value |

Each agent keeps its own full transcript (Claude Code's session store, Codex's thread files). The `events` table is only the render log, so a thread reopens instantly; resuming the conversation uses `native_id`.

## Claude adapter

Use `query()` from `@anthropic-ai/claude-agent-sdk` in streaming-input mode: one long-lived query per open session, so follow-ups, sub-session reports, model changes and permission changes all go into the same conversation ([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)).

**Sign-in.** Anthropic's terms set the shape here ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)): an end user may sign in to the unmodified Claude Code binary with their own subscription, but an app may not offer its own Claude.ai login or collect, store or pass on Claude.ai tokens, and developers building products on the Agent SDK should use API keys.

- **Default, personal use:** use the user's own Claude Code login. If Claude Code is missing or signed out, show "Sign in to Claude", which opens a terminal running `claude` so the user finishes `/login` in Anthropic's own flow. The app never reads or stores tokens. `accountInfo()` supplies the email and plan for the avatar and the Welcome card label.
- **API key mode:** Settings → Accounts accepts an Anthropic API key, stored with Electron `safeStorage`. Required before the app is shared with anyone else. Max, Ultra and Team plans include monthly API credits that apply when the Agent SDK runs with an API key from the linked Console organization ([support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-plan)).

| App setting | Agent SDK |
| --- | --- |
| Folder or worktree | `cwd` |
| Model | `model`; menu from `supportedModels()`; mid-session `setModel()` |
| Effort | `effort`: `low`, `medium`, `high`, `xhigh`, `max` |
| Ask | `permissionMode: 'default'` + `canUseTool` → approval card, answered with `{ behavior: 'allow' }` or `{ behavior: 'deny', message }` |
| Auto-edit | `permissionMode: 'acceptEdits'` |
| Read-only | `permissionMode: 'plan'` |
| Full access | `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`, behind a confirm dialog |
| Change mode mid-session | `setPermissionMode()` |
| Resume | `resume: nativeId` |
| Streaming text | `includePartialMessages: true` |
| Stop | `interrupt()` |
| Sub-session tools | `mcpServers: { hub: createSdkMcpServer({ name: 'hub', tools }) }` |
| Project rules | `settingSources: ['user', 'project', 'local']` so the repo's CLAUDE.md applies |

**Event mapping.** Partial assistant messages → `text.delta`. Assistant message blocks: text → `text.done`, `tool_use` → `tool.started`. Tool results in user messages → `tool.done`. Result message → `turn.done` plus `usage` from `total_cost_usd` (an estimate) and `modelUsage`. `getContextUsage()` after each turn → the header context bar (`total_tokens`, `percentage`). `SDKAPIRetryMessage` → a quiet "Retrying…" status.

**Usage meter.** `SDKRateLimitEvent` carries `rate_limit_info` with `status` (`allowed`, `allowed_warning`, `rejected`), `utilization` and `resetsAt`; feed the sidebar meter from it. A `credits_required` rejection means the plan's included usage is spent: show a banner and stop the turn. The docs do not say which window `utilization` covers, so M9 starts with a spike to log real events before labeling the meter "Weekly".

## Codex adapter

Spawn one `codex app-server` process (stdio, JSON-RPC 2.0, one JSON object per line) per app run and run every Codex session over it as a thread ([Codex App Server docs](https://learn.chatgpt.com/docs/app-server)). Generate types with `codex app-server generate-ts --out electron/main/agents/codex/protocol` and pin the Codex CLI version in `docs/VERSIONS.md`.

1. **Connect:** send `initialize` with `clientInfo` (`name`, `title`, `version`) and `capabilities.experimentalApi: true` (needed for custom tools), then the `initialized` notification.
2. **Sign in:** call `account/read`. If signed out, "Sign in to Codex" calls `account/login/start` with `type: 'chatgpt'`, which runs OpenAI's own browser flow; wait for `account/login/completed`. `account/updated` gives `planType` for the avatar ("ChatGPT Go"). `type: 'apiKey'` covers API-key users.
3. **New session:** `thread/start` with `cwd`, `model`, `approvalPolicy`, `sandbox` and `dynamicTools`; store `thread.id` as `native_id`. Reopening uses `thread/resume`.
4. **Each message:** `turn/start` with `threadId`, `input: [{ type: 'text', text }]`, `effort`, `model`. A message sent while a turn runs uses `turn/steer`. Stop uses `turn/interrupt`.
5. **Crash:** if the process exits, restart it with backoff and `thread/resume` every open thread.

| App feature | app-server |
| --- | --- |
| Model and effort menus | `model/list`: `displayName`, `supportedReasoningEfforts`, `defaultReasoningEffort`; the effort menu shows only supported values |
| Ask / Auto-edit / Read-only / Full access | `approvalPolicy` + `sandbox` pairs (e.g. Read-only = `sandbox: 'read-only'`, Auto-edit = `'workspace-write'`); confirm exact enum values in the generated types |
| Approval cards | Server requests `item/commandExecution/requestApproval` and `item/fileChange/requestApproval`; answer `accept`, `acceptForSession`, `decline` or `cancel`; `serverRequest/resolved` clears the card |
| Streaming | `item/agentMessage/delta`, `item/started`, `item/completed`, `item/commandExecution/outputDelta`, `item/reasoning/textDelta`, `turn/diff/updated` |
| Turn end | `turn/completed` with `status` completed, interrupted or failed |
| Context bar | `thread/tokenUsage/updated` |
| Usage meter | `account/rateLimits/read` on start, then `account/rateLimits/updated`; show `primary.usedPercent`, label the window from `windowDurationMins`, countdown from `resetsAt` |
| Sub-session tools | `dynamicTools` on `thread/start`; the server calls back with `item/tool/call` and expects content items in the reply |

## Cross-agent sub-sessions

The app, not the agents, owns sub-sessions: every parent gets the same hub tools, the orchestrator starts the child on the chosen agent, and the child's final answer is pushed back into the parent, which then continues ("reported back", then "Worked for 9s").

**Hub tools** (zod schemas in `shared/`, identical for both agents):

- `start_subsession({ agent: 'claude' | 'codex', title, prompt, access: 'read-only' | 'workspace-write' })` returns `{ id }` at once.
- `subsession_status({ id })` returns `{ status, summary? }`.
- `send_to_subsession({ id, message })` sends a follow-up.

A Claude parent gets them from `createSdkMcpServer`; a Codex parent gets them as `dynamicTools` and the orchestrator answers each `item/tool/call`.

**Flow**

1. The parent calls `start_subsession`. The orchestrator inserts a `sessions` row with `parent_id`, starts the child adapter in the parent's `cwd` (or worktree) and sends the prompt. It emits `subsession.started`: a card appears in the parent thread and a child row in the sidebar.
2. The child runs as a normal session; the user can open it from the card or the sidebar and talk to it.
3. When the child's turn ends `completed` with no pending approval, the orchestrator builds a report: title, final message, files changed (git diff in its `cwd`), duration.
4. The orchestrator emits `subsession.reported` ("Codex review of session\_test folder reported back · 8:14 PM") and pushes the report into the parent wrapped in `<subsession_report id agent>…</subsession_report>`: Claude through `streamInput`, Codex through `turn/start` (or `turn/steer` if a turn is running). The thread renders it as the event row, never as a user bubble.
5. The parent continues; its turn shows as "Worked for Ns" followed by its answer.

**Guards:** depth at most 2; at most 3 running children per parent (a setting); a child never gets more access than its parent; stopping a parent offers to stop its children; reports over 8,000 characters are cut with a link to the child session.

## Feature specs

Each feature below states its behavior; visuals come from the design canvas.

### Welcome screen

- Title "What should we build?"; two agent cards, Claude and Codex, labeled with the plan from each account ("Ultra", "ChatGPT Go"). A signed-out agent's card shows "Sign in". The last choice is remembered.
- Command box: folder picker (recent folders + "Open folder…"), Worktree checkbox, text area "Describe a task, or paste an error to debug...", then `+`, model, effort, permission, "start".
- Enter starts, Shift+Enter adds a line, `@` opens a file picker, `/` opens commands. Start creates the session row, calls `adapter.start`, and opens the session.

### Sidebar

- Folders (collapsible) → sessions newest first → sub-sessions indented under their parent. A row holds a chevron (parents only), the title with ellipsis, and `AgentIcon` with the dot rule.
- Live state on the icon: a spinner while a turn runs, an amber dot while an approval waits.
- Right-click: Rename, Archive, Reveal in Finder/Explorer, Copy session ID. "Search sessions" filters by title.
- Footer: usage card (Claude, Codex), account avatars with an agent badge, theme toggle (dark only in v1), Settings.

### Thread

- Virtualized list; markdown with Shiki code blocks and a copy button; file paths render as chips that open the Files panel.
- A turn's tool events collapse into one "Worked" row ("Worked for 9s" once done); expanding it shows one monospace line per tool event.
- Sub-session cards (icon, title, "Sub-session · Codex · Read-only", status, Open), "reported back" rows, approval cards.
- Auto-scroll unless the user has scrolled up; then a "Jump to latest" pill.

### Session header and composer

- Header: title (rename inline), context bar with token count, session cost, "Commands ⌘K" palette.
- Composer is a sticky footer: "Reply to Claude…" or "Reply to Codex…", the same controls as Welcome, Stop replaces Send while a turn runs, Esc interrupts.

### Select-to-ask

- On mouse-up inside one assistant message with a non-empty selection, show a floating toolbar above it: "Ask about this" (primary) and "Copy". Shortcut: ⌘⇧A / Ctrl+Shift+A.
- "Ask about this" adds a quote chip to the composer: label "Selected text" plus the file and line when the selection sits next to a path chip, the text (cut at 2,000 characters), and a remove button. Up to 3 quotes.
- On send, each quote goes first as a markdown blockquote with its label, then the user's question. Works on any assistant text, including sub-session reports.

### Approvals

- In Ask mode every request becomes a card in the thread: what will run or change (command or diff), then "Allow once", "Allow for session", "Deny". The sidebar shows the amber dot, and an OS notification fires when the window is not focused.

### Worktree

- Checked and the folder is a git repo: `git worktree add <appData>/worktrees/<repo>/<session-slug> -b agent/<session-slug>`, and the session's `cwd` is the worktree. Session menu: Open worktree, Merge into current branch, Remove worktree. Not a repo: the checkbox is disabled with a tooltip.

### Right rail panels

- Outline: the thread's turns and headings; click to scroll.
- Browser: `WebContentsView` with an address bar; suggests a detected localhost dev server.
- Files: tree of the session folder (respects `.gitignore`), read-only preview with Shiki, open in the default editor.
- Git: status, per-file diff, stage and commit, current branch.
- Terminal: node-pty shell in the session folder, xterm.js, multiple tabs; a red dot on the rail icon when unseen output arrives.
- Panels open in a resizable side pane; the rail icon toggles each one.

### Usage and cost

- Sidebar card: Claude from `rate_limit_info`, Codex from `rateLimits`; percent, bar, time to reset. Refresh on events and every 5 minutes. Unknown values show "—" with a tooltip.

### Settings

- Accounts (sign in or out per agent, API key mode), defaults (agent, model, effort, permission), worktree location, font size, sub-session limits, shortcuts.

## Milestones

Eleven milestones, each shippable on its own; Claude Code finishes one, passes its "Done when" checks, commits, and stops for review before the next.

### M0 · Scaffold

- [ ] electron-vite React + TypeScript template, TS strict, Tailwind v4, Lucide, ESLint, Prettier, Vitest, Playwright `_electron` harness
- [ ] Security defaults (context isolation, sandbox, CSP) and an empty typed `window.api`
- [ ] electron-builder config (dmg arm64 + x64, NSIS x64); GitHub Actions matrix on macOS and Windows

Done when: `npm run dev` opens a window on both systems, CI produces both installers, `npm test` passes.

### M1 · Design system and shell (fixture data)

- [ ] `tokens.css` + Tailwind theme from Design reference; font stacks
- [ ] Title bar: macOS `titleBarStyle: 'hiddenInset'` with native traffic lights; Windows `titleBarOverlay` with native buttons
- [ ] Sidebar: tree, `AgentIcon` + dot rule, search, usage card, accounts
- [ ] Welcome screen per artboard 1

Done when: at 1440×900 the app matches the canvas side by side; every control is reachable by keyboard; screenshot test saved.

### M2 · Storage, sessions, IPC

- [ ] SQLite schema + migrations + repositories; zod-validated IPC
- [ ] Folders and recents; create, rename, archive sessions; sidebar reads real data

Done when: sessions survive a restart; unit tests cover repositories and the icon rule.

### M3 · Claude adapter and thread

- [ ] Install/sign-in check and "Sign in to Claude" flow; API key mode
- [ ] start, send, interrupt, resume; event mapping; streaming thread with markdown and "Worked" blocks
- [ ] Header context bar and cost; approval cards for Ask mode

Done when, in a test repo: Claude reads a file, edits one after approval, is interrupted mid-turn, and the session continues after quitting and reopening the app.

### M4 · Codex adapter

- [ ] app-server client (spawn, JSON-RPC, restart), generated types, ChatGPT sign-in
- [ ] Threads and turns, approvals, model list driving the effort menu, token usage

Done when: the M3 scenario passes on Codex.

### M5 · Composer controls

- [ ] Model, effort and permission menus per agent; mid-session model change
- [ ] `@` file picker, `/` commands, worktree create and remove; Welcome starts real sessions

Done when: changing the model mid-session works on both agents; a worktree session leaves the main checkout untouched.

### M6 · Sub-sessions

- [ ] Hub tools for both agents, orchestrator, report-back, sub-session cards, sidebar nesting and dot, guards

Done when: a Claude parent starts a read-only Codex review, receives the report and continues; the reverse also works; depth and concurrency limits hold.

### M7 · Select-to-ask

- [ ] Selection toolbar, quote chips, send format, shortcut

Done when: an end-to-end test selects text in a reply, asks about it, and the sent message contains the quote.

### M8 · Right rail panels

- [ ] Outline, Browser, Files, Git, Terminal

Done when: each panel works in the session folder or worktree; the terminal works on macOS and Windows.

### M9 · Usage meters

- [ ] Spike: log real Claude `rate_limit_event` and Codex `rateLimits` payloads; then wire the sidebar card

Done when: the meters show real percentages and reset times, or "—" with a tooltip when unknown.

### M10 · Packaging and polish

- [ ] App name and icon, signing and notarization notes, local log file, performance pass (a 10,000-event thread scrolls smoothly), accessibility pass

Done when: the installers run on clean macOS and Windows machines that have Claude Code and the Codex CLI installed.

**After v1:** Antigravity adapter once it offers a headless interface; light theme; auto-update.

## Working rules for Claude Code

Save this as `CLAUDE.md` at the repo root; Claude Code reads it at the start of every session.

```markdown
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
```

## Risks and open questions

The biggest risk is sign-in terms, not code: the plan keeps Claude sign-in inside Claude Code and adds an API-key mode so sharing the app stays possible.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Claude subscription sign-in in a third-party app | Fine for your own use through the unmodified Claude Code login; not allowed to offer Claude.ai login or route other people's usage | Sign-in stays in Claude Code; API-key mode; re-read the terms before sharing the app |
| Agent SDK billing changes (a separate credit was announced, then paused) | The Claude meter's meaning may change | Read usage only from SDK events; no hard-coded limits |
| Claude plan usage only arrives through `rate_limit_event` | The Claude meter may stay empty | M9 spike; show "—" when unknown |
| Codex `dynamicTools` is experimental | Codex-parent sub-sessions may break on CLI updates | Pin the Codex version; fallback: a local MCP server registered in Codex config |
| Native modules (better-sqlite3, node-pty) on Windows | Build failures | `electron-builder install-app-deps`; CI on Windows from M0 |
| SF Pro license | Cannot ship the font file | System font stack |
| Brand icons | Trademark | Lucide placeholders behind `AgentIcon` |

**Open questions**

- [ ] Header: in the reference screenshot, does "● 1" mean running tasks or cost? The plan shows cost.
- [ ] App name and app icon.
- [ ] Do sub-sessions share the parent's worktree or get their own? The plan shares it.
- [ ] Will the app ever be shared with other people? That decides how central API-key mode is.

## Kickoff prompt

Paste this into Claude Code in the empty repo after adding `docs/PLAN.md` and `CLAUDE.md`.

```text
Read docs/PLAN.md and CLAUDE.md in full before doing anything.

We are building the app described there, one milestone at a time. Start with M0 only.

1. List the M0 tasks you will do and any question that blocks you. Wait for my answer
   only if something truly blocks you.
2. Do the tasks. Run typecheck, lint and tests.
3. When every "Done when" check passes, commit and give me a short summary:
   what you built, how to run it, anything you decided on your own.
4. Stop. Do not start the next milestone until I say "go".

For UI milestones, include a screenshot and compare it with the design link in CLAUDE.md.
For M3, M4 and M6, use plan mode first and show me the plan before writing code.
```

## Sources

- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Use the Claude Agent SDK with your plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-plan)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [@openai/codex-sdk package](https://socket.dev/npm/package/@openai/codex-sdk)
- [Design canvas](https://claude.ai/artifact/FbjBS8utmoe9sAzxxZRpyb)
