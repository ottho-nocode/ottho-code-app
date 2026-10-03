#!/usr/bin/env node
// Hook SessionStart du plugin ottho-code-app : Ottho Builder 2 (vue du pipeline des agents, en
// lecture seule) accompagne chaque session Claude Code.
//   Cherche le Builder du projet (/api/health sur 4317 à 4326, champ project ; l'appel avec
//   ?project= le garde en vie). Sinon, dans un projet Ottho ou un dossier encore vide, le démarre
//   détaché : node <cli> --project <dossier> --plugin <plugin> --idle-exit 30 (il s'arrête seul
//   30 min après la fermeture de son dernier onglet), journal dans .claude/ottho-builder.log.
//   Chemin du Builder : OTTHO_PIPELINE_CLI (tests), sinon <home>/engine.json, écrit par chaque
//   lancement d'ottho-pipeline (home : OTTHO_PIPELINE_HOME ou ~/.ottho-pipeline).
//   Sortie : systemMessage (adresse, pour l'utilisateur), additionalContext (pour Claude).
// --open (commande /pipeline) : sans la garde du dossier, ouvre le navigateur si le Builder
// tournait déjà (un Builder qui démarre l'ouvre lui-même), sortie en une ligne de texte.
// --project <dossier> remplace le dossier de la session ; --ports a-b : autres ports (tests).
// Jamais bloquant : toute erreur → sortie 0, rien sur stderr.
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const PORTS = Array.from({ length: 10 }, (_, i) => 4317 + i);
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WAIT_MS = 8000;
const POLL_MS = 250;
const PROBE_MS = 800;
// Fichiers qui signent un projet Ottho (specs : dossier).
const MARKERS = [".claude/pipeline-events.jsonl", "docs/brief.md", "docs/PRD.md", "design/charte.md"];

export const NOT_FOUND = "Ottho Builder 2 introuvable : installe-le (npx ottho-pipeline --install) pour voir le pipeline.";
export const NOT_STARTED = "Ottho Builder 2 n'a pas démarré : voir .claude/ottho-builder.log.";

// Projet Ottho (un marqueur) ou dossier neuf (rien d'autre que des fichiers cachés).
export function isOtthoProject(dir) {
  if (MARKERS.some((m) => existsSync(join(dir, m)))) return true;
  try {
    if (statSync(join(dir, "specs")).isDirectory()) return true;
  } catch {
    // pas de specs/
  }
  try {
    return readdirSync(dir).every((name) => name.startsWith("."));
  } catch {
    return false;
  }
}

// Builder à lancer : { node, cli } ou null. Le node noté peut avoir disparu (mise à jour Homebrew) :
// celui qui exécute ce hook le remplace.
export function engineOf(env) {
  let cli = env.OTTHO_PIPELINE_CLI;
  let node = process.execPath;
  if (!cli) {
    try {
      ({ node, cli } = JSON.parse(readFileSync(join(env.OTTHO_PIPELINE_HOME || join(homedir(), ".ottho-pipeline"), "engine.json"), "utf8")));
    } catch {
      return null;
    }
  }
  if (typeof cli !== "string" || !cli || !existsSync(cli)) return null;
  return { node: typeof node === "string" && node && existsSync(node) ? node : process.execPath, cli: resolve(cli) };
}

// Adresse du Builder de ce projet (premier port qui répond pour lui), ou null.
export async function findBuilder(dir, ports) {
  const found = await Promise.all(
    ports.map(async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health?project=${encodeURIComponent(dir)}`, { signal: AbortSignal.timeout(PROBE_MS) });
        const body = await res.json();
        return body?.app === "ottho-pipeline" && body.project === dir ? port : null;
      } catch {
        return null;
      }
    }),
  );
  const port = found.find(Boolean);
  return port ? `http://127.0.0.1:${port}` : null;
}

// Builder détaché (il survit à la session), sorties dans .claude/ottho-builder.log.
function launch({ engine, dir, pluginRoot, env, spawnFn }) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const fd = openSync(join(dir, ".claude", "ottho-builder.log"), "w");
  try {
    const child = spawnFn(engine.node, [engine.cli, "--project", dir, "--plugin", pluginRoot, "--idle-exit", "30"], {
      cwd: dir,
      env,
      detached: true,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    child.unref?.();
    return child;
  } finally {
    closeSync(fd);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Attend que le Builder réponde pour ce projet ; abandonne s'il s'arrête ou au bout de ms.
async function waitBuilder(dir, ports, child, ms) {
  let exited = false;
  child?.on?.("exit", () => (exited = true));
  child?.on?.("error", () => (exited = true));
  const deadline = Date.now() + ms;
  for (;;) {
    const last = exited;
    const url = await findBuilder(dir, ports);
    if (url || last || Date.now() >= deadline) return url;
    await sleep(POLL_MS);
  }
}

export function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {}); // pas de navigateur : l'adresse est affichée
  child.unref();
}

export function contextFor({ url, engine, dir, pluginRoot }) {
  return [
    `Ottho Builder 2 (vue du pipeline des agents, en lecture seule) tourne sur ${url} pour ce projet. Les questions des agents et les validations se font dans ce terminal : l'app les affiche sans rien écrire, sauf son panneau Config (variables dans .env.local).`,
    engine && `Pour écrire le brief du projet (docs/brief.md) : "${engine.node}" "${engine.cli}" brief --project "${dir}" suivi d'une seule option : --list (exemples enregistrés), --preset <nom> ou --json <fichier>.`,
    `Pour rouvrir la vue dans le navigateur (commande /pipeline), avec l'outil Bash au premier plan : node "${join(pluginRoot, "scripts", "visual-engine.mjs")}" --open --project "${dir}"`,
  ]
    .filter(Boolean)
    .join("\n");
}

// « 4600-4609 » ou « 4600,4602 » : ports à sonder (tests). null si illisible.
export function parsePorts(spec) {
  const ports = [];
  for (const part of String(spec).split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) return null;
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (to < from || to - from > 100 || to > 65535) return null;
    for (let p = from; p <= to; p++) ports.push(p);
  }
  return ports.length ? ports : null;
}

const payloadOf = (stdin) => {
  try {
    const payload = JSON.parse(stdin);
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
};

// Texte à écrire sur stdout ("" : rien). Dépendances injectables pour les tests.
export async function main({ argv = [], stdin = "", env = process.env, cwd = process.cwd(), ports = PORTS, spawnFn = spawn, open = openBrowser, waitMs = WAIT_MS } = {}) {
  const { values } = parseArgs({ args: argv, strict: false, allowPositionals: true, options: { open: { type: "boolean" }, project: { type: "string" }, ports: { type: "string" } } });
  const force = values.open === true;
  const payload = force ? {} : payloadOf(stdin);
  const given = typeof values.project === "string" && values.project ? values.project : env.CLAUDE_PROJECT_DIR || (typeof payload.cwd === "string" && payload.cwd) || cwd;
  // Même forme que le --project du Builder : chemin absolu, sans « / » final, liens non résolus.
  const dir = resolve(cwd, given);
  const probed = (typeof values.ports === "string" && parsePorts(values.ports)) || ports;
  const pluginRoot = resolve(env.CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT);
  const say = (systemMessage, additionalContext) => {
    if (force) return `${systemMessage}\n`;
    return JSON.stringify(additionalContext ? { systemMessage, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } } : { systemMessage });
  };

  const engine = engineOf(env);
  let url = await findBuilder(dir, probed);
  if (url) {
    if (force) {
      try {
        open(url);
      } catch {
        // pas de navigateur : l'adresse est affichée
      }
    }
  } else {
    if (!force && !isOtthoProject(dir)) return "";
    if (!engine) return say(NOT_FOUND);
    let child;
    try {
      child = launch({ engine, dir, pluginRoot, env, spawnFn });
    } catch {
      return say(NOT_STARTED);
    }
    url = await waitBuilder(dir, probed, child, waitMs);
    if (!url) return say(NOT_STARTED);
  }
  return say(`Ottho Builder 2 : ${url}`, contextFor({ url, engine, dir, pluginRoot }));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) {
  // Rien ne doit atteindre stderr ni faire échouer le démarrage de Claude Code.
  process.on("uncaughtException", () => process.exit(0));
  process.stdout.on("error", () => process.exit(0));
  const argv = process.argv.slice(2);
  let stdin = "";
  if (!argv.includes("--open") && !process.stdin.isTTY) {
    try {
      stdin = readFileSync(0, "utf8");
    } catch {
      // pas de message lisible : dossier courant
    }
  }
  main({ argv, stdin })
    .catch(() => "")
    .then((out) => (out ? process.stdout.write(out, () => process.exit(0)) : process.exit(0)));
}
