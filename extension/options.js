const CONFIG = globalThis.LOCAL_CLI_EXTENSION_CONFIG;
const DEFAULTS = clone(CONFIG.runtimeDefaults);

const fields = {
  sidebarTitle: document.querySelector("#sidebarTitle"),
  bubbleIcon: document.querySelector("#bubbleIcon"),
  welcomeMessage: document.querySelector("#welcomeMessage"),
  bridgeLabel: document.querySelector("#bridgeLabel"),
  bridgeUrl: document.querySelector("#bridgeUrl"),
  bridgeToken: document.querySelector("#bridgeToken"),
  chatProvider: document.querySelector("#chatProvider"),
  chatModel: document.querySelector("#chatModel"),
  reasoningEffort: document.querySelector("#reasoningEffort"),
  rememberHistory: document.querySelector("#rememberHistory"),
  systemPrompt: document.querySelector("#systemPrompt"),
  translationProvider: document.querySelector("#translationProvider"),
  targetLanguage: document.querySelector("#targetLanguage"),
  visibleSegmentLimit: document.querySelector("#visibleSegmentLimit"),
  batchSize: document.querySelector("#batchSize"),
  codexBin: document.querySelector("#codexBin"),
  codexWorkDir: document.querySelector("#codexWorkDir"),
  codexTimeoutMs: document.querySelector("#codexTimeoutMs"),
  codexModelsCacheFile: document.querySelector("#codexModelsCacheFile"),
  cursorBin: document.querySelector("#cursorBin"),
  cursorBaseUrl: document.querySelector("#cursorBaseUrl"),
  cursorApiKey: document.querySelector("#cursorApiKey"),
  ollamaBaseUrl: document.querySelector("#ollamaBaseUrl"),
  ollamaModel: document.querySelector("#ollamaModel"),
  ollamaApiKey: document.querySelector("#ollamaApiKey"),
  ollamaThink: document.querySelector("#ollamaThink"),
  ollamaStream: document.querySelector("#ollamaStream"),
  openaiBaseUrl: document.querySelector("#openaiBaseUrl"),
  openaiApiKey: document.querySelector("#openaiApiKey"),
  openaiChatModel: document.querySelector("#openaiChatModel"),
  openaiTranslationModel: document.querySelector("#openaiTranslationModel"),
  openaiModelsPath: document.querySelector("#openaiModelsPath"),
  openaiChatCompletionsPath: document.querySelector("#openaiChatCompletionsPath")
};

const groups = Array.from(document.querySelectorAll(".provider-group"));
const statusEl = document.querySelector("#status");
document.querySelector("#optionsTitle").textContent = CONFIG.build.optionsTitle;

document.querySelector("#save").addEventListener("click", save);
document.querySelector("#test").addEventListener("click", testBridge);
fields.chatProvider.addEventListener("change", syncVisibility);
fields.translationProvider.addEventListener("change", syncVisibility);

load();

async function load() {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const settings = mergeDeep(clone(DEFAULTS), saved);
  applySettings(settings);
  syncVisibility();
}

function applySettings(settings) {
  fields.sidebarTitle.value = settings.branding.sidebarTitle || "";
  fields.bubbleIcon.value = settings.branding.bubbleIcon || "";
  fields.welcomeMessage.value = settings.branding.welcomeMessage || "";
  fields.bridgeLabel.value = settings.branding.bridgeLabel || "";
  fields.bridgeUrl.value = settings.bridge.url || "";
  fields.bridgeToken.value = settings.bridge.token || "";
  fields.chatProvider.value = settings.chat.provider || "codex-cli";
  fields.chatModel.value = settings.chat.model || "";
  fields.reasoningEffort.value = settings.chat.reasoningEffort || "";
  fields.rememberHistory.checked = Boolean(settings.chat.rememberHistory);
  fields.systemPrompt.value = settings.chat.systemPrompt || "";
  fields.translationProvider.value = settings.translation.provider || "ollama";
  fields.targetLanguage.value = settings.translation.targetLanguage || "";
  fields.visibleSegmentLimit.value = settings.translation.visibleSegmentLimit || 8;
  fields.batchSize.value = settings.translation.batchSize || 4;
  fields.codexBin.value = settings.providers.codex.bin || "";
  fields.codexWorkDir.value = settings.providers.codex.workDir || "";
  fields.codexTimeoutMs.value = settings.providers.codex.timeoutMs || 180000;
  fields.codexModelsCacheFile.value = settings.providers.codex.modelsCacheFile || "";
  fields.cursorBin.value = settings.providers.cursor.bin || "";
  fields.cursorBaseUrl.value = settings.providers.cursor.baseUrl || "";
  fields.cursorApiKey.value = settings.providers.cursor.apiKey || "";
  fields.ollamaBaseUrl.value = settings.providers.ollama.baseUrl || "";
  fields.ollamaModel.value = settings.providers.ollama.model || "";
  fields.ollamaApiKey.value = settings.providers.ollama.apiKey || "";
  fields.ollamaThink.checked = settings.providers.ollama.think !== false;
  fields.ollamaStream.checked = settings.providers.ollama.stream !== false;
  fields.openaiBaseUrl.value = settings.providers.openaiCompatible.baseUrl || "";
  fields.openaiApiKey.value = settings.providers.openaiCompatible.apiKey || "";
  fields.openaiChatModel.value = settings.providers.openaiCompatible.chatModel || "";
  fields.openaiTranslationModel.value = settings.providers.openaiCompatible.translationModel || "";
  fields.openaiModelsPath.value = settings.providers.openaiCompatible.modelsPath || "";
  fields.openaiChatCompletionsPath.value = settings.providers.openaiCompatible.chatCompletionsPath || "";
}

async function save() {
  const settings = currentSettings();
  await chrome.storage.local.set(settings);
  setStatus("Saved.");
}

async function testBridge() {
  await save();
  setStatus("Testing...");
  try {
    const [health, providers] = await Promise.all([
      chrome.runtime.sendMessage({ type: "BRIDGE_HEALTH" }),
      chrome.runtime.sendMessage({ type: "BRIDGE_PROVIDER_HEALTH" })
    ]);
    if (!health?.ok) throw new Error(health?.error || "Bridge did not respond.");
    if (!providers?.ok) throw new Error(providers?.error || "Provider health failed.");
    const chat = providers.data?.chat?.message || "chat unknown";
    const translation = providers.data?.translation?.message || "translation unknown";
    setStatus(`Bridge is healthy. ${chat}. ${translation}.`);
  } catch (error) {
    setStatus(error.message || String(error));
  }
}

function syncVisibility() {
  const chatProvider = fields.chatProvider.value;
  const translationProvider = fields.translationProvider.value;
  for (const group of groups) {
    const chatMatch = !group.dataset.chatProvider || group.dataset.chatProvider === chatProvider;
    const translationMatch = !group.dataset.translationProvider || group.dataset.translationProvider === translationProvider;
    group.hidden = !(chatMatch || translationMatch);
  }
}

function currentSettings() {
  const next = clone(DEFAULTS);
  next.branding.sidebarTitle = fields.sidebarTitle.value.trim();
  next.branding.bubbleIcon = fields.bubbleIcon.value.trim();
  next.branding.welcomeMessage = fields.welcomeMessage.value.trim();
  next.branding.bridgeLabel = fields.bridgeLabel.value.trim();
  next.bridge.url = fields.bridgeUrl.value.trim();
  next.bridge.token = fields.bridgeToken.value.trim();
  next.chat.provider = fields.chatProvider.value;
  next.chat.model = fields.chatModel.value.trim();
  next.chat.reasoningEffort = fields.reasoningEffort.value.trim();
  next.chat.rememberHistory = fields.rememberHistory.checked;
  next.chat.systemPrompt = fields.systemPrompt.value.trim();
  next.translation.provider = fields.translationProvider.value;
  next.translation.targetLanguage = fields.targetLanguage.value.trim();
  next.translation.visibleSegmentLimit = Number(fields.visibleSegmentLimit.value) || DEFAULTS.translation.visibleSegmentLimit;
  next.translation.batchSize = Number(fields.batchSize.value) || DEFAULTS.translation.batchSize;
  next.providers.codex.bin = fields.codexBin.value.trim();
  next.providers.codex.workDir = fields.codexWorkDir.value.trim();
  next.providers.codex.timeoutMs = Number(fields.codexTimeoutMs.value) || DEFAULTS.providers.codex.timeoutMs;
  next.providers.codex.modelsCacheFile = fields.codexModelsCacheFile.value.trim();
  next.providers.cursor.bin = fields.cursorBin.value.trim();
  next.providers.cursor.baseUrl = fields.cursorBaseUrl.value.trim();
  next.providers.cursor.apiKey = fields.cursorApiKey.value.trim();
  next.providers.ollama.baseUrl = fields.ollamaBaseUrl.value.trim();
  next.providers.ollama.model = fields.ollamaModel.value.trim();
  next.providers.ollama.apiKey = fields.ollamaApiKey.value.trim();
  next.providers.ollama.think = fields.ollamaThink.checked;
  next.providers.ollama.stream = fields.ollamaStream.checked;
  next.providers.openaiCompatible.baseUrl = fields.openaiBaseUrl.value.trim();
  next.providers.openaiCompatible.apiKey = fields.openaiApiKey.value.trim();
  next.providers.openaiCompatible.chatModel = fields.openaiChatModel.value.trim();
  next.providers.openaiCompatible.translationModel = fields.openaiTranslationModel.value.trim();
  next.providers.openaiCompatible.modelsPath = fields.openaiModelsPath.value.trim() || DEFAULTS.providers.openaiCompatible.modelsPath;
  next.providers.openaiCompatible.chatCompletionsPath = fields.openaiChatCompletionsPath.value.trim() || DEFAULTS.providers.openaiCompatible.chatCompletionsPath;
  return next;
}

function setStatus(text) {
  statusEl.textContent = text;
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
