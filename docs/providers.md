# Providers / Provider 说明

## 中文

`local-cli-extension` 把 **聊天 provider** 和 **翻译 provider** 分开设计。

### 聊天 provider

#### `codex-cli`
- 状态：已支持
- 认证方式：用户在本机执行 `codex login`
- 适合：想复用 Codex / ChatGPT 订阅能力的人

#### `cursor-cli`
- 状态：已支持
- 认证方式：用户在本机执行 `cursor-agent login`，或者提供 Cursor API key
- bridge 行为：通过 `cursor-agent -p --output-format json` 发起聊天
- 说明：项目本身不接管 Cursor OAuth，而是复用官方本地 CLI 登录态

#### `openai-compatible`
- 状态：已支持
- 认证方式：API key / bearer token
- 适合：自建网关、云模型服务、OpenAI 兼容接口

### 翻译 provider

#### `ollama`
- 状态：已支持
- 接口：`POST /api/chat`
- 支持：`think: false` 与 `stream: true`
- 默认模型：`qwen3.5:4b`

#### `openai-compatible`
- 状态：已支持
- 接口：流式 Chat Completions
- 适合：不想走本地 Ollama，希望走远程模型服务

### 健康检查接口

bridge 暴露这些接口：

- `GET /health`
- `GET /providers/health`
- `GET /providers/models?provider=...`

它们主要给设置页和本地调试使用。

---

## English

`local-cli-extension` separates **chat providers** from **translation providers**.

### Chat providers

#### `codex-cli`
- Status: supported
- Auth model: run `codex login` on the same machine

#### `cursor-cli`
- Status: supported
- Auth model: run `cursor-agent login` locally, or provide a Cursor API key
- Bridge behavior: shells out to `cursor-agent -p --output-format json`
- Note: this project does not implement Cursor OAuth itself

#### `openai-compatible`
- Status: supported
- Auth model: API key or bearer token

### Translation providers

#### `ollama`
- Status: supported
- Uses `POST /api/chat`
- Supports `think: false` and `stream: true`

#### `openai-compatible`
- Status: supported
- Uses streaming Chat Completions style responses
