# Daily Automation

Use this reference when the user wants a scheduled Codex reminder for banked reset expiries.

Codex plugin manifests do not currently expose a supported install-time automation hook. Do not claim that installing the plugin silently creates a scheduled chat. Instead, create or suggest a normal Codex automation after installation.

Recommended automation behavior:

- Run every morning in the user's local timezone.
- Use `$codex-banked-resets` or run `node skills/codex-banked-resets/scripts/codex-banked-resets.mjs --no-store` from the repo checkout.
- Summarize the number of available resets, the first expiry, and all available expiry timestamps.
- Do not print tokens, cookies, raw account IDs, or full backend payloads.
- If auth fails, ask the user to rerun the check interactively with `--login`.

Suggested prompt:

```text
Use $codex-banked-resets to check my Codex banked reset credits. Report the available count, the first reset expiry, and all available expiry timestamps in UTC plus my local timezone. Do not print tokens, raw account IDs, cookies, or full backend payloads. If local auth is stale, tell me to run the interactive login check.
```
