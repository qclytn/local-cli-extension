#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const MACOS_CODEX_BIN = "/Applications/Codex.app/Contents/Resources/codex";
const DEFAULT_CURSOR_BIN = process.env.LOCAL_CLI_CURSOR_BIN || "cursor-agent";
const HOST = process.env.LOCAL_CLI_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.LOCAL_CLI_BRIDGE_PORT || 8765);
const TOKEN_FILE = process.env.LOCAL_CLI_BRIDGE_TOKEN_FILE || path.join(os.homedir(), ".local-cli-extension", "bridge-token");
const DEFAULT_WORK_DIR = process.env.LOCAL_CLI_BRIDGE_WORKDIR || os.homedir();
const DEFAULT_TIMEOUT_MS = Number(process.env.LOCAL_CLI_BRIDGE_TIMEOUT_MS || 180000);
const DEFAULT_MODELS_CACHE_FILE = process.env.LOCAL_CLI_MODELS_CACHE_FILE || path.join(os.homedir(), ".codex", "models_cache.json");
const DEFAULT_OLLAMA_BASE_URL = (process.env.LOCAL_CLI_OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const DEFAULT_OLLAMA_MODEL = process.env.LOCAL_CLI_OLLAMA_MODEL || "qwen3.5:4b";
const DEFAULT_OPENAI_MODELS_PATH = "/models";
const DEFAULT_OPENAI_CHAT_COMPLETIONS_PATH = "/chat/completions";

const token = ensureToken();
const activeRequests = new Map();

const server = http.createServer(async (req, res) => {
  try {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: "Unauthorized bridge request." });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const codexBin = resolveCodexBin({});
      sendJson(res, 200, {
        ok: true,
        codexAvailable: commandExists(codexBin),
        codexBin,
        workDir: DEFAULT_WORK_DIR
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/providers/models") {
      const provider = url.searchParams.get("provider") || "codex-cli";
      const models = await loadProviderModels(provider, url.searchParams);
      sendJson(res, 200, { ok: true, provider, models });
      return;
    }

    if (req.method === "GET" && url.pathname === "/providers/health") {
      const health = await getProviderHealth(url.searchParams);
      sendJson(res, 200, { ok: true, ...health });
      return;
    }

    if (req.method === "POST" && url.pathname === "/chat") {
      const body = await readJson(req);
      const reply = await runChat(body);
      sendJson(res, 200, { ok: true, reply });
      return;
    }

    if (req.method === "POST" && url.pathname === "/translate/stream") {
      const body = await readJson(req);
      await streamTranslation(body, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/cancel") {
      const body = await readJson(req);
      const cancelled = cancelRequest(body.requestId);
      sendJson(res, 200, { ok: true, cancelled });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local CLI Extension bridge listening at http://${HOST}:${PORT}`);
  console.log(`Bridge token file: ${TOKEN_FILE}`);
  console.log(`Bridge token: ${token}`);
});

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (origin.startsWith("chrome-extension://")) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-bridge-token");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function writeNdjson(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

function ensureToken() {
  if (process.env.LOCAL_CLI_BRIDGE_TOKEN) return process.env.LOCAL_CLI_BRIDGE_TOKEN;
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  }
  const generated = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, `${generated}\n`, { mode: 0o600 });
  return generated;
}

function isAuthorized(req) {
  const supplied = req.headers["x-bridge-token"];
  if (typeof supplied !== "string") return false;
  const suppliedBuffer = Buffer.from(supplied);
  const tokenBuffer = Buffer.from(token);
  if (suppliedBuffer.length !== tokenBuffer.length) return false;
  return crypto.timingSafeEqual(suppliedBuffer, tokenBuffer);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 512_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

async function runChat(body) {
  const provider = body.provider || "codex-cli";
  if (provider === "codex-cli") {
    return runCodexChat(body);
  }
  if (provider === "openai-compatible") {
    return runOpenAICompatibleChat(body);
  }
  if (provider === "cursor-cli") {
    return runCursorChat(body);
  }
  throw new Error(`Unsupported chat provider: ${provider}`);
}

function runCodexChat(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new Error("No chat messages were provided.");

  const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  const codex = normalizeCodexSettings(body.providerSettings?.codex || {});
  const prompt = buildPrompt(messages, body.systemPrompt);
  const args = ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never"];
  if (body.model) args.push("--model", String(body.model));
  if (body.reasoningEffort) args.push("-c", `model_reasoning_effort=\"${String(body.reasoningEffort)}\"`);
  args.push("-");

  return new Promise((resolve, reject) => {
    const child = spawn(codex.bin, args, {
      cwd: codex.workDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelled = false;
    const timeout = setTimeout(() => {
      cancelled = true;
      terminateChild(child);
      finish(new Error("Codex request timed out."));
    }, codex.timeoutMs);

    activeRequests.set(requestId, {
      cancel() {
        cancelled = true;
        terminateChild(child);
      }
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", finish);
    child.on("close", (code) => {
      if (cancelled) {
        finish(new Error("Codex request cancelled."));
        return;
      }
      if (code !== 0) {
        finish(new Error(cleanError(stderr) || `codex exited with code ${code}`));
        return;
      }
      finish(null, cleanCodexOutput(stdout));
    });
    child.stdin.end(prompt);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeRequests.delete(requestId);
      if (error) reject(error);
      else resolve(result || "");
    }
  });
}

async function runOpenAICompatibleChat(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new Error("No chat messages were provided.");
  const settings = normalizeOpenAISettings(body.providerSettings?.openaiCompatible || {});
  if (!settings.baseUrl || !settings.chatModel && !body.model) {
    throw new Error("openai-compatible chat needs baseUrl and model.");
  }
  const response = await fetch(`${settings.baseUrl}${settings.chatCompletionsPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(settings.apiKey)
    },
    body: JSON.stringify({
      model: body.model || settings.chatModel,
      stream: false,
      messages: buildOpenAIMessages(messages, body.systemPrompt)
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `openai-compatible request failed (${response.status})`);
  }
  return data.choices?.[0]?.message?.content || "";
}

function runCursorChat(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) throw new Error("No chat messages were provided.");

  const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  const cursor = normalizeCursorSettings(body.providerSettings?.cursor || {});
  if (!commandExists(cursor.bin)) {
    throw new Error(`cursor-cli is not installed or not in PATH: ${cursor.bin}`);
  }

  const args = ["-p", "--output-format", "json"];
  if (body.model) args.push("-m", String(body.model));
  if (cursor.baseUrl) args.push("--endpoint", cursor.baseUrl);
  if (cursor.apiKey) args.push("-a", cursor.apiKey);
  args.push(buildCursorPrompt(messages, body.systemPrompt));

  return new Promise((resolve, reject) => {
    const child = spawn(cursor.bin, args, {
      cwd: cursor.workDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: cursor.apiKey
        ? { ...process.env, CURSOR_API_KEY: cursor.apiKey }
        : { ...process.env }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelled = false;
    const timeout = setTimeout(() => {
      cancelled = true;
      terminateChild(child);
      finish(new Error("Cursor request timed out."));
    }, cursor.timeoutMs);

    activeRequests.set(requestId, {
      cancel() {
        cancelled = true;
        terminateChild(child);
      }
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", finish);
    child.on("close", (code) => {
      if (cancelled) {
        finish(new Error("Cursor request cancelled."));
        return;
      }
      if (code !== 0) {
        finish(new Error(cleanError(stderr || stdout) || `cursor-agent exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        const result = parsed?.result;
        if (typeof result !== "string") {
          throw new Error("Cursor CLI returned an unexpected JSON payload.");
        }
        finish(null, result.trim());
      } catch (error) {
        finish(new Error(error.message || "Failed to parse Cursor CLI output."));
      }
    });

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeRequests.delete(requestId);
      if (error) reject(error);
      else resolve(result || "");
    }
  });
}

async function loadProviderModels(provider, searchParams) {
  if (provider === "codex-cli") {
    return loadCodexModels(searchParams.get("modelsCacheFile") || DEFAULT_MODELS_CACHE_FILE);
  }
  if (provider === "cursor-cli") {
    return [
      { slug: "", displayName: "Default", description: "Use Cursor's default model selection." },
      { slug: "auto", displayName: "auto", description: "Let Cursor pick the model automatically." },
      { slug: "gpt-5", displayName: "gpt-5", description: "OpenAI GPT-5 via Cursor." },
      { slug: "claude-4-sonnet", displayName: "claude-4-sonnet", description: "Anthropic Claude Sonnet via Cursor." }
    ];
  }
  if (provider === "openai-compatible") {
    const settings = normalizeOpenAISettings({
      baseUrl: searchParams.get("baseUrl") || "",
      apiKey: searchParams.get("apiKey") || "",
      modelsPath: searchParams.get("modelsPath") || DEFAULT_OPENAI_MODELS_PATH
    });
    if (!settings.baseUrl) return [];
    const response = await fetch(`${settings.baseUrl}${settings.modelsPath}`, {
      headers: authHeaders(settings.apiKey)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return Array.isArray(data.data)
      ? data.data.map((item) => ({ slug: item.id, displayName: item.id, description: item.owned_by || "" }))
      : [];
  }
  return [];
}

async function getProviderHealth(searchParams) {
  const chatProvider = searchParams.get("chatProvider") || "codex-cli";
  const translationProvider = searchParams.get("translationProvider") || "ollama";

  return {
    chat: await getChatProviderHealth(chatProvider, searchParams),
    translation: await getTranslationProviderHealth(translationProvider, searchParams)
  };
}

async function getChatProviderHealth(provider, params) {
  if (provider === "codex-cli") {
    const bin = resolveCodexBin({ bin: params.get("codexBin") || "" });
    return {
      provider,
      ok: commandExists(bin),
      message: commandExists(bin) ? `Chat provider ready: ${provider}` : `Chat provider missing: ${provider}`
    };
  }
  if (provider === "cursor-cli") {
    const settings = normalizeCursorSettings({
      bin: params.get("cursorBin") || "",
      baseUrl: params.get("cursorBaseUrl") || "",
      apiKey: params.get("cursorApiKey") || ""
    });
    if (!commandExists(settings.bin)) {
      return { provider, ok: false, message: `Chat provider missing: ${settings.bin}` };
    }
    if (settings.apiKey) {
      return { provider, ok: true, message: `Chat provider ready: ${provider} (API key)` };
    }
    const status = getCursorStatus(settings);
    return {
      provider,
      ok: status.ok,
      message: status.ok ? `Chat provider ready: ${provider}` : status.message
    };
  }
  if (provider === "openai-compatible") {
    const settings = normalizeOpenAISettings({
      baseUrl: params.get("openaiBaseUrl") || "",
      apiKey: params.get("openaiApiKey") || "",
      modelsPath: params.get("openaiModelsPath") || DEFAULT_OPENAI_MODELS_PATH
    });
    if (!settings.baseUrl) {
      return { provider, ok: false, message: "Chat provider needs an OpenAI-compatible base URL." };
    }
    try {
      const response = await fetch(`${settings.baseUrl}${settings.modelsPath}`, { headers: authHeaders(settings.apiKey) });
      return { provider, ok: response.ok, message: response.ok ? `Chat provider ready: ${provider}` : `Chat provider failed: ${provider}` };
    } catch {
      return { provider, ok: false, message: `Chat provider unreachable: ${provider}` };
    }
  }
  return { provider, ok: false, message: `Unsupported chat provider: ${provider}` };
}

async function getTranslationProviderHealth(provider, params) {
  if (provider === "ollama") {
    const baseUrl = normalizeBaseUrl(params.get("ollamaBaseUrl") || DEFAULT_OLLAMA_BASE_URL);
    const model = params.get("ollamaModel") || DEFAULT_OLLAMA_MODEL;
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      const data = await response.json().catch(() => ({}));
      const models = Array.isArray(data.models) ? data.models : [];
      const ready = response.ok && models.some((item) => item?.name === model);
      return { provider, ok: ready, message: ready ? `Translation provider ready: ${provider}` : `Model not pulled: ${model}` };
    } catch {
      return { provider, ok: false, message: "Ollama unavailable." };
    }
  }
  if (provider === "openai-compatible") {
    const settings = normalizeOpenAISettings({
      baseUrl: params.get("openaiBaseUrl") || "",
      apiKey: params.get("openaiApiKey") || "",
      modelsPath: params.get("openaiModelsPath") || DEFAULT_OPENAI_MODELS_PATH
    });
    if (!settings.baseUrl) {
      return { provider, ok: false, message: "Translation provider needs an OpenAI-compatible base URL." };
    }
    try {
      const response = await fetch(`${settings.baseUrl}${settings.modelsPath}`, { headers: authHeaders(settings.apiKey) });
      return { provider, ok: response.ok, message: response.ok ? `Translation provider ready: ${provider}` : `Translation provider failed: ${provider}` };
    } catch {
      return { provider, ok: false, message: `Translation provider unreachable: ${provider}` };
    }
  }
  return { provider, ok: false, message: `Unsupported translation provider: ${provider}` };
}

async function streamTranslation(body, res) {
  const provider = body.provider || "ollama";
  if (!Array.isArray(body.texts) || body.texts.length === 0) {
    throw new Error("No translation text was provided.");
  }
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store"
  });
  if (provider === "ollama") {
    await streamOllamaTranslations(body, res);
    return;
  }
  if (provider === "openai-compatible") {
    await streamOpenAICompatibleTranslations(body, res);
    return;
  }
  writeNdjson(res, { type: "error", error: `Unsupported translation provider: ${provider}` });
  res.end();
}

async function streamOllamaTranslations(body, res) {
  const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  const settings = normalizeOllamaSettings(body.providerSettings?.ollama || {});
  const controller = new AbortController();
  activeRequests.set(requestId, { cancel: () => controller.abort() });

  try {
    for (let index = 0; index < body.texts.length; index += 1) {
      await streamOneOllamaTranslation({
        text: String(body.texts[index] || ""),
        index,
        targetLanguage: body.targetLanguage || "简体中文",
        settings,
        signal: controller.signal,
        res
      });
      writeNdjson(res, { type: "segment_done", index });
    }
    writeNdjson(res, { type: "done" });
  } catch (error) {
    if (controller.signal.aborted) {
      writeNdjson(res, { type: "cancelled" });
    } else {
      writeNdjson(res, { type: "error", error: formatTranslationError(error, settings.model) });
    }
  } finally {
    activeRequests.delete(requestId);
    res.end();
  }
}

async function streamOneOllamaTranslation({ text, index, targetLanguage, settings, signal, res }) {
  const response = await fetch(`${settings.baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...authHeaders(settings.apiKey)
    },
    body: JSON.stringify({
      model: settings.model,
      think: settings.think,
      stream: settings.stream,
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content: `Translate the user's text into ${targetLanguage}. Return only the translated text. Do not explain. Do not include reasoning.`
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  });
  if (!response.ok || !response.body) {
    const error = await response.text().catch(() => "");
    throw new Error(error || `Ollama request failed (${response.status})`);
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      const chunk = stripThinkBlocks(event.message?.content || event.response || "");
      if (chunk) writeNdjson(res, { type: "delta", index, text: chunk });
    }
  }
}

async function streamOpenAICompatibleTranslations(body, res) {
  const requestId = typeof body.requestId === "string" && body.requestId ? body.requestId : crypto.randomUUID();
  const settings = normalizeOpenAISettings(body.providerSettings?.openaiCompatible || {});
  const controller = new AbortController();
  activeRequests.set(requestId, { cancel: () => controller.abort() });

  try {
    for (let index = 0; index < body.texts.length; index += 1) {
      await streamOneOpenAITranslation({
        text: String(body.texts[index] || ""),
        index,
        targetLanguage: body.targetLanguage || "简体中文",
        settings,
        signal: controller.signal,
        res
      });
      writeNdjson(res, { type: "segment_done", index });
    }
    writeNdjson(res, { type: "done" });
  } catch (error) {
    if (controller.signal.aborted) {
      writeNdjson(res, { type: "cancelled" });
    } else {
      writeNdjson(res, { type: "error", error: formatTranslationError(error, settings.translationModel || settings.chatModel || "model") });
    }
  } finally {
    activeRequests.delete(requestId);
    res.end();
  }
}

async function streamOneOpenAITranslation({ text, index, targetLanguage, settings, signal, res }) {
  if (!settings.baseUrl || !settings.translationModel) {
    throw new Error("openai-compatible translation needs baseUrl and translationModel.");
  }
  const response = await fetch(`${settings.baseUrl}${settings.chatCompletionsPath}`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...authHeaders(settings.apiKey)
    },
    body: JSON.stringify({
      model: settings.translationModel,
      stream: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Translate the user's text into ${targetLanguage}. Return only the translated text. Do not explain.`
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  });
  if (!response.ok || !response.body) {
    const error = await response.text().catch(() => "");
    throw new Error(error || `OpenAI-compatible request failed (${response.status})`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      const chunk = event.choices?.[0]?.delta?.content || "";
      if (chunk) writeNdjson(res, { type: "delta", index, text: chunk });
    }
  }
}

function cancelRequest(requestId) {
  if (typeof requestId !== "string" || !requestId) return false;
  const active = activeRequests.get(requestId);
  if (!active) return false;
  active.cancel();
  return true;
}

function terminateChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 600);
}

function commandExists(command) {
  if (!command) return false;
  if (fs.existsSync(command)) return true;
  const result = spawnSync("which", [command], { stdio: "ignore" });
  return result.status === 0;
}

function resolveCodexBin(settings) {
  if (settings.bin) return settings.bin;
  if (process.env.LOCAL_CLI_CODEX_BIN) return process.env.LOCAL_CLI_CODEX_BIN;
  if (commandExists("codex")) return "codex";
  if (fs.existsSync(MACOS_CODEX_BIN)) return MACOS_CODEX_BIN;
  return "codex";
}

function normalizeCodexSettings(settings) {
  return {
    bin: resolveCodexBin(settings),
    workDir: settings.workDir || DEFAULT_WORK_DIR,
    timeoutMs: Number(settings.timeoutMs || DEFAULT_TIMEOUT_MS),
    modelsCacheFile: settings.modelsCacheFile || DEFAULT_MODELS_CACHE_FILE
  };
}

function normalizeCursorSettings(settings) {
  return {
    bin: settings.bin || DEFAULT_CURSOR_BIN,
    baseUrl: normalizeBaseUrl(settings.baseUrl || ""),
    apiKey: settings.apiKey || "",
    workDir: settings.workDir || DEFAULT_WORK_DIR,
    timeoutMs: Number(settings.timeoutMs || DEFAULT_TIMEOUT_MS)
  };
}

function normalizeOllamaSettings(settings) {
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl || DEFAULT_OLLAMA_BASE_URL),
    apiKey: settings.apiKey || "",
    model: settings.model || DEFAULT_OLLAMA_MODEL,
    think: settings.think === true,
    stream: settings.stream !== false
  };
}

function normalizeOpenAISettings(settings) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl || "");
  return {
    baseUrl,
    apiKey: settings.apiKey || "",
    chatModel: settings.chatModel || "",
    translationModel: settings.translationModel || "",
    modelsPath: normalizeApiPath(settings.modelsPath || DEFAULT_OPENAI_MODELS_PATH),
    chatCompletionsPath: normalizeApiPath(settings.chatCompletionsPath || DEFAULT_OPENAI_CHAT_COMPLETIONS_PATH)
  };
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeApiPath(value) {
  const text = String(value || "").trim();
  if (!text) return DEFAULT_OPENAI_CHAT_COMPLETIONS_PATH;
  return text.startsWith("/") ? text : `/${text}`;
}

function authHeaders(apiKey) {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function buildPrompt(messages, systemPrompt) {
  const lines = [systemPrompt || "You are a concise, helpful browser sidebar assistant."];
  for (const message of messages) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    lines.push(`${role}: ${String(message.content || "").trim()}`);
  }
  lines.push("Assistant:");
  return `${lines.join("\n\n")}\n`;
}

function buildCursorPrompt(messages, systemPrompt) {
  const lines = [
    systemPrompt || "You are a concise, helpful browser sidebar assistant.",
    "This is a read-only browser sidebar chat.",
    "Do not edit files, do not run shell commands, and do not propose patches unless the user explicitly asks for code changes outside this sidebar flow."
  ];

  for (const message of messages) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    lines.push(`${role}: ${String(message.content || "").trim()}`);
  }
  lines.push("Assistant:");
  return `${lines.join("\n\n")}\n`;
}

function buildOpenAIMessages(messages, systemPrompt) {
  const items = [];
  if (systemPrompt) items.push({ role: "system", content: systemPrompt });
  for (const message of messages) {
    items.push({ role: message.role === "assistant" ? "assistant" : "user", content: String(message.content || "") });
  }
  return items;
}

function loadCodexModels(modelsCacheFile) {
  const fallback = [
    { slug: "gpt-5.4", displayName: "gpt-5.4", description: "Strong model for everyday coding." },
    { slug: "gpt-5.4-mini", displayName: "GPT-5.4-Mini", description: "Small, fast, and cost-efficient model for simpler tasks." }
  ];
  try {
    const parsed = JSON.parse(fs.readFileSync(modelsCacheFile, "utf8"));
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    const visible = models
      .filter((model) => model && model.visibility === "list" && model.slug)
      .map((model) => ({
        slug: model.slug,
        displayName: model.display_name || model.slug,
        description: model.description || ""
      }));
    return visible.length ? visible : fallback;
  } catch {
    return fallback;
  }
}

function cleanCodexOutput(text) {
  return String(text || "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/^WARNING:.*$/gm, "")
    .trim();
}

function cleanError(text) {
  return cleanCodexOutput(text).split("\n").slice(-8).join("\n").trim();
}

function stripThinkBlocks(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "");
}

function getCursorStatus(settings) {
  try {
    const result = spawnSync(settings.bin, ["status"], {
      cwd: settings.workDir,
      env: settings.apiKey
        ? { ...process.env, CURSOR_API_KEY: settings.apiKey }
        : { ...process.env },
      encoding: "utf8",
      timeout: 8000
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    if (result.status === 0) {
      return { ok: true, message: cleanError(output) || "Cursor CLI authenticated." };
    }
    if (/not authenticated|login/i.test(output)) {
      return { ok: false, message: "Cursor CLI installed, but not authenticated. Run cursor-agent login." };
    }
    return { ok: false, message: cleanError(output) || "Cursor CLI status check failed." };
  } catch (error) {
    return { ok: false, message: error.message || "Cursor CLI status check failed." };
  }
}

function formatTranslationError(error, model) {
  const message = error?.message || String(error);
  if (/cancelled|aborted|abort/i.test(message)) return "Translation cancelled.";
  if (/model.*not found|not found/i.test(message)) return `Model not pulled: ${model}`;
  if (/fetch failed|ECONNREFUSED|network/i.test(message)) return "Translation provider unavailable.";
  return message;
}
