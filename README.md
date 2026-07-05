# Codex Codebank

A small skill and Codex plugin package for checking Codex banked reset credits and their expiry times.

The skill includes a JavaScript utility that discovers all unique local Codex auth credentials, reports each account separately, falls back to official browser login when requested, and prints a sanitized reset summary without exposing tokens or raw account identifiers.

Works as either:

- a [`skills.sh`](https://skills.sh/)-compatible skill
- a Codex plugin package published from this repository

## Install As A Skill

```bash
npx skills add fabriqaai/codex-codebank@codex-banked-resets
```

Install directly from GitHub:

```bash
npx skills add https://github.com/fabriqaai/codex-codebank --skill codex-banked-resets
```

Install globally and skip prompts:

```bash
npx skills add fabriqaai/codex-codebank@codex-banked-resets -g -y
```

After indexing, the skill page should be available on
[skills.sh](https://www.skills.sh/fabriqaai/codex-codebank/codex-banked-resets).

## Install As A Codex Plugin

Add this GitHub repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add fabriqaai/codex-codebank --ref main
```

Install the plugin from that marketplace:

```bash
codex plugin add codex-codebank@codex-codebank
```

## Run The Utility

From this repository:

```bash
node skills/codex-banked-resets/scripts/codex-banked-resets.mjs
```

By default, local auth mode reports every unique credential found in `~/.codex/auth.json` and `~/.codex/accounts/*.auth.json`. If a secondary account is stale or rejected, the utility keeps reporting the other accounts and marks the stale one with the HTTP status returned by the usage/reset endpoints.

Use the old first-readable-account behavior:

```bash
node skills/codex-banked-resets/scripts/codex-banked-resets.mjs --first
```

Force browser login:

```bash
node skills/codex-banked-resets/scripts/codex-banked-resets.mjs --login
```

Print sanitized JSON:

```bash
node skills/codex-banked-resets/scripts/codex-banked-resets.mjs --json
```

Use a custom snapshot path:

```bash
node skills/codex-banked-resets/scripts/codex-banked-resets.mjs --store-path ./banked_resets_store.json
```

## Daily Reminder Automation

Codex plugin manifests do not currently include an install-time automation hook. After installing the skill or plugin, create a Codex scheduled automation that asks Codex to use `$codex-banked-resets` every morning and summarize the first expiry plus all available reset credits.

From a clone of this repository, the direct command is:

```bash
npm run check:resets
```

## What It Reports

- every discovered local Codex account, labeled `Account 1`, `Account 2`, etc.
- number of available banked resets per readable account
- first reset expiry per readable account
- all available reset expiries per readable account
- usage metadata when available
- stale or rejected account status when usage/reset endpoints fail
- UTC timestamps plus local timezone rendering

## Privacy Notes

The script reads local Codex auth files only to call the live reset-credit endpoint. It does not print tokens, cookies, raw account IDs, auth filenames, or full backend payloads. Saved snapshots use a short hash as the account key.
