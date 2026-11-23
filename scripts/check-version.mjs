// Перевіряє, що версія в package.json, Cargo.toml і tauri.conf.json однакова (і збігається з тегом, якщо його передано).
// Використання: node scripts/check-version.mjs [v1.2.12]
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const cargo = /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/.exec(fs.readFileSync("src-tauri/Cargo.toml", "utf8"))?.[1];
const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const tag = (process.argv[2] || process.env.GITHUB_REF_NAME || "").replace(/^v/, "");
const found = { "package.json": pkg, "src-tauri/Cargo.toml": cargo, "src-tauri/tauri.conf.json": conf };
if (tag) found["тег Git"] = tag;
const versions = new Set(Object.values(found));
for (const [k, v] of Object.entries(found)) console.log(`${k.padEnd(28)} ${v}`);
if (versions.size !== 1 || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test([...versions][0])) {
  console.error("\nПомилка: версії відрізняються або мають неправильний формат (потрібно X.Y.Z або X.Y.Z-beta.N).");
  process.exit(1);
}
console.log("\nВерсії збігаються.");
