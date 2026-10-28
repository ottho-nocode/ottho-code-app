import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readBrief, savePreset } from "./brief.mjs";
import { main, ownPluginDir, resolveOptions } from "./cli.mjs";
import { tempDir } from "./tmpdirs.mjs";

// Dossier du Builder des tests (exemples de brief) : temporaire, jamais ~/.ottho-pipeline.
process.env.OTTHO_PIPELINE_HOME = await tempDir("op-home-");
// Commande du Builder telle que ses messages l'écrivent.
const CLI_COMMAND = `node ${JSON.stringify(fileURLToPath(new URL("../bin/cli.mjs", import.meta.url)))}`;

test("resolveOptions : valeurs par défaut", () => {
  assert.deepEqual(resolveOptions([], "/p"), { projectDir: "/p", pluginDir: undefined, port: 4317, open: true, reopen: false, idleExitMs: null });
});

test("resolveOptions : toutes les options", () => {
  assert.deepEqual(
    resolveOptions(["--project", "app", "--plugin", "/pl", "--port", "5000", "--no-open", "--reopen", "--idle-exit", "30"], "/p"),
    { projectDir: "/p/app", pluginDir: "/pl", port: 5000, open: false, reopen: true, idleExitMs: 1_800_000 },
  );
});

test("resolveOptions : --install n'existe plus (le Builder est inclus dans le plugin)", () => {
  assert.throws(() => resolveOptions(["--install"], "/p"), /--install/);
});

test("resolveOptions : port invalide → erreur explicite", () => {
  assert.throws(() => resolveOptions(["--port", "abc"], "/p"), /port/);
});

test("resolveOptions : --idle-exit invalide → erreur explicite", () => {
  for (const bad of ["0", "-5", "abc", ""]) assert.throws(() => resolveOptions(["--idle-exit", bad], "/p"), /idle-exit/, bad);
});

test("ownPluginDir : le plugin ottho-code-app qui contient le Builder, sinon null", async () => {
  const root = await tempDir("op-own-");
  const cliIn = (plugin) => pathToFileURL(join(plugin, "builder", "server", "cli.mjs")).href;
  const plugin = join(root, "ottho-code-app");
  await mkdir(join(plugin, ".claude-plugin"), { recursive: true });
  await writeFile(join(plugin, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "ottho-code-app" }));
  assert.equal(await ownPluginDir(cliIn(plugin)), plugin);
  // Autre plugin, manifeste illisible, ou Builder hors d'un plugin : null.
  const other = join(root, "autre");
  await mkdir(join(other, ".claude-plugin"), { recursive: true });
  await writeFile(join(other, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "autre" }));
  assert.equal(await ownPluginDir(cliIn(other)), null);
  await writeFile(join(other, ".claude-plugin", "plugin.json"), "{ illisible");
  assert.equal(await ownPluginDir(cliIn(other)), null);
  assert.equal(await ownPluginDir(cliIn(join(root, "copie-isolee"))), null);
});

test("main réutilise l'instance déjà ouverte sur le même projet", async (t) => {
  const dir = await tempDir("op-cli-");
  const logs = [];
  const args = ["--project", dir, "--plugin", dir, "--port", "4390", "--no-open"];
  const first = await main(args, { log: (m) => logs.push(m) });
  t.after(() => first.close());
  assert.match(logs.at(-1), /prêt : http:\/\/127\.0\.0\.1:4390/);
  // Plus rien d'enregistré pour le plugin : le Builder en fait partie.
  await assert.rejects(stat(join(process.env.OTTHO_PIPELINE_HOME, "engine.json")), { code: "ENOENT" });
  const second = await main(args, { log: (m) => logs.push(m) });
  assert.equal(second, null);
  assert.match(logs.at(-1), /déjà ouvert : http:\/\/127\.0\.0\.1:4390/);
});

test("--reopen : retrouve l'instance du projet sans rien lancer, sinon explique comment la lancer", async (t) => {
  const dir = await tempDir("op-cli-");
  const logs = [];
  const log = (m) => logs.push(m);
  await assert.rejects(main(["--project", dir, "--port", "4391", "--reopen", "--no-open"], { log }), (err) => {
    assert.equal(
      err.message,
      `Ottho Builder 2 ne tourne pas pour ce projet. Il démarre avec Claude Code dans un projet Ottho (le plugin ottho-code-app le lance) et la commande /pipeline le rouvre. À la main :\n  ${CLI_COMMAND} --project ${JSON.stringify(dir)}`,
    );
    assert.doesNotMatch(err.message, /npx|ottho-pipeline|[—–]/);
    return true;
  });
  const first = await main(["--project", dir, "--plugin", dir, "--port", "4391", "--no-open"], { log });
  t.after(() => first.close());
  assert.equal(await main(["--project", dir, "--port", "4391", "--reopen", "--no-open"], { log }), null);
  assert.match(logs.at(-1), /déjà ouvert : http:\/\/127\.0\.0\.1:4391/);
});

// Sous-commande brief : un dossier Builder vierge par test (exemples dans <home>/briefs).
async function freshHome(t) {
  const previous = process.env.OTTHO_PIPELINE_HOME;
  const home = await tempDir("op-home-");
  process.env.OTTHO_PIPELINE_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.OTTHO_PIPELINE_HOME;
    else process.env.OTTHO_PIPELINE_HOME = previous;
  });
  return home;
}

const fullBrief = (name) => ({
  name,
  domaine: { domaine: "Coiffure à domicile", legitimite: "Coiffeuse depuis 12 ans." },
  probleme: { description: "Les rendez-vous annulés au dernier moment.", vecu: "Oui, chaque semaine.", autres: "Inès, Paul" },
  cible: { marche: "Coiffeurs indépendants", pourcentage: "7 %", volume: "120 000", recherche: "Agendas papier, SMS" },
  persona: [{ identite: "Inès, 29 ans, coiffeuse, Nantes", objectifs: "Remplir son agenda", interviews: "5" }],
  solution: { modele: "Automatisation", action: "rappeler les rendez-vous", comment: "SMS la veille" },
  uvp: { phrase: "J'aide les coiffeurs à domicile à éviter les annulations grâce à des rappels SMS." },
});

const collector = () => {
  const logs = [];
  return { logs, log: (m) => logs.push(m) };
};

test("brief --list : aucun exemple, puis une ligne slug<TAB>nom par exemple", async (t) => {
  const home = await freshHome(t);
  const { logs, log } = collector();
  assert.equal(await main(["brief", "--list"], { log }), null);
  assert.deepEqual(logs, ["Aucun exemple de brief enregistré."]);
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  logs.length = 0;
  assert.equal(await main(["brief", "--list"], { log }), null);
  assert.deepEqual(logs, ["haircut\tHaircut"]);
});

test("brief --preset : écrit docs/brief.md depuis un exemple (slug ou nom, sans casse), complet ou non", async (t) => {
  const home = await freshHome(t);
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  await savePreset(join(home, "briefs"), "Brouillon", { name: "Brouillon", domaine: { domaine: "Santé" } });
  // Exemple déposé à la main, nom de fichier avec majuscules.
  await writeFile(join(home, "briefs", "Mon-Exemple.json"), JSON.stringify({ name: "Autre nom", brief: fullBrief("Mon exemple") }));
  for (const [nom, titre] of [["haircut", "Haircut"], ["Haircut", "Haircut"], ["mon-exemple", "Mon exemple"], ["MON-EXEMPLE", "Mon exemple"]]) {
    const dir = await tempDir("op-cli-brief-");
    const { logs, log } = collector();
    assert.equal(await main(["brief", "--project", dir, "--preset", nom], { log }), null);
    assert.equal((await readFile(join(dir, "docs/brief.md"), "utf8")).split("\n")[0], `# Brief projet : ${titre}`);
    assert.equal((await readBrief(dir)).complete, true);
    assert.deepEqual(logs, [`${join(dir, "docs/brief.md")} écrit (complet).`]);
  }
  const dir = await tempDir("op-cli-brief-");
  const { logs, log } = collector();
  await main(["brief", "--project", dir, "--preset", "brouillon"], { log });
  assert.equal((await readBrief(dir)).complete, false);
  assert.deepEqual(logs, [`${join(dir, "docs/brief.md")} écrit (incomplet : le problème, la cible quantifiable, la persona, la solution, la phrase de valeur (Steve Blank)).`]);
});

test("brief --json : fichier relatif au dossier courant, projet par défaut le dossier courant", async (t) => {
  await freshHome(t);
  const cwd = await tempDir("op-cli-brief-");
  await writeFile(join(cwd, "brief.json"), JSON.stringify({ ...fullBrief("Devis Facile"), name: "" }));
  const { logs, log } = collector();
  assert.equal(await main(["brief", "--json", "brief.json"], { cwd, log }), null);
  assert.match(await readFile(join(cwd, "docs/brief.md"), "utf8"), /^# Brief projet : \(sans nom\)\n/);
  assert.deepEqual(logs, [`${join(cwd, "docs/brief.md")} écrit (incomplet : le nom du projet).`]);
  await writeFile(join(cwd, "brief.json"), JSON.stringify(fullBrief("Devis Facile")));
  await mkdir(join(cwd, "app"));
  await main(["brief", "--project", "app", "--json", "brief.json"], { cwd, log });
  assert.equal((await readBrief(join(cwd, "app"))).data.name, "Devis Facile");
  assert.equal(logs.at(-1), `${join(cwd, "app/docs/brief.md")} écrit (complet).`);
  await assert.rejects(main(["brief", "--json", "absent.json"], { cwd, log }), { message: "impossible de lire absent.json (ENOENT)" });
});

test("brief : --project doit être un dossier existant, rien n'est créé sinon", async (t) => {
  const home = await freshHome(t);
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  const cwd = await tempDir("op-cli-brief-");
  await writeFile(join(cwd, "brief.json"), JSON.stringify(fullBrief("Devis Facile")));
  const { log } = collector();
  for (const args of [["--project", "absent", "--preset", "haircut"], ["--project", "absent/sous", "--json", "brief.json"]]) {
    await assert.rejects(main(["brief", ...args], { cwd, log }), { message: `dossier de projet introuvable : ${join(cwd, args[1])}` });
  }
  await assert.rejects(stat(join(cwd, "absent")), { code: "ENOENT" });
  await assert.rejects(main(["brief", "--project", "brief.json", "--preset", "haircut"], { cwd, log }), { message: `dossier de projet introuvable : ${join(cwd, "brief.json")}` });
  await assert.rejects(stat(join(cwd, "docs")), { code: "ENOENT" });
});

test("brief : exemple inconnu, JSON invalide, champ invalide, mode absent ou double → erreur claire", async (t) => {
  const home = await freshHome(t);
  const cwd = await tempDir("op-cli-brief-");
  const { log } = collector();
  await assert.rejects(main(["brief", "--preset", "nope"], { cwd, log }), { message: "exemple inconnu : nope. Aucun exemple enregistré." });
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  await savePreset(join(home, "briefs"), "Devis Facile", fullBrief("Devis Facile"));
  await assert.rejects(main(["brief", "--preset", "nope"], { cwd, log }), { message: "exemple inconnu : nope. Exemples : devis-facile, haircut" });
  await writeFile(join(cwd, "bad.json"), "{ pas du json");
  await assert.rejects(main(["brief", "--json", "bad.json"], { cwd, log }), { message: /^JSON invalide dans bad\.json : / });
  await writeFile(join(cwd, "bad.json"), JSON.stringify({ name: { objet: 1 } }));
  await assert.rejects(main(["brief", "--json", "bad.json"], { cwd, log }), (e) => e.status === undefined && e.message === "Champ invalide : name.");
  const usage = `usage : ${CLI_COMMAND} brief [--project <dossier>] --list | --preset <nom> | --json <fichier> | --save <nom>`;
  for (const args of [
    [], ["--project", cwd], ["--list", "--preset", "haircut"], ["--preset", "haircut", "--json", "bad.json"], ["--list", "--inconnu"], ["--list", "en-trop"],
    ["--save"], ["--save", "Haircut", "--list"], ["--save", "Haircut", "--preset", "haircut"], ["--save", "Haircut", "--json", "bad.json"],
  ]) {
    await assert.rejects(main(["brief", ...args], { cwd, log }), { message: usage }, args.join(" "));
  }
});

test("brief : un brief vide ne remplace jamais un brief rempli (fichier inchangé)", async (t) => {
  const home = await freshHome(t);
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  const cwd = await tempDir("op-cli-brief-");
  const { log } = collector();
  await main(["brief", "--preset", "haircut"], { cwd, log });
  const before = await readFile(join(cwd, "docs/brief.md"), "utf8");
  await writeFile(join(cwd, "vide.json"), "{}");
  await assert.rejects(main(["brief", "--json", "vide.json"], { cwd, log }), (e) => e.status === undefined && e.message === "Le brief enregistré est rempli : il n'est pas remplacé par un brief vide (docs/brief.md reste inchangé).");
  assert.equal(await readFile(join(cwd, "docs/brief.md"), "utf8"), before);
});

test("brief --save : le brief du projet devient un exemple de <home>/briefs, repris par --list et --preset", async (t) => {
  const home = await freshHome(t);
  const cwd = await tempDir("op-cli-brief-");
  await writeFile(join(cwd, "brief.json"), JSON.stringify(fullBrief("Devis Facile")));
  const { logs, log } = collector();
  await main(["brief", "--json", "brief.json"], { cwd, log });
  logs.length = 0;
  assert.equal(await main(["brief", "--save", "Devis Facile"], { cwd, log }), null);
  const file = join(home, "briefs", "devis-facile.json");
  assert.deepEqual(logs, [`Exemple « Devis Facile » enregistré (${file}).`]);
  assert.doesNotMatch(logs.join("\n"), /[—–]/);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.name, "Devis Facile");
  assert.deepEqual(saved.brief, (await readBrief(cwd)).data);
  logs.length = 0;
  await main(["brief", "--list"], { log });
  assert.deepEqual(logs, ["devis-facile\tDevis Facile"]);
  // Aller-retour : l'exemple reproduit le même brief dans un autre projet.
  const other = await tempDir("op-cli-brief-");
  await main(["brief", "--project", other, "--preset", "devis-facile"], { log });
  assert.deepEqual((await readBrief(other)).data, (await readBrief(cwd)).data);
  // Même nom, depuis --project : l'exemple est remplacé (signalé), pas dupliqué.
  await writeFile(join(other, "brief.json"), JSON.stringify({ ...fullBrief("Devis Facile"), uvp: { phrase: "Nouvelle phrase" } }));
  await main(["brief", "--project", other, "--json", join(other, "brief.json")], { log });
  logs.length = 0;
  await main(["brief", "--project", other, "--save", "  Devis Facile "], { cwd, log });
  assert.deepEqual(logs, [`Exemple « Devis Facile » enregistré (${file}). Il remplace l'exemple précédent du même nom.`]);
  assert.equal(JSON.parse(await readFile(file, "utf8")).brief.uvp.phrase, "Nouvelle phrase");
  logs.length = 0;
  await main(["brief", "--list"], { log });
  assert.deepEqual(logs, ["devis-facile\tDevis Facile"]);
});

test("brief --save : refusé sans brief, avec un brief vide ou écrit à la main, ou sans nom ; aucun exemple créé", async (t) => {
  const home = await freshHome(t);
  const cwd = await tempDir("op-cli-brief-");
  const { log } = collector();
  const brief = join(cwd, "docs/brief.md");
  await assert.rejects(main(["brief", "--save", "Haircut"], { cwd, log }), { message: `aucun brief à enregistrer : ${brief} est absent.` });
  // Brief vide (écrit depuis {}) : rien à enregistrer.
  await writeFile(join(cwd, "vide.json"), "{}");
  await main(["brief", "--json", "vide.json"], { cwd, log });
  const empty = { message: `aucun brief à enregistrer : ${brief} est vide (ou n'a pas les données du canevas).` };
  await assert.rejects(main(["brief", "--save", "Haircut"], { cwd, log }), empty);
  // Brief écrit à la main, sans les données du canevas.
  await writeFile(brief, `# Brief\n\n${"Un projet décrit à la main. ".repeat(20)}\n`);
  assert.equal((await readBrief(cwd)).exists, true);
  await assert.rejects(main(["brief", "--save", "Haircut"], { cwd, log }), empty);
  // Nom vide ou sans lettre ni chiffre.
  await writeFile(join(cwd, "brief.json"), JSON.stringify(fullBrief("Haircut")));
  await main(["brief", "--json", "brief.json"], { cwd, log });
  for (const name of ["", "   ", "???"]) {
    await assert.rejects(main(["brief", "--save", name], { cwd, log }), (e) => e.status === undefined && e.message === "Donne un nom à l'exemple (le nom du projet).", JSON.stringify(name));
  }
  // --project inexistant : même garde que les autres modes.
  await assert.rejects(main(["brief", "--project", "absent", "--save", "Haircut"], { cwd, log }), { message: `dossier de projet introuvable : ${join(cwd, "absent")}` });
  await assert.rejects(stat(join(home, "briefs")), { code: "ENOENT" });
});
