# Codex Codebank

A small skill and Codex plugin package for checking Codex banked reset credits and their expiry times.

The skill includes a JavaScript utility that tries local Codex auth first, falls back to official browser login when requested, and prints a sanitized reset summary without exposing tokens or raw account identifiers.

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

- number of available banked resets
- first reset expiry
- all available reset expiries
- usage metadata when available
- UTC timestamps plus local timezone rendering

## Privacy Notes

The script reads local Codex auth files only to call the live reset-credit endpoint. It does not print tokens, cookies, raw account IDs, or full backend payloads. Saved snapshots use a short hash as the account key.
