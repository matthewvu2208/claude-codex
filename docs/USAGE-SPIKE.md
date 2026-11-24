# Usage meter spike

The sidebar usage card is fed by:

- **Claude:** `rate_limit_event` messages from the Agent SDK (`rate_limit_info`: `status`,
  `utilization`, `resetsAt`, `rateLimitType`). They arrive with replies, so the card shows "—"
  until the first reply, then keeps the last value across restarts.
- **Codex:** `account/rateLimits/read` once signed in with ChatGPT, then
  `account/rateLimits/updated` notifications, plus a refresh every 5 minutes. The card uses
  `primary` (`usedPercent`, `windowDurationMins`, `resetsAt`).

## Assumptions to check against real payloads

1. `utilization` scale: the SDK does not document it. Values up to 1 are read as a fraction,
   larger ones as a percentage (`utilizationPercent` in `shared/usage.ts`).
2. The window label comes from `rateLimitType` (`seven_day` → "Weekly · all models",
   `five_hour` → "5-hour"); unknown types are shown as sent, never guessed.
3. `resetsAt` is read as epoch seconds (or milliseconds when ≥ 10¹²).
4. Codex `primary` is the window to show; `secondary` is ignored.

## Running the spike

Sign in to both agents through the app (Claude: "Sign in" opens `claude auth login` in a
terminal; Codex: ChatGPT browser sign-in), then start the app with:

```bash
CLAUDE_CODEX_LOG_USAGE=1 npm run dev
```

Run a turn on each agent. Every raw payload is appended to `usage-spike.jsonl` in the app's
user-data folder (payloads hold no tokens). Compare them with the assumptions above and adjust
`shared/usage.ts` if any differ.

The SDK's `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` would fill the Claude
meter before the first reply, but it is marked unstable, so it is not used.
