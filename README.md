# Local CLI Extension

中文优先的可共享 Chrome MV3 侧边栏项目。它基于本地 bridge 工作，保留了你已经验证过的交互形态，同时把品牌、聊天 provider、翻译 provider、模型和服务地址都做成可配置。

English readers: a short English section is included below. The repository is now documented in Chinese first, with English retained for accessibility.

## 中文说明

### 这是什么

- 一个会注入到所有网页右侧的悬浮侧边栏扩展
- 正常聊天和网页翻译分开走不同 provider
- 默认聊天走 `codex-cli`
- 默认翻译走 `ollama`
- 可切换到 `cursor-cli` 或 `openai-compatible`
- 可改名、可换图标、可作为自己的 fork 项目继续定制

### 当前功能

- 所有网页悬浮球 + 悬停展开侧边栏
- 右键选中文字后填入提问框
- 右键选中文字直接翻译
- 右键翻译当前可见网页段落
- 翻译支持流式输出与停止
- 聊天支持模型选择与停止
- 设置页支持品牌、bridge、聊天 provider、翻译 provider、模型和服务地址配置

### 快速开始

1. 初始化生成文件：

   ```bash
   npm run init
   ```

2. 如果你想用 Codex 聊天：

   ```bash
   npm run login:codex
   ```

   如果你想用 Cursor 聊天，请先确保本机已安装 Cursor CLI，再执行：

   ```bash
   npm run login:cursor
   ```

3. 启动本地 bridge：

   ```bash
   npm run start:bridge
   ```

4. 打开 `chrome://extensions/`
   - 开启开发者模式
   - 选择“加载已解压的扩展程序”
   - 载入 [extension/](/Users/mitsuki/LLM/privt_project/local-cli-extension/extension)

5. 打开扩展设置页，填入 bridge 输出的 URL 和 token。

### 默认配置

- 扩展安装名：`Local CLI Extension`
- 侧边栏标题：`Local CLI Extension`
- 悬浮球图标：`✨`
- 聊天 provider：`codex-cli`
- 翻译 provider：`ollama`
- 默认 Ollama 模型：`qwen3.5:4b`

### Provider 支持情况

- `codex-cli` 聊天：已支持
- `cursor-cli` 聊天：已支持，依赖本机官方 CLI
- `openai-compatible` 聊天：已支持
- `ollama` 翻译：已支持
- `openai-compatible` 翻译：已支持

### 文档入口

- Provider 说明：[docs/providers.md](/Users/mitsuki/LLM/privt_project/local-cli-extension/docs/providers.md)
- 品牌定制：[docs/branding.md](/Users/mitsuki/LLM/privt_project/local-cli-extension/docs/branding.md)
- GitHub 首页文案建议：[docs/github-homepage.md](/Users/mitsuki/LLM/privt_project/local-cli-extension/docs/github-homepage.md)

### 开源仓库友好项

- 已包含 [.gitignore](/Users/mitsuki/LLM/privt_project/local-cli-extension/.gitignore)
- 已包含 [MIT LICENSE](/Users/mitsuki/LLM/privt_project/local-cli-extension/LICENSE)
- 已支持品牌构建脚本：`npm run brand -- --name ... --sidebar-title ... --emoji ...`

### 备注

- 老项目 [gpt_side_bar](/Users/mitsuki/LLM/privt_project/gpt_side_bar) 保持不动
- 这个仓库是更适合分享和 fork 的通用版
- `npm run check` 会重建生成文件并做语法检查

---

## English

`local-cli-extension` is a shareable Chrome MV3 sidebar project built around a local bridge. It keeps the interaction model already validated in the original local project, while making branding, provider choice, model settings, and translation backends configurable.

### What it does

- Injects a hover-to-open sidebar on every page
- Separates chat providers from translation providers
- Ships with working defaults for `codex-cli` chat and `ollama` translation
- Supports `cursor-cli` chat through the official local CLI
- Can be rebranded for your own fork

### Quick start

```bash
npm run init
npm run start:bridge
```

Then load [extension/](/Users/mitsuki/LLM/privt_project/local-cli-extension/extension) in `chrome://extensions` with Developer Mode enabled, and fill in the bridge URL and token from the bridge output.

### Provider support

- `codex-cli` chat: supported
- `cursor-cli` chat: supported via the official local CLI
- `openai-compatible` chat: supported
- `ollama` translation: supported
- `openai-compatible` translation: supported
