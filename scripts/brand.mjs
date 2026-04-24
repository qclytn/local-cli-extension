import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config", "defaults.json");
const args = process.argv.slice(2);
const updates = {};

for (let index = 0; index < args.length; index += 1) {
  const key = args[index];
  const value = args[index + 1];
  if (!value) continue;
  if (key === "--name") updates.extensionName = value;
  if (key === "--sidebar-title") updates.sidebarTitle = value;
  if (key === "--emoji") updates.bubbleIcon = value;
}

if (!updates.extensionName && !updates.sidebarTitle && !updates.bubbleIcon) {
  console.error("Usage: npm run brand -- --name \"My Extension\" --sidebar-title \"My Sidebar\" --emoji \"🌿\"");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
if (updates.extensionName) {
  config.build.extensionName = updates.extensionName;
  config.build.actionTitle = updates.extensionName;
  config.build.optionsTitle = `${updates.extensionName} Options`;
}
if (updates.sidebarTitle) config.runtimeDefaults.branding.sidebarTitle = updates.sidebarTitle;
if (updates.bubbleIcon) config.runtimeDefaults.branding.bubbleIcon = updates.bubbleIcon;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("Updated brand defaults. Run npm run build to refresh extension files.");
