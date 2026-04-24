# Branding / 品牌定制

## 中文

品牌配置分成两层。

### 运行时品牌

可以在扩展设置页里直接改：

- sidebar 标题
- 悬浮球 emoji
- 欢迎语
- bridge 标签文案

这些值在扩展重新加载后就能直接反映到 UI。

### 构建时品牌

定义在 [config/defaults.json](/Users/mitsuki/LLM/privt_project/local-cli-extension/config/defaults.json)，通过 `npm run build` 写入最终扩展产物：

- 扩展安装名
- manifest 描述
- action title
- options 页标题

使用方式：

```bash
npm run brand -- --name "My Extension" --sidebar-title "My Sidebar" --emoji "🌿"
npm run build
```

这会更新生成的 manifest 和配置文件。

---

## English

Branding is split into two layers.

### Runtime branding

Editable from the extension options page:

- sidebar title
- floating bubble emoji
- welcome message
- bridge label text

### Build-time branding

Defined in [config/defaults.json](/Users/mitsuki/LLM/privt_project/local-cli-extension/config/defaults.json) and applied by `npm run build`:

- extension install name
- manifest description
- action title
- options page title
