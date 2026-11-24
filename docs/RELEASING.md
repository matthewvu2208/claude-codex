# Releasing

CI (`.github/workflows/ci.yml`) builds unsigned installers on every push: a dmg per CPU
(arm64, x64) and an NSIS installer for Windows x64. They are uploaded as workflow artifacts.
Unsigned builds are fine for your own machines; anything shared needs signing.

## What users need installed

- **Claude:** nothing extra. The Agent SDK ships the Claude Code binary inside the app. Sign-in
  runs `claude auth login` (Anthropic's own flow) in a terminal, or use an Anthropic API key in
  Settings › Accounts (stored with the system keychain through Electron `safeStorage`).
- **Codex:** the Codex CLI at the version in `docs/VERSIONS.md` (`npm i -g @openai/codex@…`).
  The app finds it on `PATH`, in common install folders, or at `CODEX_PATH`. Sign-in uses
  ChatGPT's own browser flow, or an OpenAI API key.

## macOS: signing and notarization

1. An Apple Developer ID Application certificate in the build machine's keychain (or `CSC_LINK`
   and `CSC_KEY_PASSWORD` in CI as secrets). Remove `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` from
   the workflow for signed builds.
2. Notarization credentials as secrets: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
   `APPLE_TEAM_ID` (or an App Store Connect API key: `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
   `APPLE_API_ISSUER`).
3. Build with notarization on:

   ```bash
   npm run build && npx electron-builder --mac --publish never -c.mac.notarize=true
   ```

The app uses the hardened runtime with `build/entitlements.mac.plist`: only JIT and unsigned
executable memory, which V8 needs. Native modules (better-sqlite3, node-pty and its
`spawn-helper`) and the bundled Claude Code binary are unpacked from the asar and signed by
electron-builder with your identity. Re-signing replaces Anthropic's signature on that binary;
check that `claude --version` still runs from the signed app before shipping.

Check a build with:

```bash
codesign --verify --deep --strict --verbose=2 "release/<version>/mac-arm64/Claude Codex.app"
```

```bash
spctl --assess --type execute --verbose "release/<version>/mac-arm64/Claude Codex.app"
```

## Windows: signing

Set `CSC_LINK` (a .pfx, base64 or path) and `CSC_KEY_PASSWORD` as secrets, or configure
`win.azureSignOptions` for Azure Trusted Signing. Without a certificate, SmartScreen warns on
first run ("More info" › "Run anyway").

## Before a release

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` pass on both systems.
- With real sign-ins: `CLAUDE_CODEX_REAL_AGENTS=1 npx playwright test tests/e2e/real`
  (needs Claude Code signed in and the Codex CLI installed and signed in).
- Install the dmg and the setup.exe on clean machines that have Claude Code and the Codex CLI;
  start a session on each agent and a cross-agent sub-session.
- Bump `version` in `package.json` and the pins in `docs/VERSIONS.md`.

## Logs

Main-process events and errors go to `main.log` (rotated at 5 MB to `main.1.log`) in the system
log folder: `~/Library/Logs/Claude Codex` on macOS, `%APPDATA%\Claude Codex\logs` on Windows.
Settings › General › Open log folder opens it. The log never holds prompts, replies, file
contents or credentials; anything shaped like a key or token is redacted.

## Name and icon

"Claude Codex" and `build/icon.png` (two panes side by side) are working choices; the plan lists
the final name and icon as an open question. Agent icons in the UI are Lucide placeholders behind
`<AgentIcon />` until the vendors' brand guidelines are checked.
