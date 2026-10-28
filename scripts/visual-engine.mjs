#!/usr/bin/env node
// Hook SessionStart du plugin ottho-code-app : Ottho Builder 2 (vue du pipeline des agents, en
// lecture seule) accompagne chaque session Claude Code.
//   Cherche le Builder du projet (/api/health sur 4317 à 4326, champ project ; l'appel avec
//   ?project= le garde en vie). Sinon, dans un projet Ottho ou un dossier encore vide (jamais le
//   dossier personnel), le démarre détaché : node <cli> --project <dossier> --plugin <plugin>
//   --idle-exit 30 (il s'arrête seul 30 min après la fermeture de son dernier onglet), journal dans
//   .claude/ottho-builder.log. Jamais à travers un lien symbolique : .claude ou le journal en lien
//   (dépôt piégé) → pas de lancement, aucun fichier visé n'est écrit.
//   Verrou .claude/ottho-builder.lock : deux hooks simultanés du même projet (deux sessions, ou le
//   plugin chargé deux fois) ne lancent qu'un Builder, l'autre attend qu'il réponde.
//   Verrou ancien (plus de 15 s) repris par un seul hook à la fois (.claude/ottho-builder.lock.break).
//   source compact ou clear : lancé avec --no-open (pas de navigateur en pleine session).
//   Builder : inclus dans le plugin, <plugin>/builder/bin/cli.mjs, lancé par le node qui exécute
//   ce hook (plugin : CLAUDE_PLUGIN_ROOT, sinon le dossier parent de scripts/). OTTHO_PIPELINE_CLI
//   le remplace (tests).
//   Sortie : systemMessage (adresse, pour l'utilisateur), additionalContext (pour Claude).
// --open (commande /pipeline) : sans la garde du dossier, ouvre le navigateur si le Builder
// tournait déjà (un Builder qui démarre l'ouvre lui-même), sortie en une ligne de texte.
// --project <dossier> remplace le dossier de la session ; --ports a-b : autres ports (tests).
// Jamais bloquant : toute erreur → sortie 0, rien sur stderr.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, constants as fsConstants, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
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
// Fichiers qui signent un projet Ottho, ou au moins une spec specs/US-*.md. Pas
// .claude/pipeline-events.jsonl : les hooks du plugin l'écrivent dans tout dossier où il est actif.
const MARKERS = ["docs/brief.md", "docs/PRD.md", "design/charte.md"];
const SPEC_RE = /^US-\d+.*\.md$/i;
// Seules entrées d'un dossier encore vide : Git, Finder, Claude Code, brief en cours.
const EMPTY_DIR_ENTRIES = new Set([".git", ".DS_Store", ".claude", ".ottho-brief.json"]);

export const NOT_FOUND = "Ottho Builder 2 absent du plugin ottho-code-app (builder/bin/cli.mjs introuvable) : le plugin est incomplet, mets-le à jour ou réinstalle-le.";
export const NOT_STARTED = "Ottho Builder 2 n'a pas démarré : voir .claude/ottho-builder.log.";
export const STARTING = "Ottho Builder 2 démarre encore : il s'ouvrira dans le navigateur (sinon voir .claude/ottho-builder.log).";
export const STARTING_NO_OPEN = "Ottho Builder 2 démarre encore : /pipeline l'ouvrira dans le navigateur (sinon voir .claude/ottho-builder.log).";
export const UNSAFE = "Ottho Builder 2 n'a pas démarré : .claude ou .claude/ottho-builder.log est un lien symbolique, refusé par sécurité.";

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

const hasSpec = (dir) => {
  try {
    return readdirSync(join(dir, "specs")).some((name) => SPEC_RE.test(name) && isFile(join(dir, "specs", name)));
  } catch {
    return false; // pas de specs/
  }
};

// Dossier personnel (os.homedir() ou HOME de l'environnement), liens résolus.
function isHome(dir, env) {
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  const target = real(dir);
  return [homedir(), env.HOME].some((h) => typeof h === "string" && h && real(h) === target);
}

// Projet Ottho (un marqueur ou une spec) ou dossier neuf (rien d'autre que .git, .DS_Store, .claude,
// .ottho-brief.json). Jamais le dossier personnel, où Claude Code s'ouvre souvent sans projet.
export function isOtthoProject(dir, env = process.env) {
  if (isHome(dir, env)) return false;
  if (MARKERS.some((m) => isFile(join(dir, m))) || hasSpec(dir)) return true;
  try {
    return readdirSync(dir).every((name) => EMPTY_DIR_ENTRIES.has(name));
  } catch {
    return false;
  }
}

// Dossier du plugin : CLAUDE_PLUGIN_ROOT (fourni par Claude Code), sinon celui de ce script.
export const pluginRootOf = (env) => resolve(env.CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT);

// Builder à lancer : { node, cli } ou null (plugin incomplet). Celui du plugin
// (<plugin>/builder/bin/cli.mjs), ou OTTHO_PIPELINE_CLI (tests) ; node : celui qui exécute ce hook.
export function engineOf(env, pluginRoot = pluginRootOf(env)) {
  const cli = env.OTTHO_PIPELINE_CLI || join(pluginRoot, "builder", "bin", "cli.mjs");
  return isFile(cli) ? { node: process.execPath, cli: resolve(cli) } : null;
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

const isFresh = (st) => Date.now() - st.mtimeMs < LOCK_FRESH_MS;

// Chemin de .claude ou du journal qui est un lien symbolique (dépôt piégé) : pas de lancement.
class UnsafePathError extends Error {}

// Dossier .claude du projet, créé au besoin : un vrai dossier, jamais un lien symbolique (le verrou
// et le journal seraient écrits là où il pointe).
function claudeDir(dir) {
  const path = join(dir, ".claude");
  try {
    mkdirSync(path);
  } catch (err) {
    if (err?.code !== "EEXIST") throw err; // EEXIST aussi pour un lien, même cassé : rien de créé
  }
  const st = lstatSync(path);
  if (st.isSymbolicLink()) throw new UnsafePathError(path);
  if (!st.isDirectory()) throw new Error(`${path} n'est pas un dossier`);
  return path;
}

const { O_WRONLY, O_CREAT, O_TRUNC, O_NOFOLLOW } = fsConstants;

// Journal ouvert en écriture sans suivre de lien symbolique : O_NOFOLLOW (l'ouverture échoue avant
// de vider quoi que ce soit) ; sans lui (Windows), lstat d'abord.
function openLog(path) {
  const isLink = () => {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  };
  if (O_NOFOLLOW === undefined) {
    if (isLink()) throw new UnsafePathError(path);
    return openSync(path, "w");
  }
  try {
    return openSync(path, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0o644);
  } catch (err) {
    throw isLink() ? new UnsafePathError(path) : err; // ELOOP (EMLINK sous FreeBSD)
  }
}

// Fichier créé seulement s'il n'existe pas : true si ce hook l'a créé. O_EXCL : un lien symbolique
// au même chemin, même cassé, compte comme existant (jamais suivi).
function createExclusive(path) {
  try {
    closeSync(openSync(path, "wx"));
    return true;
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
    return false;
  }
}

// Verrou de reprise (<verrou>.break) : un seul hook à la fois reprend un verrou ancien. Laissé
// par un hook tué en pleine reprise : retiré au bout de 15 s, puis repris.
function takeBreak(path) {
  if (createExclusive(path)) return true;
  try {
    if (isFresh(lstatSync(path))) return false;
  } catch {
    // retiré entre-temps
  }
  removeQuietly(path);
  return createExclusive(path);
}

// Verrou de lancement : true si ce hook le prend, false si un autre hook lance déjà le Builder.
// Un verrou de plus de 15 s (hook interrompu, Builder lent) est repris, par un seul hook à la fois
// (verrou de reprise) : sinon un hook qui reprend pourrait retirer le verrou neuf d'un autre et
// laisser un troisième en créer un, d'où deux lancements. Sous ce verrou : renommé d'abord, et rendu
// par un lien (échoue si le chemin est pris, jamais par-dessus un verrou neuf) si c'était en fait
// un verrou récent. Aucun lien symbolique suivi : lstat, rename et rm agissent sur le lien lui-même,
// et seul un fichier ordinaire (créé par un hook) est rendu. Dossier .claude déjà vérifié.
function takeLock(lock) {
  const breaker = `${lock}.break`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (createExclusive(lock)) return true;
    try {
      if (isFresh(lstatSync(lock))) return false;
    } catch {
      continue; // retiré entre-temps
    }
    if (!takeBreak(breaker)) return false; // un autre hook le reprend
    try {
      let seen;
      try {
        seen = lstatSync(lock);
      } catch {
        continue; // retiré entre-temps : nouvel essai
      }
      if (isFresh(seen)) return false;
      const stale = `${lock}.${process.pid}.${randomBytes(4).toString("hex")}`;
      try {
        renameSync(lock, stale);
      } catch {
        continue;
      }
      let other = false;
      try {
        const st = lstatSync(stale);
        other = st.isFile() && (st.ino !== seen.ino || isFresh(st));
      } catch {
        // disparu : rien à rendre
      }
      if (other) {
        try {
          linkSync(stale, lock);
        } catch {
          // EEXIST : un autre hook tient le verrou ; on attend son Builder.
        }
        removeQuietly(stale);
        return false;
      }
      removeQuietly(stale);
      // Pris par un hook arrivé entre-temps (EEXIST) : c'est lui qui lance.
      return createExclusive(lock);
    } finally {
      removeQuietly(breaker);
    }
  }
  return false;
}

// Builder détaché (il survit à la session), sorties dans .claude/ottho-builder.log.
function launch({ engine, dir, pluginRoot, env, spawnFn, noOpen }) {
  const fd = openLog(join(claudeDir(dir), "ottho-builder.log"));
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
    engine && `Pour écrire le brief du projet (docs/brief.md) : node ${q(engine.cli)} brief --project ${q(dir)} suivi d'une seule option : --list (exemples enregistrés), --preset <nom> ou --json <fichier> ; format et questions : skill project-bootstrap, étape 0.`,
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
  const pluginRoot = pluginRootOf(env);
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
  if (!isDir) return force ? `Ottho Builder 2 : dossier de projet introuvable : ${dir}\n` : "";

  const engine = engineOf(env, pluginRoot);
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
    if (!force && !isOtthoProject(dir, env)) return "";
    if (!engine) return say(NOT_FOUND);
    let lock = null;
    let mine = false;
    let child = null;
    try {
      lock = join(claudeDir(dir), "ottho-builder.lock");
      mine = takeLock(lock);
      if (mine) child = launch({ engine, dir, pluginRoot, env, spawnFn, noOpen });
    } catch (err) {
      if (mine) removeQuietly(lock);
      return say(err instanceof UnsafePathError ? UNSAFE : NOT_STARTED);
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
