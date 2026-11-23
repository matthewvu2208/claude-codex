# Pinned versions

Bump these on purpose, in their own commit, and re-run the M3/M4 scenarios after a CLI bump.

| Tool                    | Version       | Notes                                                                                                                                                                                                                                                       |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                 | 22 (>= 22.12) | CI and local development                                                                                                                                                                                                                                    |
| Electron                | 45.4.1        | Exact pin in package.json                                                                                                                                                                                                                                   |
| Claude Code / Agent SDK | —             | Pinned in M3                                                                                                                                                                                                                                                |
| Codex CLI               | 0.171.0       | The user's installed `codex` is used at runtime (`CODEX_PATH` overrides). Protocol types in `electron/main/agents/codex/protocol` are generated from this version with `npm run codex:types` (`--experimental`, for dynamic tools) and never edited by hand |
