#!/usr/bin/env node
// Hook SessionStart du plugin ottho-code-app : Ottho Builder 2 (vue du pipeline des agents, en
// lecture seule) accompagne chaque session Claude Code.
//   Cherche le Builder du projet (/api/health sur 4317 à 4326, champ project ; l'appel avec
//   ?project= le garde en vie). Sinon, dans un projet Ottho ou un dossier encore vide, le démarre
//   détaché : node <cli> --project <dossier> --plugin <plugin> --idle-exit 30 (il s'arrête seul
//   30 min après la fermeture de son dernier onglet), journal dans .claude/ottho-builder.log.
//   Verrou .claude/ottho-builder.lock : deux hooks simultanés du même projet (deux sessions, ou le
//   plugin chargé deux fois) ne lancent qu'un Builder, l'autre attend qu'il réponde.
//   source compact ou clear : lancé avec --no-open (pas de navigateur en pleine session).
//   Chemin du Builder : OTTHO_PIPELINE_CLI (tests), sinon <home>/engine.json, écrit par chaque
//   lancement d'ottho-pipeline (home : OTTHO_PIPELINE_HOME ou ~/.ottho-pipeline).
//   Sortie : systemMessage (adresse, pour l'utilisateur), additionalContext (pour Claude).
// --open (commande /pipeline) : sans la garde du dossier, ouvre le navigateur si le Builder
// tournait déjà (un Builder qui démarre l'ouvre lui-même), sortie en une ligne de texte.
// --project <dossier> remplace le dossier de la session ; --ports a-b : autres ports (tests).
// Jamais bloquant : toute erreur → sortie 0, rien sur stderr.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const PORTS = Array.from({ length: 10 }, (_, i) => 4317 + i);
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WAIT_MS = 8000;
const POLL_MS = 250;
const PROBE_MS = 800;
const LOCK_FRESH_MS = 15_000;
// Fichiers qui signent un projet Ottho (specs : dossier).
const MARKERS = [".claude/pipeline-events.jsonl", "docs/brief.md", "docs/PRD.md", "design/charte.md"];

export const NOT_FOUND = "Ottho Builder 2 introuvable : installe-le (npx ottho-pipeline --install) pour voir le pipeline.";
export const NOT_STARTED = "Ottho Builder 2 n'a pas démarré : voir .claude/ottho-builder.log.";
export const STARTING = "Ottho Builder 2 démarre encore : il s'ouvrira dans le navigateur (sinon voir .claude/ottho-builder.log).";
export const STARTING_NO_OPEN = "Ottho Builder 2 démarre encore : /pipeline l'ouvrira dans le navigateur (sinon voir .claude/ottho-builder.log).";

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
    const home = env.OTTHO_PIPELINE_HOME || join(env.HOME || homedir(), ".ottho-pipeline");
    try {
      ({ node, cli } = JSON.parse(readFileSync(join(home, "engine.json"), "utf8")));
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

const removeQuietly = (path) => {
  try {
    rmSync(path, { force: true });
  } catch {
    // reste sur le disque : un verrou expire au bout de 15 s
  }
};

// Verrou de lancement : true si ce hook le prend, false si un autre hook lance déjà le Builder.
// Un verrou de plus de 15 s (hook interrompu, Builder lent) est repris : renommé d'abord (un seul
// hook y parvient), et rendu si c'était entre-temps le verrou récent d'un autre hook.
function takeLock(lock) {
  mkdirSync(dirname(lock), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      closeSync(openSync(lock, "wx"));
      return true;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
    }
    let seen;
    try {
      seen = statSync(lock);
    } catch {
      continue; // retiré entre-temps
    }
    if (Date.now() - seen.mtimeMs < LOCK_FRESH_MS) return false;
    const stale = `${lock}.${process.pid}.${randomBytes(4).toString("hex")}`;
    try {
      renameSync(lock, stale);
    } catch {
      continue; // un autre hook l'a repris
    }
    let other = false;
    try {
      other = statSync(stale).ino !== seen.ino;
    } catch {
      // disparu : rien à rendre
    }
    if (other) {
      try {
        renameSync(stale, lock);
      } catch {
        removeQuietly(stale);
      }
      return false;
    }
    removeQuietly(stale);
  }
  return false;
}

// Builder détaché (il survit à la session), sorties dans .claude/ottho-builder.log.
function launch({ engine, dir, pluginRoot, env, spawnFn, noOpen }) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const fd = openSync(join(dir, ".claude", "ottho-builder.log"), "w");
  try {
    const args = [engine.cli, "--project", dir, "--plugin", pluginRoot, "--idle-exit", "30", ...(noOpen ? ["--no-open"] : [])];
    const child = spawnFn(engine.node, args, {
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

// Attend que le Builder réponde pour ce projet ; abandonne s'il s'arrête (exited) ou au bout de ms.
// child null : lancé par un autre hook, seul le délai compte.
async function waitBuilder(dir, ports, child, ms) {
  let exited = false;
  child?.on?.("exit", () => (exited = true));
  child?.on?.("error", () => (exited = true));
  const deadline = Date.now() + ms;
  for (;;) {
    const last = exited;
    const url = await findBuilder(dir, ports);
    if (url || last || Date.now() >= deadline) return { url, exited };
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

// Argument shell POSIX : entre apostrophes, chaque apostrophe écrite '\''.
export const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

export function contextFor({ url, engine, dir, pluginRoot }) {
  const q = shellQuote;
  return [
    `Ottho Builder 2 (vue du pipeline des agents, en lecture seule) tourne sur ${url} pour ce projet. Les questions des agents et les validations se font dans ce terminal : l'app les affiche sans rien écrire, sauf son panneau Config (variables dans .env.local).`,
    engine && `Pour écrire le brief du projet (docs/brief.md) : ${q(engine.node)} ${q(engine.cli)} brief --project ${q(dir)} suivi d'une seule option : --list (exemples enregistrés), --preset <nom> ou --json <fichier>.`,
    `Pour rouvrir la vue dans le navigateur (commande /pipeline), avec l'outil Bash au premier plan : node ${q(join(pluginRoot, "scripts", "visual-engine.mjs"))} --open --project ${q(dir)}`,
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
  // Contexte compacté ou effacé en pleine session : pas de navigateur qui surgit.
  const noOpen = !force && (payload.source === "compact" || payload.source === "clear");
  const say = (systemMessage, additionalContext) => {
    if (force) return `${systemMessage}\n`;
    return JSON.stringify(additionalContext ? { systemMessage, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } } : { systemMessage });
  };

  // Dossier absent (faute de frappe dans --project) : rien n'est sondé ni créé.
  let isDir = false;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    // introuvable
  }
  if (!isDir) return force ? `dossier de projet introuvable : ${dir}\n` : "";

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
    const lock = join(dir, ".claude", "ottho-builder.lock");
    let mine = false;
    let child = null;
    try {
      mine = takeLock(lock);
      if (mine) child = launch({ engine, dir, pluginRoot, env, spawnFn, noOpen });
    } catch {
      if (mine) removeQuietly(lock);
      return say(NOT_STARTED);
    }
    const waited = await waitBuilder(dir, probed, child, waitMs);
    // Builder qui démarre encore : verrou gardé (expire au bout de 15 s), pas de second lancement.
    if (mine && (waited.url || waited.exited)) removeQuietly(lock);
    url = waited.url;
    if (!url) return say(waited.exited ? NOT_STARTED : noOpen ? STARTING_NO_OPEN : STARTING);
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
