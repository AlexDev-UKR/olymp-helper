// Збирає src/ -> dist/. У production-режимі JS обфусковується, CSS/HTML мінімізуються.
import fs from "node:fs";
import Obf from "javascript-obfuscator";
const dev = process.argv.includes("--dev");
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
const css = fs.readFileSync("src/style.css", "utf8");
const html = fs.readFileSync("src/index.html", "utf8");
const js = fs.readFileSync("src/app.js", "utf8");
const minCss = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{};,])\s*/g, "$1");
fs.writeFileSync("dist/style.css", dev ? css : minCss(css));
fs.writeFileSync("dist/index.html", dev ? html : html.replace(/>\s+</g, "><"));
fs.writeFileSync("dist/app.js", dev ? js : Obf.obfuscate(js, {
  compact: true, simplify: true, target: "browser", renameGlobals: false,
  identifierNamesGenerator: "hexadecimal",
  stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.9, rotateStringArray: true,
  splitStrings: true, splitStringsChunkLength: 6
}).getObfuscatedCode());
console.log(dev ? "frontend: dev build" : "frontend: obfuscated production build");
