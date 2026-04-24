import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config", "defaults.json");
const extensionDir = path.join(root, "extension");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const manifest = {
  manifest_version: 3,
  name: config.build.extensionName,
  description: config.build.manifestDescription,
  version: "0.2.0",
  permissions: ["contextMenus", "storage", "activeTab"],
  host_permissions: ["http://127.0.0.1/*", "http://localhost/*", "https://*/*"],
  background: {
    service_worker: "background.js",
    type: "module"
  },
  options_page: "options.html",
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["generated-config.js", "content.js"],
      run_at: "document_idle"
    }
  ],
  commands: {
    "toggle-sidebar": {
      suggested_key: {
        default: "Ctrl+Shift+G",
        mac: "Command+Shift+G"
      },
      description: `Toggle ${config.build.extensionName}`
    }
  },
  action: {
    default_title: config.build.actionTitle
  }
};

const globalConfig = `globalThis.LOCAL_CLI_EXTENSION_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
const moduleConfig = `const config = ${JSON.stringify(config, null, 2)};\nexport default config;\n`;

fs.writeFileSync(path.join(extensionDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(extensionDir, "generated-config.js"), globalConfig);
fs.writeFileSync(path.join(extensionDir, "generated-config.mjs"), moduleConfig);

console.log("Built extension manifest and generated config.");
