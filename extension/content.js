(function bootSidebar() {
  if (window.__localCliExtensionMounted) return;
  window.__localCliExtensionMounted = true;

  const CONFIG = globalThis.LOCAL_CLI_EXTENSION_CONFIG || {
    build: { extensionName: "Local CLI Extension" },
    runtimeDefaults: {
      branding: { sidebarTitle: "Local CLI Extension", bubbleIcon: "✨", welcomeMessage: "", bridgeLabel: "local bridge" },
      chat: { provider: "codex-cli", model: "", systemPrompt: "", reasoningEffort: "", rememberHistory: true },
      translation: { provider: "ollama", targetLanguage: "简体中文", visibleSegmentLimit: 8, batchSize: 4 },
      providers: { ollama: { model: "qwen3.5:4b" }, openaiCompatible: {} },
      ui: { panelMinWidth: 300, panelMinHeight: 330 }
    }
  };
  const DEFAULTS = clone(CONFIG.runtimeDefaults);
  let runtimeSettings = clone(DEFAULTS);

  const host = document.createElement("div");
  host.id = "local-cli-extension-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        top: 16vh;
        right: 14px;
        z-index: 2147483647;
        width: 46px;
        height: 46px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #202124;
        user-select: none;
      }
      .bubble {
        position: absolute;
        inset: 0;
        width: 46px;
        height: 46px;
        border: 1px solid rgba(220, 220, 216, 0.88);
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(248, 248, 246, 0.76);
        box-shadow: 0 12px 34px rgba(30, 31, 30, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(22px) saturate(1.25);
        -webkit-backdrop-filter: blur(22px) saturate(1.25);
        color: #2f3130;
        cursor: grab;
        transition: transform 150ms ease, background 150ms ease, box-shadow 150ms ease;
      }
      .bubble:hover, .wrap.open .bubble, .wrap.pinned .bubble {
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 16px 42px rgba(30, 31, 30, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.95);
        transform: scale(1.03);
      }
      .bubble.dragging {
        cursor: grabbing;
        transform: scale(0.98);
      }
      .bubble-mark {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, #fefefe, #e9e9e5);
        border: 1px solid rgba(210, 210, 205, 0.84);
        color: #2f3130;
        font-size: 13px;
        font-weight: 800;
        line-height: 1;
      }
      .panel {
        position: absolute;
        top: 0;
        right: 56px;
        width: clamp(300px, 28vw, 360px);
        height: clamp(330px, 56vh, 500px);
        min-width: 300px;
        min-height: 330px;
        opacity: 0;
        pointer-events: none;
        transform: translateX(12px) scale(0.985);
        transform-origin: top right;
        transition: opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;
        background: rgba(247, 247, 244, 0.78);
        border: 1px solid rgba(232, 232, 226, 0.9);
        border-radius: 14px;
        box-shadow: 0 22px 60px rgba(24, 25, 24, 0.2);
        backdrop-filter: blur(24px) saturate(1.28);
        -webkit-backdrop-filter: blur(24px) saturate(1.28);
        display: grid;
        grid-template-rows: auto 1fr auto;
        overflow: hidden;
      }
      .wrap.align-right .panel {
        left: 56px;
        right: auto;
        transform-origin: top left;
      }
      .wrap:hover .panel, .wrap.open .panel, .wrap.pinned .panel {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(0) scale(1);
      }
      button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }
      .head {
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 0 11px;
        border-bottom: 1px solid rgba(225, 225, 220, 0.78);
        background: rgba(250, 250, 248, 0.54);
      }
      .title {
        font-size: 14px;
        line-height: 1.2;
        font-weight: 750;
      }
      .sub {
        font-size: 11px;
        line-height: 1.2;
        color: #777976;
      }
      .model-select {
        max-width: 144px;
        height: 28px;
        border: 1px solid rgba(216, 216, 211, 0.9);
        border-radius: 8px;
        padding: 0 8px;
        background: rgba(255, 255, 255, 0.68);
        color: #373936;
        font: inherit;
        font-size: 12px;
        outline: none;
      }
      .head-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .small {
        width: 30px;
        height: 30px;
        border-radius: 7px;
        color: #4f5250;
        background: transparent;
      }
      .small:hover { background: rgba(255, 255, 255, 0.72); }
      .messages {
        min-height: 0;
        overflow: auto;
        padding: 12px 11px;
        display: flex;
        flex-direction: column;
        gap: 9px;
        background: rgba(250, 250, 248, 0.48);
        user-select: text;
      }
      .msg {
        max-width: 92%;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.42;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .user {
        align-self: flex-end;
        background: #2f3130;
        color: #fafaf8;
      }
      .assistant {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid rgba(226, 226, 221, 0.9);
        color: #202124;
      }
      .status {
        font-size: 12px;
        color: #777976;
        padding: 0 11px 7px;
        min-height: 18px;
        background: rgba(250, 250, 248, 0.54);
      }
      .compose {
        display: grid;
        grid-template-columns: 1fr 36px;
        gap: 7px;
        padding: 9px 11px 11px;
        border-top: 1px solid rgba(225, 225, 220, 0.78);
        background: rgba(250, 250, 248, 0.54);
      }
      textarea {
        resize: none;
        height: 50px;
        max-height: 96px;
        border: 1px solid rgba(216, 216, 211, 0.94);
        border-radius: 10px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.74);
        color: #202124;
        font: inherit;
        font-size: 13px;
        line-height: 1.35;
        outline: none;
      }
      textarea:focus { border-color: #b8bab6; box-shadow: 0 0 0 3px rgba(50, 51, 49, 0.08); }
      .send {
        width: 36px;
        height: 36px;
        align-self: end;
        border-radius: 10px;
        background: #2f3130;
        color: #fafaf8;
        font-weight: 800;
      }
      .send.stop {
        background: #f2f2ef;
        border: 1px solid rgba(185, 185, 180, 0.9);
        color: #303230;
      }
      .send:disabled { cursor: default; opacity: 0.55; }
      @media (max-width: 520px) {
        .wrap { top: 10vh; right: 8px; }
        .panel {
          right: 52px;
          width: min(330px, calc(100vw - 70px));
          height: clamp(320px, 66vh, 480px);
        }
      }
    </style>
    <div class="wrap">
      <button class="bubble" title="${escapeHtml(DEFAULTS.branding.sidebarTitle)}" type="button">
        <span class="bubble-mark">${escapeHtml(DEFAULTS.branding.bubbleIcon)}</span>
      </button>
      <section class="panel" aria-label="${escapeHtml(DEFAULTS.branding.sidebarTitle)}">
        <header class="head">
          <div>
            <div class="title">${escapeHtml(DEFAULTS.branding.sidebarTitle)}</div>
            <div class="sub">${escapeHtml(DEFAULTS.branding.bridgeLabel)}</div>
          </div>
          <div class="head-actions">
            <select class="model-select" title="Model"></select>
            <button class="small pin" title="Pin sidebar">⌖</button>
            <button class="small clear" title="Clear conversation">⌫</button>
          </div>
        </header>
        <div class="messages"></div>
        <div>
          <div class="status"></div>
          <form class="compose">
            <textarea placeholder="Ask anything"></textarea>
            <button class="send" title="Send" type="submit">↵</button>
          </form>
        </div>
      </section>
    </div>
  `;

  const TRANSLATION_ATTR = "data-local-cli-translation";
  const CANCELLED = Symbol("cancelled");
  const BLOCK_SELECTOR = [
    "article p", "main p", "section p", "div p", "li", "blockquote",
    "article h1", "article h2", "article h3", "main h1", "main h2", "main h3"
  ].join(",");
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "code", "pre", "textarea", "input", "button",
    "select", "option", "svg", "canvas", "nav", "header", "footer", "aside",
    "[contenteditable='true']", `[${TRANSLATION_ATTR}]`, "#local-cli-extension-host"
  ].join(",");

  const wrap = root.querySelector(".wrap");
  const bubble = root.querySelector(".bubble");
  const bubbleMark = root.querySelector(".bubble-mark");
  const panel = root.querySelector(".panel");
  const titleEl = root.querySelector(".title");
  const subEl = root.querySelector(".sub");
  const messagesEl = root.querySelector(".messages");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const send = root.querySelector(".send");
  const status = root.querySelector(".status");
  const modelSelect = root.querySelector(".model-select");
  const pin = root.querySelector(".pin");
  const clear = root.querySelector(".clear");

  const messages = [];
  let busy = false;
  let stopping = false;
  let drag = null;
  let isComposing = false;
  let activeRequestId = null;
  let currentModel = "";
  let pageTranslationActive = false;
  let pageTranslationSeen = new WeakSet();
  let pageTranslationTimer = null;
  let activeTranslationStream = null;

  init().catch((error) => {
    appendMessage("assistant", error.message || String(error));
  });

  async function init() {
    runtimeSettings = await loadSettings();
    applyRuntimeSettings(runtimeSettings);
    await loadModelSelection();
    ensureWelcomeMessage();
  }

  modelSelect.addEventListener("change", async () => {
    currentModel = modelSelect.value;
    const settings = await loadSettings();
    settings.chat.model = currentModel;
    await chrome.storage.local.set({ chat: settings.chat });
  });

  bubble.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = wrap.getBoundingClientRect();
    drag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    bubble.classList.add("dragging");
    bubble.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  bubble.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const movedEnough = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3;
    drag.moved = drag.moved || movedEnough;
    const maxLeft = window.innerWidth - 46;
    const maxTop = window.innerHeight - 46;
    const nextLeft = clamp(event.clientX - drag.offsetX, 0, Math.max(0, maxLeft));
    const nextTop = clamp(event.clientY - drag.offsetY, 0, Math.max(0, maxTop));
    wrap.style.left = `${nextLeft}px`;
    wrap.style.top = `${nextTop}px`;
    wrap.style.right = "auto";
    wrap.style.bottom = "auto";
  });

  bubble.addEventListener("pointerup", (event) => {
    if (!drag) return;
    bubble.releasePointerCapture(event.pointerId);
    const didMove = drag.moved;
    drag = null;
    bubble.classList.remove("dragging");
    updatePanelSide();
    if (!didMove) toggleOpen();
  });

  window.addEventListener("resize", () => {
    keepBubbleInViewport();
    updatePanelSide();
  });

  pin.addEventListener("click", () => {
    const willPin = !wrap.classList.contains("pinned");
    wrap.classList.toggle("pinned", willPin);
    wrap.classList.toggle("open", willPin);
    pin.textContent = willPin ? "✓" : "⌖";
    updatePanelSide();
    if (willPin) input.focus();
  });

  clear.addEventListener("click", () => {
    messages.splice(0, messages.length);
    messagesEl.replaceChildren();
    ensureWelcomeMessage();
    setStatus("");
  });

  input.addEventListener("compositionstart", () => { isComposing = true; });
  input.addEventListener("compositionend", () => { isComposing = false; });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) {
      await stopActiveRequest();
      return;
    }
    await sendPrompt(input.value);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TRANSLATE_STREAM_EVENT") handleTranslateStreamEvent(message);
    if (message?.type === "SIDEBAR_TOGGLE") toggleOpen();
    if (message?.type === "SIDEBAR_PREFILL") {
      openPanel();
      input.value = message.text || "";
      input.focus();
    }
    if (message?.type === "SIDEBAR_TRANSLATE") {
      const text = String(message.text || "").trim();
      if (text) {
        openPanel();
        translateSelection(text);
      }
    }
    if (message?.type === "SIDEBAR_TRANSLATE_PAGE") {
      openPanel();
      startPageTranslation();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (!["branding", "chat", "translation", "providers", "ui"].some((key) => changes[key])) return;
    runtimeSettings = await loadSettings();
    applyRuntimeSettings(runtimeSettings);
    await loadModelSelection();
  });

  async function sendPrompt(text, options = {}) {
    const prompt = String(text || "").trim();
    if (!prompt || busy) return null;

    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    busy = true;
    stopping = false;
    send.disabled = true;
    setSendMode("stop");
    input.value = "";
    openPanel();

    const shouldRemember = options.ephemeral ? false : runtimeSettings.chat.rememberHistory !== false;
    const baseMessages = shouldRemember ? messages.slice(-11) : [];
    const requestMessages = baseMessages.concat({ role: "user", content: prompt });

    if (!options.silentUser) appendMessage("user", options.userLabel || prompt);
    setStatus(options.status || `Thinking (${runtimeSettings.chat.provider})...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BRIDGE_CHAT",
        requestId,
        provider: options.provider || runtimeSettings.chat.provider,
        model: options.model || currentModel || runtimeSettings.chat.model || undefined,
        reasoningEffort: options.reasoningEffort || runtimeSettings.chat.reasoningEffort || undefined,
        systemPrompt: options.systemPrompt || runtimeSettings.chat.systemPrompt || undefined,
        messages: requestMessages
      });
      if (!response?.ok) throw new Error(response?.error || "No response from bridge.");
      const reply = response.reply || "";
      if (!options.silentAssistant) appendMessage("assistant", reply);
      if (shouldRemember) {
        messages.push({ role: "user", content: prompt });
        messages.push({ role: "assistant", content: reply });
      }
      setStatus("");
      return reply;
    } catch (error) {
      const textError = error.message || String(error);
      if (isCancelError(textError)) {
        appendMessage("assistant", "已停止。");
        setStatus("");
        return CANCELLED;
      }
      appendMessage("assistant", `Bridge error: ${textError}`);
      setStatus("Check bridge settings or start the local bridge.");
      return null;
    } finally {
      if (activeRequestId === requestId) activeRequestId = null;
      busy = false;
      stopping = false;
      send.disabled = false;
      setSendMode("send");
      input.focus();
    }
  }

  async function stopActiveRequest() {
    if (!activeRequestId || stopping) return;
    stopping = true;
    send.disabled = true;
    setStatus("Stopping...");
    try {
      await chrome.runtime.sendMessage({ type: "BRIDGE_CANCEL", requestId: activeRequestId });
      pageTranslationActive = false;
    } catch (error) {
      setStatus(error.message || String(error));
    } finally {
      setTimeout(() => {
        if (busy) send.disabled = false;
      }, 400);
    }
  }

  async function translateSelection(text) {
    appendMessage("user", `Translate selection (${text.length} chars)`);
    const reply = appendMessage("assistant", "");
    const result = await streamTranslate({
      texts: [text],
      mode: "selection",
      statusText: `Translating (${runtimeSettings.translation.provider})...`,
      onDelta(index, delta) {
        reply.textContent += delta;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
    if (result === CANCELLED && !reply.textContent) reply.textContent = "已停止。";
  }

  async function streamTranslate({ texts, mode, statusText, onDelta, onSegmentDone }) {
    if (busy) return null;

    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    busy = true;
    stopping = false;
    send.disabled = true;
    setSendMode("stop");
    setStatus(statusText || `Translating (${runtimeSettings.translation.provider})...`);

    let outcome = null;
    activeTranslationStream = {
      requestId,
      onDelta,
      onSegmentDone,
      onDone() { outcome = "done"; },
      onCancelled() { outcome = CANCELLED; },
      onError(error) {
        outcome = "error";
        appendMessage("assistant", error);
        setStatus("Translation failed.");
      }
    };

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BRIDGE_TRANSLATE_STREAM",
        requestId,
        provider: runtimeSettings.translation.provider,
        texts,
        mode,
        targetLanguage: runtimeSettings.translation.targetLanguage
      });
      if (!response?.ok) throw new Error(response?.error || "Translation stream failed.");
      if (outcome === CANCELLED) return CANCELLED;
      if (outcome === "error") return null;
      setStatus("");
      return outcome || "done";
    } catch (error) {
      const textError = error.message || String(error);
      if (isCancelError(textError)) {
        appendMessage("assistant", "已停止。");
        setStatus("");
        return CANCELLED;
      }
      appendMessage("assistant", textError);
      setStatus("Translation failed.");
      return null;
    } finally {
      if (activeRequestId === requestId) activeRequestId = null;
      if (activeTranslationStream?.requestId === requestId) activeTranslationStream = null;
      busy = false;
      stopping = false;
      send.disabled = false;
      setSendMode("send");
      input.focus();
    }
  }

  function handleTranslateStreamEvent(message) {
    const stream = activeTranslationStream;
    if (!stream || stream.requestId !== message.requestId) return;
    const event = message.event || {};
    if (event.type === "delta") stream.onDelta?.(event.index || 0, event.text || "");
    if (event.type === "segment_done") stream.onSegmentDone?.(event.index || 0);
    if (event.type === "cancelled") {
      stream.onCancelled?.();
      setStatus("");
    }
    if (event.type === "done") stream.onDone?.();
    if (event.type === "error") stream.onError?.(event.error || "Translation failed.");
  }

  async function loadModelSelection() {
    currentModel = runtimeSettings.chat.model || "";
    modelSelect.replaceChildren(new Option("Default", ""));
    try {
      const response = await chrome.runtime.sendMessage({ type: "BRIDGE_MODELS", provider: runtimeSettings.chat.provider });
      const models = response?.ok && Array.isArray(response.models) ? response.models : [];
      for (const model of models) {
        modelSelect.appendChild(new Option(model.displayName || model.slug, model.slug));
      }
    } catch {
      if (runtimeSettings.chat.provider === "codex-cli") {
        modelSelect.appendChild(new Option("gpt-5.4", "gpt-5.4"));
        modelSelect.appendChild(new Option("GPT-5.4-Mini", "gpt-5.4-mini"));
      }
    }
    modelSelect.value = Array.from(modelSelect.options).some((option) => option.value === currentModel) ? currentModel : "";
    modelSelect.disabled = false;
  }

  function startPageTranslation() {
    if (busy) return;
    pageTranslationActive = true;
    pageTranslationSeen = new WeakSet();
    cleanupPageTranslations();
    appendMessage("user", "Translate visible page paragraphs");
    translateVisiblePage();
  }

  window.addEventListener("scroll", () => {
    if (!pageTranslationActive) return;
    clearTimeout(pageTranslationTimer);
    pageTranslationTimer = setTimeout(() => {
      translateVisiblePage();
    }, 650);
  }, { passive: true });

  async function translateVisiblePage() {
    if (busy || !pageTranslationActive) return;
    const limit = Number(runtimeSettings.translation.visibleSegmentLimit) || DEFAULTS.translation.visibleSegmentLimit;
    const batchSize = Number(runtimeSettings.translation.batchSize) || DEFAULTS.translation.batchSize;
    const segments = collectTranslatableSegments({ visibleOnly: true, limit });
    if (segments.length === 0) {
      setStatus("Page translation on.");
      return;
    }

    setStatus(`Translating ${segments.length} visible paragraphs...`);
    const translated = [];
    try {
      for (let index = 0; index < segments.length; index += batchSize) {
        const batch = segments.slice(index, index + batchSize);
        const nodes = batch.map((item) => insertTranslation(item.element, ""));
        const result = await streamTranslate({
          texts: batch.map((item) => item.text),
          mode: "page",
          statusText: `Translating ${Math.min(index + 1, segments.length)}/${segments.length} paragraphs...`,
          onDelta(segmentIndex, delta) {
            const node = nodes[segmentIndex];
            if (node) node.textContent += delta;
          },
          onSegmentDone(segmentIndex) {
            if (nodes[segmentIndex]) translated.push(nodes[segmentIndex].textContent);
          }
        });
        if (result === CANCELLED) {
          pageTranslationActive = false;
          setStatus("");
          return;
        }
        if (!result) throw new Error("Bridge returned no translation.");
      }
      setStatus(`Translated ${translated.length} visible paragraphs.`);
    } catch (error) {
      appendMessage("assistant", `Page translation failed: ${error.message || String(error)}`);
      setStatus("Page translation failed.");
    }
  }

  function collectTranslatableSegments(options = {}) {
    const seen = new Set();
    const segments = [];
    const nodes = Array.from(document.querySelectorAll(BLOCK_SELECTOR));
    for (const element of nodes) {
      if (options.limit && segments.length >= options.limit) break;
      if (!(element instanceof HTMLElement)) continue;
      if (seen.has(element)) continue;
      if (pageTranslationSeen.has(element)) continue;
      if (shouldSkipElement(element)) continue;
      if (!isVisible(element)) continue;
      if (options.visibleOnly && !isInViewport(element)) continue;
      const text = normalizeText(element.innerText || element.textContent || "");
      if (!isUsefulText(text)) continue;
      seen.add(element);
      pageTranslationSeen.add(element);
      segments.push({ element, text });
    }
    return segments;
  }

  function shouldSkipElement(element) {
    if (element.closest(SKIP_SELECTOR)) return true;
    if (element.children.length > 8 && !["P", "LI", "BLOCKQUOTE"].includes(element.tagName)) return true;
    return false;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 24 && rect.height > 8 && style.visibility !== "hidden" && style.display !== "none";
  }

  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function isUsefulText(text) {
    if (text.length < 24 || text.length > 1800) return false;
    if (!/[A-Za-z\u3040-\u30ff\uac00-\ud7af]/.test(text)) return false;
    return true;
  }

  function insertTranslation(element, text) {
    const translation = document.createElement("div");
    translation.setAttribute(TRANSLATION_ATTR, "true");
    translation.textContent = text;
    translation.style.cssText = [
      "margin: 0.45em 0 0.85em", "padding: 0.7em 0.85em", "border: 1px solid rgba(210, 210, 205, 0.86)",
      "border-radius: 8px", "background: rgba(248, 248, 246, 0.82)", "box-shadow: 0 8px 24px rgba(28, 29, 28, 0.08)",
      "color: #343635", "font-size: 0.95em", "line-height: 1.58", "white-space: pre-wrap"
    ].join(";");
    element.insertAdjacentElement("afterend", translation);
    return translation;
  }

  function cleanupPageTranslations() {
    document.querySelectorAll(`[${TRANSLATION_ATTR}]`).forEach((node) => node.remove());
  }

  function appendMessage(role, text) {
    const item = document.createElement("div");
    item.className = `msg ${role}`;
    item.textContent = text;
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  function ensureWelcomeMessage() {
    if (messagesEl.childElementCount === 0 && runtimeSettings.branding.welcomeMessage) {
      appendMessage("assistant", runtimeSettings.branding.welcomeMessage);
    }
  }

  function applyRuntimeSettings(settings) {
    runtimeSettings = mergeDeep(clone(DEFAULTS), settings || {});
    titleEl.textContent = runtimeSettings.branding.sidebarTitle;
    subEl.textContent = runtimeSettings.branding.bridgeLabel || `${runtimeSettings.chat.provider} via bridge`;
    bubble.title = runtimeSettings.branding.sidebarTitle;
    panel.setAttribute("aria-label", runtimeSettings.branding.sidebarTitle);
    bubbleMark.textContent = runtimeSettings.branding.bubbleIcon || DEFAULTS.branding.bubbleIcon;
    input.placeholder = `Ask with ${runtimeSettings.chat.provider}`;
  }

  async function loadSettings() {
    const saved = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return mergeDeep(clone(DEFAULTS), saved);
  }

  function openPanel() {
    wrap.classList.add("open");
    updatePanelSide();
  }

  function toggleOpen() {
    wrap.classList.toggle("open");
    if (wrap.classList.contains("open")) {
      updatePanelSide();
      input.focus();
    }
  }

  function keepBubbleInViewport() {
    const rect = wrap.getBoundingClientRect();
    const nextLeft = clamp(rect.left, 0, Math.max(0, window.innerWidth - 46));
    const nextTop = clamp(rect.top, 0, Math.max(0, window.innerHeight - 46));
    wrap.style.left = `${nextLeft}px`;
    wrap.style.top = `${nextTop}px`;
    wrap.style.right = "auto";
    wrap.style.bottom = "auto";
    updatePanelSide();
  }

  function updatePanelSide() {
    const rect = wrap.getBoundingClientRect();
    const panelWidth = Math.min(Math.max(window.innerWidth * 0.28, 300), 360);
    wrap.classList.toggle("align-right", rect.left < panelWidth + 16);
  }

  function setStatus(text) {
    status.textContent = text;
  }

  function setSendMode(mode) {
    if (mode === "stop") {
      send.classList.add("stop");
      send.textContent = "■";
      send.title = "Stop";
      send.disabled = false;
      return;
    }
    send.classList.remove("stop");
    send.textContent = "↵";
    send.title = "Send";
  }

  function isCancelError(text) {
    return /cancelled|canceled/i.test(text);
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }
})();
