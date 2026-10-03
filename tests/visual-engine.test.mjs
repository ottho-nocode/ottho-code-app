import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { lutimes, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_FOUND, NOT_STARTED, PORTS, STARTING, STARTING_NO_OPEN, UNSAFE, engineOf, isOtthoProject, main, parsePorts, shellQuote } from "../scripts/visual-engine.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/visual-engine.mjs", import.meta.url));
const PLUGIN = dirname(dirname(SCRIPT));
// Les vrais Builders de l'utilisateur écoutent sur 4317 à 4326 : jamais sondés ici.
const assertTestPort = (port) => assert.ok(!PORTS.includes(port), `port réservé aux vrais Builders : ${port}`);

async function freePort() {
  const port = await new Promise((res, rej) => {
    const s = createNetServer().on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port: p } = s.address();
      s.close(() => res(p));
    });
  });
  assertTestPort(port);
  return port;
}

// Faux Builder dans ce processus : répond au health pour project (port 0 : port libre au hasard).
async function fakeBuilder(project, wanted = 0) {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, app: "ottho-pipeline", project }));
  });
  await new Promise((r) => server.listen(wanted, "127.0.0.1", r));
  const { port } = server.address();
  assertTestPort(port);
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((r) => server.close(r));
    },
  };
}

// Fausse CLI du Builder : ajoute une ligne par lancement (arguments, pid, dossier), écoute sur
// FAKE_PORT et répond au health pour son --project. FAKE_MODE=crash : s'arrête aussitôt en
// erreur ; FAKE_MODE=silent : reste en vie sans jamais répondre.
const FAKE_CLI = `import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv, pid: process.pid, cwd: process.cwd() }) + "\\n");
console.log("faux Builder");
setTimeout(() => process.exit(0), 20000); // filet : jamais de processus orphelin durable
if (process.env.FAKE_MODE === "crash") {
  console.error("faux Builder : échec");
  process.exit(1);
}
if (process.env.FAKE_MODE === "silent") await new Promise(() => {});
const project = argv[argv.indexOf("--project") + 1];
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, app: "ottho-pipeline", project }));
}).listen(Number(process.env.FAKE_PORT), "127.0.0.1");
`;

// Projet temporaire (files : chemin → contenu, null pour un dossier), faux home, fausse CLI.
// name : nom du dossier du projet.
async function setup(t, { files = {}, mode, name = "projet" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "visual-engine-"));
  const dir = join(root, name);
  await mkdir(dir);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    await mkdir(content === null ? path : dirname(path), { recursive: true });
    if (content !== null) await writeFile(path, content);
  }
  const home = join(root, "home");
  await mkdir(home);
  const cli = join(root, "fake-cli.mjs");
  await writeFile(cli, FAKE_CLI);
  const record = join(root, "record.json");
  const port = await freePort();
  const env = { HOME: root, OTTHO_PIPELINE_HOME: home, OTTHO_PIPELINE_CLI: cli, CLAUDE_PROJECT_DIR: dir, FAKE_RECORD: record, FAKE_PORT: String(port) };
  if (mode) env.FAKE_MODE = mode;
  t.after(async () => {
    for (const { pid } of launches({ record })) {
      try {
        process.kill(pid);
      } catch {
        // déjà arrêtée
      }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  return { root, dir, home, cli, record, port, env };
}

const sessionStart = (cwd, source = "startup") => JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart", source, cwd });
// Lancements de la fausse CLI (une ligne chacun) ; le premier.
const launches = (ctx) => (existsSync(ctx.record) ? readFileSync(ctx.record, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const recorded = (ctx) => {
  const all = launches(ctx);
  assert.equal(all.length, 1, `lancements de la fausse CLI : ${all.length}`);
  return all[0];
};
const lockOf = (ctx) => join(ctx.dir, ".claude", "ottho-builder.lock");

// Arguments d'une commande telle que le shell les lit (le programme remplacé par printf).
const shellArgs = (command) => execFileSync("/bin/sh", ["-c", `printf '%s\\n' ${command.slice(command.indexOf(" ") + 1)}`], { encoding: "utf8" }).replace(/\n$/, "").split("\n");

// Le script lancé comme par Claude Code : stdin, stdout, stderr, code de sortie.
function runScript(args, { input = "", env, cwd }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { env, cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => done({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("Builder déjà lancé pour le projet : adresse et contexte, rien n'est lancé", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  // CLAUDE_PROJECT_DIR prime sur le cwd du message ; le premier port ne répond pas.
  const out = JSON.parse(await main({ stdin: sessionStart("/ailleurs"), env: ctx.env, ports: [ctx.port, builder.port] }));
  assert.equal(out.systemMessage, `Ottho Builder 2 : ${builder.url}`);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /en lecture seule/);
  assert.match(context, /questions des agents et les validations se font dans ce terminal/);
  assert.ok(context.includes(builder.url));
  assert.ok(context.includes(`'${process.execPath}' '${ctx.cli}' brief --project '${ctx.dir}'`));
  assert.match(context, /--json <fichier> ; format et questions : skill project-bootstrap, étape 0\./);
  assert.ok(context.includes(`node '${join(PLUGIN, "scripts", "visual-engine.mjs")}' --open --project '${ctx.dir}'`));
  assert.ok(!existsSync(ctx.record), "la fausse CLI n'a pas été lancée");
  assert.ok(!existsSync(join(ctx.dir, ".claude")));
});

test("script lancé par Claude Code : Builder retrouvé par le cwd du message, JSON sur stdout, code 0", async (t) => {
  const ctx = await setup(t, { files: { "notes.txt": "pas un projet Ottho" } });
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  const { CLAUDE_PROJECT_DIR, ...env } = ctx.env;
  const res = await runScript(["--ports", String(builder.port)], { input: sessionStart(ctx.dir), env, cwd: ctx.root });
  assert.equal(res.code, 0);
  assert.equal(res.stderr, "");
  const out = JSON.parse(res.stdout);
  assert.equal(out.systemMessage, `Ottho Builder 2 : ${builder.url}`);
  assert.match(out.hookSpecificOutput.additionalContext, /--open --project/);
  assert.ok(!existsSync(ctx.record));
});

test("Builder absent, projet Ottho : la CLI est lancée détachée, journal dans .claude/ottho-builder.log", async (t) => {
  const ctx = await setup(t, { files: { "docs/PRD.md": "# PRD" } });
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }));
  const url = `http://127.0.0.1:${ctx.port}`;
  assert.equal(out.systemMessage, `Ottho Builder 2 : ${url}`);
  assert.ok(out.hookSpecificOutput.additionalContext.includes(url));
  const { argv, cwd } = recorded(ctx);
  assert.deepEqual(argv, ["--project", ctx.dir, "--plugin", PLUGIN, "--idle-exit", "30"]);
  assert.equal(cwd, realpathSync(ctx.dir));
  assert.match(readFileSync(join(ctx.dir, ".claude", "ottho-builder.log"), "utf8"), /faux Builder/);
  assert.ok(!existsSync(lockOf(ctx)), "verrou retiré une fois le Builder prêt");
});

test("dossier qui n'est pas un projet Ottho : rien n'est lancé ni affiché (un Builder d'un autre projet est ignoré)", async (t) => {
  const ctx = await setup(t, { files: { "notes.txt": "x", "src/index.js": "" } });
  const other = await fakeBuilder(join(ctx.root, "autre-projet"));
  t.after(other.close);
  assert.equal(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [other.port, ctx.port] }), "");
  assert.ok(!existsSync(ctx.record));
  assert.ok(!existsSync(join(ctx.dir, ".claude")));
});

test("dossier neuf (fichiers cachés seulement) : lancé ; engine.json au node disparu, « / » final, CLAUDE_PLUGIN_ROOT", async (t) => {
  const ctx = await setup(t, { files: { ".DS_Store": "", ".git/HEAD": "ref: refs/heads/main" } });
  const { OTTHO_PIPELINE_CLI, ...env } = ctx.env;
  await writeFile(join(ctx.home, "engine.json"), JSON.stringify({ node: join(ctx.root, "node-disparu"), cli: ctx.cli }));
  const plugin = join(ctx.root, "plugins", "ottho-code-app");
  const out = JSON.parse(await main({ stdin: "", env: { ...env, CLAUDE_PROJECT_DIR: `${ctx.dir}/`, CLAUDE_PLUGIN_ROOT: plugin }, ports: [ctx.port] }));
  assert.equal(out.systemMessage, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}`);
  assert.deepEqual(recorded(ctx).argv, ["--project", ctx.dir, "--plugin", plugin, "--idle-exit", "30"]);
  const context = out.hookSpecificOutput.additionalContext;
  assert.ok(context.includes(`'${process.execPath}' '${ctx.cli}' brief --project '${ctx.dir}'`), "node du hook à la place du node disparu");
  assert.ok(context.includes(`node '${join(plugin, "scripts", "visual-engine.mjs")}' --open`));
});

test("Builder introuvable (ni OTTHO_PIPELINE_CLI ni engine.json) : message d'enregistrement (--install), code 0", async (t) => {
  const ctx = await setup(t, { files: { "specs/US-01-inscription.md": "# US-01" } });
  const res = await runScript(["--ports", String(ctx.port)], { input: sessionStart(ctx.dir), env: { HOME: ctx.root, OTTHO_PIPELINE_HOME: ctx.home }, cwd: ctx.root });
  assert.equal(res.code, 0);
  assert.equal(res.stderr, "");
  assert.deepEqual(JSON.parse(res.stdout), { systemMessage: NOT_FOUND });
  assert.ok(!existsSync(join(ctx.dir, ".claude")));
  // engine.json qui désigne une CLI disparue : introuvable aussi.
  await writeFile(join(ctx.home, "engine.json"), JSON.stringify({ node: process.execPath, cli: join(ctx.root, "disparu.mjs") }));
  assert.equal(engineOf({ OTTHO_PIPELINE_HOME: ctx.home }), null);
  await writeFile(join(ctx.home, "engine.json"), "{ illisible");
  assert.equal(engineOf({ OTTHO_PIPELINE_HOME: ctx.home }), null);
});

test("message de hook invalide ou vide : code 0, rien sur stdout ni stderr", async (t) => {
  const ctx = await setup(t, { files: { "notes.txt": "x" } });
  const env = { HOME: ctx.root, OTTHO_PIPELINE_HOME: ctx.home, OTTHO_PIPELINE_CLI: ctx.cli, FAKE_RECORD: ctx.record, FAKE_PORT: String(ctx.port) };
  for (const input of ["pas du json {", "", "null", "[1,2]"]) {
    const res = await runScript(["--ports", String(ctx.port)], { input, env, cwd: ctx.dir });
    assert.deepEqual(res, { code: 0, stdout: "", stderr: "" }, `entrée : ${JSON.stringify(input)}`);
  }
  assert.ok(!existsSync(ctx.record));
});

test("--open, Builder déjà lancé : navigateur ouvert sur son adresse, une ligne de texte (sans garde du dossier)", async (t) => {
  const ctx = await setup(t, { files: { "notes.txt": "x" } });
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  const opened = [];
  const out = await main({ argv: ["--open", "--project", ctx.dir], env: { ...ctx.env, CLAUDE_PROJECT_DIR: "/ailleurs" }, ports: [builder.port], open: (u) => opened.push(u) });
  assert.equal(out, `Ottho Builder 2 : ${builder.url}\n`);
  assert.deepEqual(opened, [builder.url]);
  assert.ok(!existsSync(ctx.record));
});

test("--open, Builder absent hors projet Ottho : lancé quand même, il ouvre lui-même le navigateur", async (t) => {
  const ctx = await setup(t, { files: { "notes.txt": "x" } });
  const opened = [];
  const out = await main({ argv: ["--open"], env: ctx.env, ports: [ctx.port], open: (u) => opened.push(u) });
  assert.equal(out, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}\n`);
  assert.deepEqual(opened, []);
  assert.equal(recorded(ctx).argv[1], ctx.dir);
  // Introuvable : la ligne d'enregistrement (--install).
  assert.equal(await main({ argv: ["--open", "--project", ctx.dir], env: { HOME: ctx.root, OTTHO_PIPELINE_HOME: ctx.home }, ports: [await freePort()], open: (u) => opened.push(u) }), `${NOT_FOUND}\n`);
});

test("deux hooks simultanés du même projet : un seul lancement, la même adresse pour les deux", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  const run = () => main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] });
  const [a, b] = (await Promise.all([run(), run()])).map((out) => JSON.parse(out));
  const url = `http://127.0.0.1:${ctx.port}`;
  assert.equal(a.systemMessage, `Ottho Builder 2 : ${url}`);
  assert.equal(b.systemMessage, `Ottho Builder 2 : ${url}`);
  recorded(ctx); // un seul lancement
  assert.ok(!existsSync(lockOf(ctx)));
});

test("verrou récent d'un autre hook : pas de lancement, attend le Builder qui arrive", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  await mkdir(join(ctx.dir, ".claude"), { recursive: true });
  await writeFile(lockOf(ctx), "");
  let builder;
  const late = new Promise((r) => setTimeout(r, 500)).then(async () => (builder = await fakeBuilder(ctx.dir, ctx.port)));
  t.after(async () => {
    await late;
    await builder?.close();
  });
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }));
  assert.equal(out.systemMessage, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}`);
  assert.deepEqual(launches(ctx), []);
  assert.ok(existsSync(lockOf(ctx)), "le verrou de l'autre hook n'est pas touché");
});

test("verrou ancien (hook interrompu) : repris, le Builder est lancé, verrou retiré", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  await mkdir(join(ctx.dir, ".claude"), { recursive: true });
  await writeFile(lockOf(ctx), "");
  const old = new Date(Date.now() - 60_000);
  await utimes(lockOf(ctx), old, old);
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }));
  assert.equal(out.systemMessage, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}`);
  recorded(ctx);
  assert.ok(!existsSync(lockOf(ctx)));
});

test("trois hooks simultanés (processus distincts) et un verrou ancien : un seul lancement, aucun verrou laissé", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  await mkdir(join(ctx.dir, ".claude"), { recursive: true });
  await writeFile(lockOf(ctx), "");
  const old = new Date(Date.now() - 60_000);
  await utimes(lockOf(ctx), old, old);
  const hook = () => runScript(["--ports", String(ctx.port)], { input: sessionStart(ctx.dir), env: ctx.env, cwd: ctx.dir });
  const results = await Promise.all([hook(), hook(), hook()]);
  const url = `http://127.0.0.1:${ctx.port}`;
  for (const res of results) {
    assert.equal(res.code, 0);
    assert.equal(res.stderr, "");
    assert.equal(JSON.parse(res.stdout).systemMessage, `Ottho Builder 2 : ${url}`);
  }
  recorded(ctx); // un seul lancement
  // Ni verrou, ni copie renommée (ottho-builder.lock.<pid>.<hex>) laissés derrière.
  assert.deepEqual((await readdir(join(ctx.dir, ".claude"))).filter((f) => f.startsWith("ottho-builder.lock")), []);
});

test("source compact ou clear : lancé avec --no-open ; startup et resume ouvrent le navigateur", async (t) => {
  for (const [source, noOpen] of [["compact", true], ["clear", true], ["resume", false], [undefined, false]]) {
    const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
    const stdin = JSON.stringify({ hook_event_name: "SessionStart", cwd: ctx.dir, ...(source ? { source } : {}) });
    const out = JSON.parse(await main({ stdin, env: ctx.env, ports: [ctx.port] }));
    assert.equal(out.systemMessage, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}`);
    assert.equal(recorded(ctx).argv.includes("--no-open"), noOpen, `source ${source}`);
  }
});

test("Builder lancé qui ne répond pas dans le délai : « démarre encore » (variante sans navigateur sur compact)", async (t) => {
  for (const [source, message] of [["startup", STARTING], ["compact", STARTING_NO_OPEN]]) {
    const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" }, mode: "silent" });
    const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir, source), env: ctx.env, ports: [ctx.port], waitMs: 800 }));
    assert.deepEqual(out, { systemMessage: message });
    assert.ok(existsSync(lockOf(ctx)), "verrou gardé tant que le Builder démarre (il expire au bout de 15 s)");
  }
});

test("Builder lancé qui s'arrête aussitôt : message « n'a pas démarré », sans attendre tout le délai", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" }, mode: "crash" });
  const started = Date.now();
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 6000 }));
  assert.deepEqual(out, { systemMessage: NOT_STARTED });
  assert.ok(Date.now() - started < 4000, `attente trop longue : ${Date.now() - started} ms`);
  assert.match(readFileSync(join(ctx.dir, ".claude", "ottho-builder.log"), "utf8"), /faux Builder : échec/);
  assert.ok(!existsSync(lockOf(ctx)), "verrou retiré : le processus s'est arrêté");
});

test("chemins avec espace, apostrophe, guillemet et $ : commandes du contexte valides pour le shell", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" }, name: `projet d'Ottho "v2" $HOME \`x\`` });
  const plugin = join(ctx.root, "plug'in $PATH");
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: { ...ctx.env, CLAUDE_PLUGIN_ROOT: plugin }, ports: [builder.port] }));
  assert.equal(out.systemMessage, `Ottho Builder 2 : ${builder.url}`);
  const lines = out.hookSpecificOutput.additionalContext.split("\n");
  const brief = lines.find((l) => l.startsWith("Pour écrire le brief")).replace(/^[^:]*: /, "").replace(/ suivi d'une seule option.*$/, "");
  assert.deepEqual(shellArgs(`x ${brief}`), [process.execPath, ctx.cli, "brief", "--project", ctx.dir]);
  const reopen = lines.find((l) => l.startsWith("Pour rouvrir")).replace(/^.*premier plan : /, "");
  assert.deepEqual(shellArgs(reopen), [join(plugin, "scripts", "visual-engine.mjs"), "--open", "--project", ctx.dir]);
  assert.equal(shellQuote("l'a"), `'l'\\''a'`);
});

test("--open sur un dossier de projet introuvable : une ligne d'erreur, code 0, rien de créé ni lancé", async (t) => {
  const ctx = await setup(t);
  const missing = join(ctx.root, "faute-de-frappe");
  const res = await runScript(["--open", "--project", missing, "--ports", String(ctx.port)], { env: ctx.env, cwd: ctx.root });
  assert.deepEqual(res, { code: 0, stdout: `Ottho Builder 2 : dossier de projet introuvable : ${missing}\n`, stderr: "" });
  assert.ok(!existsSync(missing));
  assert.deepEqual(launches(ctx), []);
  // En hook : silencieux.
  assert.equal(await main({ stdin: sessionStart(missing), env: { ...ctx.env, CLAUDE_PROJECT_DIR: missing }, ports: [ctx.port] }), "");
  assert.ok(!existsSync(missing));
});

test("engineOf : engine.json lu dans le HOME de l'environnement donné si OTTHO_PIPELINE_HOME est absent", async (t) => {
  const ctx = await setup(t);
  await mkdir(join(ctx.root, ".ottho-pipeline"));
  await writeFile(join(ctx.root, ".ottho-pipeline", "engine.json"), JSON.stringify({ node: process.execPath, cli: ctx.cli }));
  assert.deepEqual(engineOf({ HOME: ctx.root }), { node: process.execPath, cli: ctx.cli });
  assert.equal(engineOf({ HOME: ctx.home }), null);
});

test("isOtthoProject : marqueurs du pipeline, spec US ou dossier neuf ; jamais le journal du plugin seul ni le dossier personnel", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "visual-engine-markers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const make = async (name, files) => {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(content === null ? join(dir, rel) : dirname(join(dir, rel)), { recursive: true });
      if (content !== null) await writeFile(join(dir, rel), content);
    }
    return dir;
  };
  const env = { HOME: join(root, "home") };
  const is = (dir) => isOtthoProject(dir, env);
  for (const marker of ["docs/brief.md", "docs/PRD.md", "design/charte.md", "specs/US-01-inscription.md", "specs/us-12.md"]) {
    assert.ok(is(await make(marker.replace(/\W/g, "_"), { [marker]: "", "package.json": "{}" })), marker);
  }
  // Journal des hooks : écrit dans tout dossier où le plugin est actif, ce n'est pas un marqueur.
  assert.ok(!is(await make("journal-seul", { ".claude/pipeline-events.jsonl": "", "package.json": "{}" })));
  assert.ok(!is(await make("specs-vide", { specs: null, "package.json": "{}" })));
  assert.ok(!is(await make("specs-autres", { "specs/notes.md": "", "specs/US-01": null, "package.json": "{}" })));
  assert.ok(!is(await make("specs-fichier", { specs: "" })));
  assert.ok(!is(await make("marqueur-dossier", { "docs/brief.md": null, "package.json": "{}" })));
  // Dossier neuf : rien d'autre que .git, .DS_Store, .claude et .ottho-brief.json.
  assert.ok(is(await make("vide", {})));
  assert.ok(is(await make("neuf", { ".git/HEAD": "", ".DS_Store": "", ".claude/pipeline-events.jsonl": "", ".ottho-brief.json": "{}" })));
  assert.ok(!is(await make("caches", { ".claude/settings.json": "{}", ".env": "" })));
  assert.ok(!is(await make("gitignore", { ".gitignore": "node_modules" })));
  assert.ok(!is(await make("autre", { "README.md": "# autre", docs: null })));
  assert.ok(!is(join(root, "inexistant")));
  // Dossier personnel (HOME de l'environnement, liens résolus) : jamais, même presque vide ou marqué.
  const home = await make("home", { ".DS_Store": "", ".claude/pipeline-events.jsonl": "" });
  assert.ok(!is(home));
  assert.ok(!is(`${home}/`));
  await symlink(home, join(root, "lien-home"));
  assert.ok(!is(join(root, "lien-home")));
  await writeFile(join(home, ".ottho-brief.json"), "{}");
  await mkdir(join(home, "docs"));
  await writeFile(join(home, "docs", "brief.md"), "# Brief");
  assert.ok(!is(home));
  assert.ok(isOtthoProject(home, { HOME: join(root, "vide") }), "le même dossier, hors HOME, est un projet");
});

test("dossier personnel : jamais lancé au démarrage, même presque vide ; --open le lance quand même", async (t) => {
  const ctx = await setup(t, { files: { ".DS_Store": "", ".claude/pipeline-events.jsonl": "" } });
  const env = { ...ctx.env, HOME: ctx.dir };
  assert.equal(await main({ stdin: sessionStart(ctx.dir), env, ports: [ctx.port] }), "");
  assert.deepEqual(launches(ctx), []);
  assert.deepEqual(await readdir(join(ctx.dir, ".claude")), ["pipeline-events.jsonl"], "rien d'écrit dans .claude");
  // Hors du dossier personnel, ce même dossier (rien que des entrées cachées admises) est neuf : lancé.
  const out = await main({ argv: ["--open", "--project", ctx.dir], env, ports: [ctx.port], open: () => {} });
  assert.equal(out, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}\n`);
  assert.equal(recorded(ctx).argv[1], ctx.dir);
});

test("projet quelconque où le plugin a déjà journalisé (.claude/pipeline-events.jsonl) : rien n'est lancé", async (t) => {
  const ctx = await setup(t, { files: { ".claude/pipeline-events.jsonl": "{}\n", "package.json": "{}", "src/index.js": "" } });
  assert.equal(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }), "");
  assert.deepEqual(launches(ctx), []);
  assert.ok(!existsSync(lockOf(ctx)));
});

// Fichier hors du projet qu'un lien symbolique piégé (dépôt cloné) voudrait faire écraser.
async function victim(ctx, name = "victime.txt") {
  const path = join(ctx.root, name);
  await writeFile(path, "contenu intact\n");
  return path;
}

test("journal en lien symbolique : refusé, fichier visé intact, rien de lancé ni de verrou laissé", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  const target = await victim(ctx);
  await mkdir(join(ctx.dir, ".claude"));
  await symlink(target, join(ctx.dir, ".claude", "ottho-builder.log"));
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 500 }));
  assert.deepEqual(out, { systemMessage: UNSAFE });
  assert.equal(readFileSync(target, "utf8"), "contenu intact\n");
  assert.ok(lstatSync(join(ctx.dir, ".claude", "ottho-builder.log")).isSymbolicLink(), "le lien n'est pas remplacé");
  assert.deepEqual(launches(ctx), []);
  assert.ok(!existsSync(lockOf(ctx)), "verrou rendu");
  // Lien cassé (cible absente) : refusé aussi, la cible n'est pas créée.
  const missing = join(ctx.root, "absent.txt");
  await rm(join(ctx.dir, ".claude", "ottho-builder.log"));
  await symlink(missing, join(ctx.dir, ".claude", "ottho-builder.log"));
  assert.deepEqual(JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 500 })), { systemMessage: UNSAFE });
  assert.ok(!existsSync(missing));
  assert.deepEqual(launches(ctx), []);
});

test("dossier .claude en lien symbolique : refusé, rien n'est écrit là où il pointe (--open compris)", async (t) => {
  const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
  const elsewhere = join(ctx.root, "ailleurs");
  await mkdir(elsewhere);
  await symlink(elsewhere, join(ctx.dir, ".claude"));
  assert.deepEqual(JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 500 })), { systemMessage: UNSAFE });
  assert.equal(await main({ argv: ["--open", "--project", ctx.dir], env: ctx.env, ports: [ctx.port], waitMs: 500, open: () => {} }), `${UNSAFE}\n`);
  assert.deepEqual(await readdir(elsewhere), []);
  assert.deepEqual(launches(ctx), []);
});

test("verrous anciens en liens symboliques (vers un fichier, ou cassé) : liens retirés sans toucher leur cible, un seul lancement", async (t) => {
  for (const dangling of [false, true]) {
    const ctx = await setup(t, { files: { "docs/brief.md": "# Brief" } });
    const target = await victim(ctx);
    const missing = join(ctx.root, "absent.txt");
    const old = new Date(Date.now() - 60_000);
    await utimes(target, old, old);
    await mkdir(join(ctx.dir, ".claude"));
    // Le verrou vise la victime ou rien ; le verrou de reprise vise la victime.
    await symlink(dangling ? missing : target, lockOf(ctx));
    await symlink(target, `${lockOf(ctx)}.break`);
    await lutimes(lockOf(ctx), old, old);
    await lutimes(`${lockOf(ctx)}.break`, old, old);
    const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 2000 }));
    assert.equal(out.systemMessage, `Ottho Builder 2 : http://127.0.0.1:${ctx.port}`, `lien cassé : ${dangling}`);
    recorded(ctx);
    assert.equal(readFileSync(target, "utf8"), "contenu intact\n");
    assert.ok(!existsSync(missing));
    assert.deepEqual((await readdir(join(ctx.dir, ".claude"))).filter((f) => f.startsWith("ottho-builder.lock")), []);
  }
});

test("parsePorts : plages et listes ; illisible → null", () => {
  assert.deepEqual(parsePorts("4600-4602"), [4600, 4601, 4602]);
  assert.deepEqual(parsePorts("5000,5002"), [5000, 5002]);
  assert.equal(parsePorts("abc"), null);
  assert.equal(parsePorts("10-5"), null);
  assert.equal(parsePorts("1-70000"), null);
});
