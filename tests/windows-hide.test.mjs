import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Le Builder tourne détaché, sans console, sous Windows : tout programme console qu'il lance (git,
// npm, taskkill, cmd) y ouvrirait une fenêtre de terminal à chaque appel. Les hooks aussi, par
// précaution.
const DIRS = ["builder/bin", "builder/server", "scripts"];
// Appels de child_process (ou de leurs versions injectées), pas les méthodes comme RE.exec(…).
const CALL_RE = /(?<![.\w])(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork|nodeSpawn|spawnFn|run)\(/g;

// Texte de l'appel, de son nom à la parenthèse fermante.
function callAt(src, start) {
  let depth = 0;
  for (let i = src.indexOf("(", start); i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

test("windowsHide sur chaque processus lancé par le Builder et les hooks (sinon une fenêtre de terminal par appel sous Windows)", () => {
  const calls = [];
  for (const dir of DIRS) {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
      const src = readFileSync(join(ROOT, dir, name), "utf8");
      if (!src.includes("node:child_process")) continue;
      for (const m of src.matchAll(CALL_RE)) {
        const call = callAt(src, m.index);
        calls.push(`${dir}/${name} : ${call.split("\n")[0]}`);
        assert.match(call, /windowsHide: true/, `${dir}/${name} : ${call.slice(0, 160)}`);
      }
    }
  }
  // git, npm, taskkill, navigateur (Builder et hook), lancement du Builder, git du hook.
  assert.ok(calls.length >= 8, calls.join("\n"));
});
