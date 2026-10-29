// Point d'entrée : options, réutilisation d'une instance existante, choix du
// port (4317 puis les 9 suivants), ouverture du navigateur. Le Builder fait partie du plugin
// ottho-code-app (dossier builder/) : son hook de démarrage le lance (ou à la main,
// node <plugin>/builder/bin/cli.mjs --project <dossier>, Ctrl+C l'arrête). --reopen ne lance
// rien : il retrouve l'instance du projet. --idle-exit l'arrête seul quand plus aucun onglet
// n'est ouvert. --session <id> : session Claude Code qui le lance ; il s'arrête quand la dernière
// session inscrite se ferme. Sans --plugin : le plugin qui contient ce Builder, sinon le plugin installé.
// La sous-commande `brief` écrit docs/brief.md depuis Claude Code (ou l'enregistre comme exemple), sans rien lancer.
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findPluginDir } from "./agents.mjs";
import { startApp } from "./app.mjs";
import { BRIEF_FILE, cleanBrief, isEmptyBrief, listPresets, missingBlocks, readBrief, savePreset, writeBrief } from "./brief.mjs";
import { eventsPath, rotateIfNeeded } from "./events.mjs";
import { HttpError, localDate } from "./files.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

// Dossier des données du Builder (exemples de brief). OTTHO_PIPELINE_HOME : autre dossier (tests).
const pipelineHome = () => process.env.OTTHO_PIPELINE_HOME || join(homedir(), ".ottho-pipeline");
// Commande qui lance ce Builder, pour les messages (chemin entre guillemets).
const CLI_COMMAND = `node ${JSON.stringify(CLI)}`;

export function resolveOptions(argv, cwd) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      plugin: { type: "string" },
      port: { type: "string" },
      "no-open": { type: "boolean" },
      reopen: { type: "boolean" },
      "idle-exit": { type: "string" },
      session: { type: "string" },
    },
  });
  const port = values.port === undefined ? 4317 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`port invalide : ${values.port}`);
  const idle = values["idle-exit"] === undefined ? null : Number(values["idle-exit"]);
  if (idle !== null && !(Number.isFinite(idle) && idle > 0)) throw new Error(`--idle-exit invalide : ${values["idle-exit"]} (nombre de minutes attendu)`);
  return {
    projectDir: resolve(cwd, values.project ?? "."),
    pluginDir: values.plugin ? resolve(cwd, values.plugin) : undefined,
    port,
    open: !values["no-open"],
    reopen: Boolean(values.reopen),
    idleExitMs: idle === null ? null : idle * 60_000,
    sessions: values.session ? [values.session] : [],
  };
}

// Plugin ottho-code-app qui contient ce Builder (<plugin>/builder/server/cli.mjs), ou null.
export async function ownPluginDir(cliUrl = import.meta.url) {
  const root = fileURLToPath(new URL("../../", cliUrl));
  try {
    const manifest = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    return manifest?.name === "ottho-code-app" ? resolve(root) : null;
  } catch {
    return null; // Builder hors du plugin (copie isolée)
  }
}

// "free" si rien n'écoute, sinon ce que répond /api/health (app null si ce n'est pas nous).
export async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = await res.json().catch(() => ({}));
    return { app: body.app ?? null, project: body.project ?? null };
  } catch (err) {
    return err?.cause?.code === "ECONNREFUSED" ? "free" : { app: null, project: null };
  }
}

export function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {}); // pas de navigateur : l'URL est déjà affichée
  child.unref();
}

const BRIEF_USAGE = `usage : ${CLI_COMMAND} brief [--project <dossier>] --list | --preset <nom> | --json <fichier> | --save <nom>`;

// Brief écrit depuis Claude Code (les skills posent les six blocs puis appellent cette commande) :
// exemple enregistré dans <home>/briefs ou fichier JSON, avec les gardes et sauvegardes de writeBrief.
// --save fait l'inverse : le brief du projet devient un exemple de <home>/briefs.
async function briefCommand(argv, { cwd, log }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { project: { type: "string" }, list: { type: "boolean" }, preset: { type: "string" }, json: { type: "string" }, save: { type: "string" } },
    }));
  } catch {
    throw new Error(BRIEF_USAGE);
  }
  if ([values.list, values.preset, values.json, values.save].filter((v) => v !== undefined).length !== 1) throw new Error(BRIEF_USAGE);
  const presetsDir = join(pipelineHome(), "briefs");
  const presets = values.list || values.preset !== undefined ? await listPresets(presetsDir) : [];
  if (values.list) {
    if (!presets.length) log("Aucun exemple de brief enregistré.");
    for (const p of presets) log(`${p.slug}\t${p.name}`);
    return null;
  }
  // Une faute de frappe dans --project ne doit pas créer un dossier ailleurs.
  const projectDir = resolve(cwd, values.project ?? ".");
  const isDir = await stat(projectDir).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`dossier de projet introuvable : ${projectDir}`);
  if (values.save !== undefined) return savePresetCommand(projectDir, presetsDir, values.save, log);
  let data;
  if (values.preset !== undefined) {
    const wanted = values.preset.toLowerCase();
    const preset = presets.find((p) => p.slug.toLowerCase() === wanted || p.name.toLowerCase() === wanted);
    if (!preset) {
      const known = presets.length ? `Exemples : ${presets.map((p) => p.slug).join(", ")}` : "Aucun exemple enregistré.";
      throw new Error(`exemple inconnu : ${values.preset}. ${known}`);
    }
    data = preset.brief;
  } else {
    let raw;
    try {
      raw = await readFile(resolve(cwd, values.json), "utf8");
    } catch (err) {
      throw new Error(`impossible de lire ${values.json} (${err.code ?? err.message})`);
    }
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JSON invalide dans ${values.json} : ${err.message}`);
    }
  }
  let complete;
  try {
    ({ complete } = await writeBrief(projectDir, data, localDate()));
  } catch (err) {
    // Champ invalide (400), brief vide sur un brief rempli (409) : le message suffit.
    throw err instanceof HttpError ? new Error(err.message) : err;
  }
  const missing = missingBlocks(cleanBrief(data)).map((label) => label[0].toLowerCase() + label.slice(1));
  log(`${join(projectDir, BRIEF_FILE)} écrit (${complete ? "complet" : `incomplet : ${missing.join(", ")}`}).`);
  return null;
}

// Brief du projet enregistré comme exemple (même nom : l'exemple précédent est remplacé).
async function savePresetCommand(projectDir, presetsDir, name, log) {
  const { exists, data } = await readBrief(projectDir);
  const file = join(projectDir, BRIEF_FILE);
  if (!exists) throw new Error(`aucun brief à enregistrer : ${file} est absent.`);
  // Brief vide, ou écrit à la main (sans les données du canevas) : rien à reprendre.
  if (isEmptyBrief(data)) throw new Error(`aucun brief à enregistrer : ${file} est vide (ou n'a pas les données du canevas).`);
  let saved;
  try {
    saved = await savePreset(presetsDir, name, data);
  } catch (err) {
    throw err instanceof HttpError ? new Error(err.message) : err;
  }
  const replaced = saved.replaced ? " Il remplace l'exemple précédent du même nom." : "";
  log(`Exemple « ${name.trim()} » enregistré (${join(presetsDir, `${saved.slug}.json`)}).${replaced}`);
  return null;
}

export async function main(argv, { cwd = process.cwd(), log = console.log } = {}) {
  if (argv[0] === "brief") return briefCommand(argv.slice(1), { cwd, log });
  const opts = resolveOptions(argv, cwd);
  if (opts.reopen) {
    for (let port = opts.port; port < opts.port + 10; port++) {
      const existing = await probe(port);
      if (existing !== "free" && existing.app === "ottho-pipeline" && existing.project === opts.projectDir) {
        const url = `http://127.0.0.1:${port}`;
        log(`Ottho Builder 2 déjà ouvert : ${url}`);
        if (opts.open) openBrowser(url);
        return null;
      }
    }
    throw new Error(
      `Ottho Builder 2 ne tourne pas pour ce projet. Il démarre avec Claude Code dans un projet Ottho (le plugin ottho-code-app le lance) et la commande /pipeline le rouvre. À la main :\n  ${CLI_COMMAND} --project ${JSON.stringify(opts.projectDir)}`,
    );
  }
  const pluginDir = opts.pluginDir ?? (await ownPluginDir()) ?? (await findPluginDir());
  const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
  await rotateIfNeeded(eventsPath(opts.projectDir));

  for (let port = opts.port; port < opts.port + 10; port++) {
    const existing = await probe(port);
    if (existing === "free") {
      try {
        // OTTHO_PIPELINE_CLAUDE_CONFIG : autre configuration Claude Code (tests), à la place de ~/.claude.json.
        const claudeConfigPath = process.env.OTTHO_PIPELINE_CLAUDE_CONFIG || undefined;
        const app = await startApp({
          projectDir: opts.projectDir,
          pluginDir,
          distDir,
          port,
          claudeConfigPath,
          idleExitMs: opts.idleExitMs,
          onIdleExit: () => {
            log(`Ottho Builder 2 arrêté : aucun onglet ouvert depuis ${opts.idleExitMs / 60_000} min.`);
            process.exit(0);
          },
          sessions: opts.sessions,
          onSessionsEnd: () => {
            log("Ottho Builder 2 arrêté : Claude Code fermé sur ce projet.");
            process.exit(0);
          },
        });
        const url = `http://127.0.0.1:${app.port}`;
        if (!pluginDir) log("Plugin ottho-code-app introuvable : seuls les agents du projet sont affichés.");
        log(`Ottho Builder 2 prêt : ${url}`);
        if (opts.open) openBrowser(url);
        return app;
      } catch (err) {
        if (err.code === "EADDRINUSE") continue;
        throw err;
      }
    }
    if (existing.app === "ottho-pipeline" && existing.project === opts.projectDir) {
      const url = `http://127.0.0.1:${port}`;
      log(`Ottho Builder 2 déjà ouvert : ${url}`);
      if (opts.open) openBrowser(url);
      return null;
    }
  }
  throw new Error(`aucun port libre entre ${opts.port} et ${opts.port + 9}`);
}
