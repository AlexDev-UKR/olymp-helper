// Збирає src/ -> dist/. У production-режимі JS обфусковується, CSS/HTML мінімізуються.
import fs from "node:fs";
import Obf from "javascript-obfuscator";
const dev = process.argv.includes("--dev");
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
const rd = p => fs.readFileSync(`src/${p}`, "utf8");
const minCss = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};,])\s*/g, "$1");
const minHtml = s => s.replace(/>\s+</g, "><");
// Рівень захисту JS (код усередині програми, не бінарник). За замовчуванням «light»: мінімізація зі скороченням імен,
// без шифрування рядків і «шумових» вставок: такий код не схожий на шкідливий скрипт і не дає хибних спрацювань.
//   OLYMP_OBFUSCATION=light (типово) | strong (колишня агресивна обфускація) | off (без змін)
const LEVEL = (process.env.OLYMP_OBFUSCATION || "light").toLowerCase();
const LIGHT = { compact: true, simplify: true, target: "browser", renameGlobals: false, identifierNamesGenerator: "mangled",
  stringArray: false, controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false, splitStrings: false };
const STRONG = { compact: true, simplify: true, target: "browser", renameGlobals: false, identifierNamesGenerator: "hexadecimal",
  stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.9, rotateStringArray: true,
  splitStrings: true, splitStringsChunkLength: 6 };
const obf = (code) => LEVEL === "off" ? code : Obf.obfuscate(code, LEVEL === "strong" ? STRONG : LIGHT).getObfuscatedCode();

// головний інтерфейс: config.js + app.js
fs.writeFileSync("dist/index.html", dev ? rd("index.html") : minHtml(rd("index.html")));
fs.writeFileSync("dist/style.css", dev ? rd("style.css") : minCss(rd("style.css")));
const js = rd("config.js") + "\n" + rd("app.js");
fs.writeFileSync("dist/app.js", dev ? js : obf(js));
// службові вікна: екран завантаження та сповіщення про повторний запуск
fs.writeFileSync("dist/guard.js", dev ? rd("guard.js") : obf(rd("guard.js")));
fs.copyFileSync("src/logo.svg", "dist/logo.svg");
fs.copyFileSync("src/banner.svg", "dist/banner.svg");
fs.cpSync("src/icons", "dist/icons", { recursive: true });
for (const n of ["splash", "notice"]) {
  fs.writeFileSync(`dist/${n}.html`, rd(`${n}.html`));
  fs.writeFileSync(`dist/${n}.css`, dev ? rd(`${n}.css`) : minCss(rd(`${n}.css`)));
  fs.writeFileSync(`dist/${n}.js`, dev ? rd(`${n}.js`) : obf(rd(`${n}.js`)));
}
console.log(dev ? "frontend: dev build" : `frontend: production build (JS: ${LEVEL})`);
