import BUILD_CONFIG from "./generated-config.mjs";

const DEFAULTS = clone(BUILD_CONFIG.runtimeDefaults);

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.branding) {
    createContextMenus().catch(() => {});
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "ask-selection") {
    chrome.tabs.sendMessage(tab.id, {
      type: "SIDEBAR_PREFILL",
      text: info.selectionText || "",
      sendNow: false
    }).catch(() => {});
  }
  if (info.menuItemId === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, {
      type: "SIDEBAR_TRANSLATE",
      text: info.selectionText || ""
    }).catch(() => {});
  }
  if (info.menuItemId === "translate-page") {
    chrome.tabs.sendMessage(tab.id, { type: "SIDEBAR_TRANSLATE_PAGE" }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-sidebar" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "SIDEBAR_TOGGLE" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "BRIDGE_CHAT") {
    handleChat(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "BRIDGE_CANCEL") {
    handleCancel(message.requestId)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "BRIDGE_HEALTH") {
    handleHealth()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "BRIDGE_MODELS") {
    handleModels(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "BRIDGE_PROVIDER_HEALTH") {
    handleProviderHealth()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  if (message?.type === "BRIDGE_TRANSLATE_STREAM") {
    handleTranslateStream(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }
  return false;
});

async function createContextMenus() {
  const settings = await loadSettings();
  const sidebarTitle = settings.branding.sidebarTitle || BUILD_CONFIG.build.extensionName;
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "ask-selection",
    title: `Ask in ${sidebarTitle}`,
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate selection in Sidebar",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "translate-page",
    title: "Translate this page in Sidebar",
    contexts: ["page"]
  });
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return mergeDeep(clone(DEFAULTS), saved);
}

async function handleHealth() {
  const settings = await loadSettings();
  const response = await fetch(`${trimSlash(settings.bridge.url)}/health`, {
    method: "GET",
    headers: bridgeHeaders(settings)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Bridge health check failed (${response.status})`);
  }
  return { ok: true, data };
}

async function handleChat(message) {
  const settings = await loadSettings();
  const messages = Array.isArray(message.messages) ? message.messages : [];
  if (messages.length === 0) throw new Error("No messages to send.");

  const provider = message.provider || settings.chat.provider;
  const body = {
    requestId: message.requestId,
    provider,
    messages,
    model: message.model || settings.chat.model || undefined,
    reasoningEffort: message.reasoningEffort || settings.chat.reasoningEffort || undefined,
    systemPrompt: message.systemPrompt || settings.chat.systemPrompt || DEFAULTS.chat.systemPrompt,
    providerSettings: settings.providers
  };

  const response = await fetch(`${trimSlash(settings.bridge.url)}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bridgeHeaders(settings)
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Bridge request failed (${response.status})`);
  }
  return { ok: true, reply: data.reply || "" };
}

async function handleModels(message) {
  const settings = await loadSettings();
  const provider = message.provider || settings.chat.provider;
  const params = new URLSearchParams({ provider });
  const openai = settings.providers.openaiCompatible || {};
  const codex = settings.providers.codex || {};
  if (provider === "openai-compatible") {
    if (openai.baseUrl) params.set("baseUrl", openai.baseUrl);
    if (openai.apiKey) params.set("apiKey", openai.apiKey);
    if (openai.modelsPath) params.set("modelsPath", openai.modelsPath);
  }
  if (provider === "codex-cli") {
    if (codex.modelsCacheFile) params.set("modelsCacheFile", codex.modelsCacheFile);
  }

  const response = await fetch(`${trimSlash(settings.bridge.url)}/providers/models?${params.toString()}`, {
    method: "GET",
    headers: bridgeHeaders(settings)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Bridge models failed (${response.status})`);
  }
  return { ok: true, models: data.models || [] };
}

async function handleCancel(requestId) {
  const settings = await loadSettings();
  const response = await fetch(`${trimSlash(settings.bridge.url)}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bridgeHeaders(settings)
    },
    body: JSON.stringify({ requestId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Bridge cancel failed (${response.status})`);
  }
  return { ok: true, cancelled: Boolean(data.cancelled) };
}

async function handleProviderHealth() {
  const settings = await loadSettings();
  const params = new URLSearchParams({
    chatProvider: settings.chat.provider,
    translationProvider: settings.translation.provider
  });
  const codex = settings.providers.codex || {};
  const cursor = settings.providers.cursor || {};
  const ollama = settings.providers.ollama || {};
  const openai = settings.providers.openaiCompatible || {};

  setParams(params, {
    codexBin: codex.bin,
    codexWorkDir: codex.workDir,
    codexModelsCacheFile: codex.modelsCacheFile,
    cursorBin: cursor.bin,
    cursorBaseUrl: cursor.baseUrl,
    cursorApiKey: cursor.apiKey,
    ollamaBaseUrl: ollama.baseUrl,
    ollamaModel: ollama.model,
    openaiBaseUrl: openai.baseUrl,
    openaiApiKey: openai.apiKey,
    openaiModelsPath: openai.modelsPath
  });

  const response = await fetch(`${trimSlash(settings.bridge.url)}/providers/health?${params.toString()}`, {
    method: "GET",
    headers: bridgeHeaders(settings)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Provider health failed (${response.status})`);
  }
  return { ok: true, data };
}

async function handleTranslateStream(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) throw new Error("No tab available for translation stream.");

  const settings = await loadSettings();
  const response = await fetch(`${trimSlash(settings.bridge.url)}/translate/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...bridgeHeaders(settings)
    },
    body: JSON.stringify({
      requestId: message.requestId,
      provider: message.provider || settings.translation.provider,
      texts: message.texts || [],
      targetLanguage: message.targetLanguage || settings.translation.targetLanguage || "简体中文",
      mode: message.mode || "selection",
      providerSettings: settings.providers,
      translationOptions: settings.translation
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Translation stream failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error("Translation stream returned no body.");
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
      forwardTranslateEvent(tabId, message.requestId, line);
    }
  }
  if (buffer.trim()) {
    forwardTranslateEvent(tabId, message.requestId, buffer);
  }
  return { ok: true };
}

function forwardTranslateEvent(tabId, requestId, line) {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    event = { type: "error", error: "Invalid translation stream event." };
  }
  chrome.tabs.sendMessage(tabId, {
    type: "TRANSLATE_STREAM_EVENT",
    requestId,
    event
  }).catch(() => {});
}

function bridgeHeaders(settings) {
  return settings.bridge.token ? { "x-bridge-token": settings.bridge.token } : {};
}

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function setParams(params, values) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(target, source) {
  if (!source || typeof source !== "object") return target;
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
