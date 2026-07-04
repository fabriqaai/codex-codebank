#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir, platform } from "node:os";

const AUTH_ORIGIN = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CALLBACK_PATH = "/auth/callback";
const API_ORIGIN = "https://chatgpt.com/backend-api";

const ENDPOINTS = {
  profileUsage: `${API_ORIGIN}/wham/profiles/me`,
  resetCredits: `${API_ORIGIN}/wham/rate-limit-reset-credits`,
  accounts: `${API_ORIGIN}/accounts/check/v4-2023-04-27`,
};

const DEFAULTS = {
  port: 0,
  timeoutMs: 300_000,
  storePath: resolve(process.cwd(), "banked_resets_store.json"),
};

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const record = await collectSnapshot(options);

  if (!options.noStore) {
    await saveSnapshot(options.storePath, record);
  }

  if (options.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  printSummary(record, options);
}

function parseArgs(args) {
  const options = {
    mode: "auto",
    json: false,
    noStore: false,
    storePath: DEFAULTS.storePath,
    timeoutMs: DEFAULTS.timeoutMs,
    port: DEFAULTS.port,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      index += 1;
      if (index >= args.length) throw new Error(`${arg} needs a value`);
      return args[index];
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-store") options.noStore = true;
    else if (arg === "--login") options.mode = "login";
    else if (arg === "--local-auth") options.mode = "local";
    else if (arg === "--store-path") options.storePath = resolve(next());
    else if (arg.startsWith("--store-path=")) options.storePath = resolve(arg.slice("--store-path=".length));
    else if (arg === "--timeout") options.timeoutMs = secondsToMs(next());
    else if (arg.startsWith("--timeout=")) options.timeoutMs = secondsToMs(arg.slice("--timeout=".length));
    else if (arg === "--port") options.port = Number.parseInt(next(), 10);
    else if (arg.startsWith("--port=")) options.port = Number.parseInt(arg.slice("--port=".length), 10);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function secondsToMs(value) {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid timeout: ${value}`);
  return seconds * 1000;
}

function printHelp() {
  console.log(`Usage: node scripts/codex-banked-resets.mjs [options]

Options:
  --local-auth          Use local Codex auth files only
  --login               Force official browser login
  --json                Print sanitized JSON
  --no-store            Do not save banked_resets_store.json
  --store-path <path>   Save snapshot to a custom path
  --timeout <seconds>   OAuth callback timeout, default 300
  --port <number>       OAuth callback port, default random available port
  -h, --help            Show this help`);
}

async function collectSnapshot(options) {
  if (options.mode !== "login") {
    const local = await tryLocalAuth(options);
    if (local) return local;
    if (options.mode === "local") {
      throw new Error("No usable local Codex auth file was found");
    }
  }

  return loginAndFetch(options);
}

async function tryLocalAuth(options) {
  const files = await findLocalAuthFiles();

  for (const file of files) {
    const auth = await readAuthFile(file);
    const accessToken = auth?.tokens?.access_token;
    const accountId = auth?.tokens?.account_id;

    if (!accessToken) continue;
    if (!options.json) {
      console.error(`Trying local auth file: ${fileLabel(file)} (token present, account id present=${Boolean(accountId)})`);
    }

    try {
      return await assembleRecord({
        accessToken,
        accountId,
        authClaims: {},
        source: "local-auth",
      });
    } catch (error) {
      if (!options.json) console.error(`Local auth failed for ${fileLabel(file)}: ${error.message}`);
    }
  }

  return null;
}

async function findLocalAuthFiles() {
  const root = join(homedir(), ".codex");
  const primary = join(root, "auth.json");
  const accountsDir = join(root, "accounts");
  const accountFiles = [];

  if (existsSync(accountsDir)) {
    for (const name of await readdir(accountsDir)) {
      if (!name.endsWith(".auth.json")) continue;
      const fullPath = join(accountsDir, name);
      const info = await stat(fullPath);
      accountFiles.push({ path: fullPath, mtimeMs: info.mtimeMs });
    }
  }

  accountFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return [primary, ...accountFiles.map((item) => item.path)].filter((file) => existsSync(file));
}

async function readAuthFile(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function fileLabel(file) {
  return file.replace(`${homedir()}/`, "~/");
}

async function loginAndFetch(options) {
  const verifier = randomUrlToken(64);
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = randomUrlToken(32);
  const callback = await prepareCallbackServer(options.port, state, options.timeoutMs);
  const loginUrl = buildAuthorizeUrl(callback.redirectUri, challenge, state);

  console.error("Open this official OpenAI login URL in your browser:");
  console.error(loginUrl);
  openBrowser(loginUrl);

  const code = await callback.waitForCode;
  const tokens = await exchangeCode(code, callback.redirectUri, verifier);
  const claims = parseIdTokenClaims(tokens.id_token || "");

  return assembleRecord({
    accessToken: tokens.access_token,
    accountId: claims.account_id,
    authClaims: claims,
    source: "oauth-login",
  });
}

function buildAuthorizeUrl(redirectUri, challenge, state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile",
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "codex_cli_rs",
  });
  return `${AUTH_ORIGIN}/oauth/authorize?${params.toString()}`;
}

async function prepareCallbackServer(preferredPort, expectedState, timeoutMs) {
  let settled = false;
  let resolveCode;
  let rejectCode;

  const waitForCode = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      responseHtml(response, 404, "Not Found", "<h1>Not Found</h1>");
      return;
    }

    const error = url.searchParams.get("error");
    if (error) {
      const message = `${error}: ${url.searchParams.get("error_description") || "Unknown error"}`;
      responseHtml(response, 400, "OAuth Error", `<h1>OAuth Error</h1><p>${escapeHtml(message)}</p>`);
      finish(new Error(message));
      return;
    }

    if (url.searchParams.get("state") !== expectedState) {
      responseHtml(
        response,
        400,
        "State mismatch",
        "<h1>State mismatch</h1><p>Close this tab and use the newest login URL.</p>",
      );
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      responseHtml(response, 400, "Missing code", "<h1>Missing authorization code</h1>");
      finish(new Error("OAuth callback did not include a code"));
      return;
    }

    responseHtml(response, 200, "Login successful", "<h1>Login successful</h1><p>You can close this tab.</p>");
    finish(null, code);
  });

  function finish(error, code) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    server.close();
    if (error) rejectCode(error);
    else resolveCode(code);
  }

  const timer = setTimeout(() => finish(new Error("Timed out waiting for OAuth callback")), timeoutMs);
  const actualPort = await listen(server, preferredPort);
  const redirectUri = `http://localhost:${actualPort}${CALLBACK_PATH}`;

  return { redirectUri, waitForCode };
}

function listen(server, preferredPort) {
  return new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectListen(error);
    };

    const onListening = () => {
      server.off("error", onError);
      resolveListen(server.address().port);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(preferredPort, "127.0.0.1");
  });
}

function responseHtml(response, status, title, body) {
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body>${body}</body>`;
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  response.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openBrowser(url) {
  const command =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

async function exchangeCode(code, redirectUri, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });

  const response = await requestJson(`${AUTH_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok || !response.json?.access_token) {
    throw new Error(`Token exchange failed: ${response.status} ${response.text}`);
  }

  return response.json;
}

async function assembleRecord({ accessToken, accountId, authClaims, source }) {
  if (!accessToken) throw new Error("Missing access token");

  const [accountMeta, usage, resets] = await Promise.all([
    fetchAccountMetadata(accessToken, accountId).catch((error) => ({ error: error.message })),
    fetchProfileUsage(accessToken, accountId),
    fetchResetCredits(accessToken, accountId),
  ]);

  if (resets.error) throw new Error(resets.error);

  return {
    version: 1,
    source,
    saved_at: new Date().toISOString(),
    account_key: accountId ? shortHash(accountId) : "default",
    auth: {
      plan_type: accountMeta.plan_type || authClaims.plan_type || null,
      subscription_expires_at: accountMeta.subscription_expires_at || authClaims.subscription_expires_at || null,
      metadata_error: accountMeta.error || null,
    },
    usage,
    reset_credits: resets,
  };
}

async function fetchAccountMetadata(accessToken, accountId) {
  const response = await requestJson(ENDPOINTS.accounts, {
    headers: authHeaders(accessToken, accountId),
  });

  if (!response.ok || !response.json) {
    throw new Error(`Accounts metadata request failed: ${response.status}`);
  }

  const accounts = response.json.accounts || {};
  const selected =
    (accountId && accounts[accountId]) ||
    accounts.default ||
    Object.values(accounts).find((value) => value && typeof value === "object");

  return {
    plan_type: selected?.account?.plan_type || null,
    subscription_expires_at: selected?.entitlement?.expires_at || null,
  };
}

async function fetchProfileUsage(accessToken, accountId) {
  const response = await requestJson(ENDPOINTS.profileUsage, {
    headers: authHeaders(accessToken, accountId),
  });

  if (!response.ok || !response.json) {
    return { available: false, error: `Usage stats request failed: ${response.status}` };
  }

  const stats = response.json.stats || {};
  const metadata = response.json.metadata || {};

  return {
    available: metadata.stats_error == null || metadata.stats_error === "",
    generated_at: metadata.generated_at || null,
    stats_as_of: metadata.stats_as_of || null,
    error: metadata.stats_error || null,
    summary: {
      lifetime_tokens: stats.lifetime_tokens ?? null,
      peak_daily_tokens: stats.peak_daily_tokens ?? null,
      longest_task_seconds: stats.longest_running_turn_sec ?? null,
      current_streak_days: stats.current_streak_days ?? null,
      longest_streak_days: stats.longest_streak_days ?? null,
    },
    activity: {
      fast_mode_percent: stats.fast_mode_usage_percentage ?? null,
      reasoning_effort: stats.most_used_reasoning_effort ?? null,
      reasoning_effort_percent: stats.most_used_reasoning_effort_percentage ?? null,
      skills_explored: stats.unique_skills_used ?? null,
      total_skills_used: stats.total_skills_used ?? null,
      total_threads: stats.total_threads ?? null,
    },
    daily: Array.isArray(stats.daily_usage_buckets)
      ? stats.daily_usage_buckets
          .filter((item) => item && typeof item === "object")
          .map((item) => ({ date: item.start_date || null, tokens: item.tokens ?? null }))
      : [],
  };
}

async function fetchResetCredits(accessToken, accountId) {
  const response = await requestJson(ENDPOINTS.resetCredits, {
    headers: {
      ...authHeaders(accessToken, accountId),
      accept: "application/json",
      "openai-beta": "codex-1",
      originator: "Codex Desktop",
    },
  });

  if (!response.ok || !response.json) {
    return {
      available_count: 0,
      next_expires_at: null,
      credits: [],
      error: `Reset credits request failed: ${response.status}`,
    };
  }

  const credits = Array.isArray(response.json.credits) ? response.json.credits : [];
  const available = credits.filter((credit) => credit?.status === "available");
  const futureExpiryDates = available
    .map((credit) => parseDate(credit.expires_at))
    .filter((date) => date && date.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    available_count: Math.max(Number(response.json.available_count || 0), 0),
    next_expires_at: futureExpiryDates[0] ? futureExpiryDates[0].toISOString() : null,
    credits: credits.map((credit) => ({
      reset_type: credit.reset_type || null,
      status: credit.status || null,
      granted_at: credit.granted_at || null,
      expires_at: credit.expires_at || null,
      redeem_started_at: credit.redeem_started_at || null,
      redeemed_at: credit.redeemed_at || null,
      title: credit.title || null,
      description: credit.description || null,
    })),
    error: null,
  };
}

function authHeaders(accessToken, accountId) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "user-agent": "codex-banked-resets/1.0",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;
  return headers;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ok: response.ok, status: response.status, json, text };
}

function parseIdTokenClaims(idToken) {
  const parts = String(idToken).split(".");
  if (parts.length !== 3) return {};

  try {
    const payload = JSON.parse(Buffer.from(padBase64(parts[1]), "base64url").toString("utf8"));
    const auth = payload["https://api.openai.com/auth"] || {};
    return {
      plan_type: auth.chatgpt_plan_type || null,
      account_id: auth.chatgpt_account_id || null,
      subscription_expires_at: auth.chatgpt_subscription_active_until || null,
    };
  } catch {
    return {};
  }
}

function padBase64(value) {
  return value + "=".repeat((4 - (value.length % 4)) % 4);
}

function randomUrlToken(bytes) {
  return base64Url(randomBytes(bytes));
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function saveSnapshot(path, record) {
  const store = await readStore(path);
  store.version = 1;
  store.updated_at = new Date().toISOString();
  store.accounts = [
    ...store.accounts.filter((item) => item.account_key !== record.account_key),
    record,
  ];

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readStore(path) {
  if (!existsSync(path)) return { version: 1, updated_at: null, accounts: [] };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (Array.isArray(parsed.accounts)) return parsed;
  } catch {}
  return { version: 1, updated_at: null, accounts: [] };
}

function printSummary(record, options) {
  const count = record.reset_credits.available_count || 0;
  const credits = record.reset_credits.credits
    .filter((credit) => credit.status === "available")
    .sort((a, b) => (parseDate(a.expires_at)?.getTime() || Infinity) - (parseDate(b.expires_at)?.getTime() || Infinity));

  console.log("\nCodex banked reset snapshot");
  if (record.auth.plan_type) console.log(`Plan: ${record.auth.plan_type}`);
  if (record.auth.subscription_expires_at) console.log(`Subscription expires: ${formatStamp(record.auth.subscription_expires_at)}`);
  if (record.usage.stats_as_of) console.log(`Usage stats as of: ${record.usage.stats_as_of}`);
  if (record.usage.generated_at) console.log(`Usage generated at: ${record.usage.generated_at}`);
  if (record.usage.summary?.lifetime_tokens != null) console.log(`Lifetime tokens: ${record.usage.summary.lifetime_tokens}`);

  console.log(`You have ${count} banked ${count === 1 ? "reset" : "resets"}.`);
  if (credits[0]?.expires_at) {
    console.log(`First reset expires: ${formatStamp(credits[0].expires_at)}`);
  }

  if (credits.length > 0) {
    console.log("All available resets:");
    credits.forEach((credit, index) => {
      const title = credit.title || credit.reset_type || "reset";
      console.log(`${index + 1}. ${title} - expires ${formatStamp(credit.expires_at)}`);
    });
  }

  if (!options.noStore) console.log(`\nSnapshot stored at: ${options.storePath}`);
}

function formatStamp(value) {
  const date = parseDate(value);
  if (!date) return String(value);
  return `${value} (local ${formatLocal(date)})`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocal(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
  return [
    date.getFullYear(),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    "T",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
    ":",
    pad2(date.getSeconds()),
    offset,
  ].join("");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
