import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config", "defaults.json");
const examplePath = path.join(root, "config", "example.local.json");

spawnSync(process.execPath, [path.join(__dirname, "build-extension.mjs")], { stdio: "inherit" });

console.log("\nProject initialized.");
console.log(`- Defaults: ${configPath}`);
console.log(`- Example overrides: ${examplePath}`);
console.log("- Next: npm run start:bridge");
console.log("- Then load extension/ in chrome://extensions");
