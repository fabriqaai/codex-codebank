---
name: codex-banked-resets
description: Check live Codex or ChatGPT Codex banked reset credits, reset expiry times, profile usage metadata, and all locally configured Codex accounts with a bundled JavaScript script. Use when the user asks when Codex resets start expiring, how many banked resets they have, whether multiple accounts are readable, or wants a reusable procedure for Codex banked usage limits.
---

# Codex Banked Resets

## Overview

Use this skill to answer a user's live Codex banked reset question from local truth. Prefer the bundled JavaScript script, avoid printing secrets, and return exact expiry dates in UTC plus the user's local timezone when known. Local-auth checks should cover every unique local Codex account instead of silently stopping at the first readable credential.

## Workflow

1. Locate this skill's root directory and run `node scripts/codex-banked-resets.mjs`.
2. Prefer local Codex auth at `~/.codex/auth.json` or `~/.codex/accounts/*.auth.json`; the script discovers and deduplicates all unique local credentials first.
3. Use `--login` only when local auth files are missing or when the specific account the user cares about is stale/rejected and needs a fresh official login.
4. Never print raw access tokens, refresh tokens, ID tokens, account IDs, cookies, or full backend payloads.
5. Report:
   - every discovered account as `Account 1`, `Account 2`, etc.
   - available banked reset count per readable account
   - first reset expiry per readable account
   - all available reset expiries per readable account
   - stale/rejected status per unreadable account
   - timestamps in UTC and local timezone
6. Stop any leftover local callback listener before finishing if an OAuth login run is interrupted.

## Bundled Resources

- `scripts/codex-banked-resets.mjs`: deterministic Node.js utility for local-auth and OAuth reset checks.
- `references/daily-automation.md`: guidance for scheduled morning reminder prompts and plugin install limitations.

## Commands

Run the default local-auth-first check:

```bash
node scripts/codex-banked-resets.mjs
```

Run the old first-readable-account behavior:

```bash
node scripts/codex-banked-resets.mjs --first
```

Force the browser login flow:

```bash
node scripts/codex-banked-resets.mjs --login
```

Print machine-readable sanitized JSON:

```bash
node scripts/codex-banked-resets.mjs --json
```

Use a custom snapshot path:

```bash
node scripts/codex-banked-resets.mjs --store-path ./banked_resets_store.json
```

## Daily Automation

When the user asks for a recurring reminder, read `references/daily-automation.md` before creating or updating the Codex automation. Prefer a morning local-time schedule and keep the prompt privacy-safe.

## Output Rules

- State the answer per account first: "Account 1: You have N banked resets" and "The first one expires at ...". If an account is stale or rejected, say that directly without treating it as fatal for other accounts.
- Include exact RFC3339/UTC values when available.
- Include local converted times using concrete dates; do not rely only on words like "today" or "next week".
- Mention the data source briefly as live Codex reset credit data from local Codex auth or official login.
- Do not include sensitive identifiers, auth filenames, backend response bodies, or token-derived claims beyond plan/usage/reset summaries needed for the user's question.
