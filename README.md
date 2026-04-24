# Local CLI Extension

Chrome MV3 侧边栏项目。  
聊天可接 `codex-cli`、`cursor-cli`，翻译可接 `ollama`、`openai-compatible`，并且品牌、模型、服务地址都能自己改。

A compact English section is included at the end.

## 亮点

- 本地优先：通过本机 bridge 连接 CLI 或模型服务
- 聊天与翻译解耦：可以分别选择不同 provider
- 交互完整：悬浮球、侧边栏、停止按钮、右键菜单、网页翻译、模型选择
- 易于 fork：支持改名、换图标、换默认 provider、换模型地址

## 支持的 Provider

### 聊天

- `codex-cli`
- `cursor-cli`

### 翻译

- `ollama`
- `openai-compatible`

## 快速开始

1. 初始化生成文件：

   ```bash
   npm run init
   ```

2. 如果你使用 Codex 聊天：

   ```bash
   npm run login:codex
   ```

   如果你使用 Cursor 聊天：

   ```bash
   npm run login:cursor
   ```

3. 启动本地 bridge：

   ```bash
   npm run start:bridge
   ```

4. 打开 `chrome://extensions/`
   - 开启开发者模式
   - 点击“加载已解压的扩展程序”
   - 选择仓库里的 `extension/` 目录

5. 打开扩展设置页，填入 bridge 输出的 URL 和 token。

## 默认配置

- 扩展安装名：`Local CLI Extension`
- 侧边栏标题：`Local CLI Extension`
- 悬浮球图标：`✨`
- 默认聊天 provider：`codex-cli`
- 默认翻译 provider：`ollama`
- 默认翻译模型：`qwen3.5:4b`

## 能做什么

- 所有网页上的悬浮球和悬停展开侧边栏
- 右键选中文字后填入提问框
- 右键选中文字直接翻译
- 右键翻译当前屏幕可见网页段落
- 翻译流式输出与停止
- 聊天模型选择与停止
- 设置页修改品牌、provider、模型和服务地址

## 仓库结构

- `extension/`：Chrome 扩展本体
- `bridge/`：本地 bridge 服务
- `config/`：默认配置与示例配置
- `scripts/`：初始化、构建、品牌脚本
- `docs/`：provider 与品牌说明

## 定制方式

- Provider 说明：`docs/providers.md`
- 品牌定制：`docs/branding.md`
- 品牌命令：

  ```bash
  npm run brand -- --name "My Extension" --sidebar-title "My Sidebar" --emoji "🌿"
  npm run build
  ```

## 开发检查

```bash
npm run check
```

它会重建生成文件并检查 bridge / extension 的语法。

## English

`local-cli-extension` is a Chrome MV3 sidebar project with configurable chat and translation providers.

### Supported chat providers

- `codex-cli`
- `cursor-cli`

### Supported translation providers

- `ollama`
- `openai-compatible`

### Quick start

```bash
npm run init
npm run start:bridge
```

Then load the `extension/` folder in `chrome://extensions`, enable Developer Mode, and fill in the bridge URL and token from the bridge output.
