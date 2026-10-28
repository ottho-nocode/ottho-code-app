import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readBrief, savePreset } from "./brief.mjs";
import { main, probe, resolveOptions, writeEngineFile } from "./cli.mjs";
import { tempDir } from "./tmpdirs.mjs";

// engine.json des lancements de test : dans un dossier temporaire, jamais dans ~/.ottho-pipeline.
process.env.OTTHO_PIPELINE_HOME = await tempDir("op-home-");

test("resolveOptions : valeurs par défaut", () => {
  assert.deepEqual(resolveOptions([], "/p"), { projectDir: "/p", pluginDir: undefined, port: 4317, open: true, reopen: false, install: false, idleExitMs: null });
});

test("resolveOptions : toutes les options", () => {
  assert.deepEqual(
    resolveOptions(["--project", "app", "--plugin", "/pl", "--port", "5000", "--no-open", "--install", "--idle-exit", "30"], "/p"),
    { projectDir: "/p/app", pluginDir: "/pl", port: 5000, open: false, reopen: false, install: true, idleExitMs: 1_800_000 },
  );
});

test("resolveOptions : port invalide → erreur explicite", () => {
  assert.throws(() => resolveOptions(["--port", "abc"], "/p"), /port/);
});

test("resolveOptions : --idle-exit invalide → erreur explicite", () => {
  for (const bad of ["0", "-5", "abc", ""]) assert.throws(() => resolveOptions(["--idle-exit", bad], "/p"), /idle-exit/, bad);
});

test("writeEngineFile : node et CLI dans engine.json, dossier créé au besoin", async () => {
  const home = join(await tempDir("op-engine-"), "absent", ".ottho-pipeline");
  await writeEngineFile({ home, node: "/usr/bin/node", cli: "/x/bin/cli.mjs" });
  assert.deepEqual(JSON.parse(await readFile(join(home, "engine.json"), "utf8")), { node: "/usr/bin/node", cli: "/x/bin/cli.mjs" });
});

test("main réutilise l'instance déjà ouverte sur le même projet", async (t) => {
  const dir = await tempDir("op-cli-");
  const logs = [];
  const args = ["--project", dir, "--plugin", dir, "--port", "4390", "--no-open"];
  const first = await main(args, { log: (m) => logs.push(m) });
  t.after(() => first.close());
  assert.match(logs.at(-1), /prêt : http:\/\/127\.0\.0\.1:4390/);
  // Le lancement indique au hook du plugin comment relancer le Builder.
  const engine = JSON.parse(await readFile(join(process.env.OTTHO_PIPELINE_HOME, "engine.json"), "utf8"));
  assert.equal(engine.node, process.execPath);
  assert.match(engine.cli, /\/bin\/cli\.mjs$/);
  const second = await main(args, { log: (m) => logs.push(m) });
  assert.equal(second, null);
  assert.match(logs.at(-1), /déjà ouvert : http:\/\/127\.0\.0\.1:4390/);
});

test("--reopen : retrouve l'instance du projet sans rien lancer, sinon explique comment la lancer", async (t) => {
  const dir = await tempDir("op-cli-");
  const logs = [];
  const log = (m) => logs.push(m);
  await assert.rejects(main(["--project", dir, "--port", "4391", "--reopen", "--no-open"], { log }), /npx ottho-pipeline/);
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

// HOME temporaire : --install n'y regarde que les anciennes apps du Dock, jamais dans le vrai ~/Applications.
async function fakeUserHome(t) {
  const previous = process.env.HOME;
  const home = await tempDir("op-user-");
  process.env.HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  });
  assert.equal(homedir(), home);
  return home;
}

test("--install : enregistre le Builder dans engine.json (pour le hook du plugin), deux lignes, aucun serveur lancé", async (t) => {
  const home = await freshHome(t);
  await fakeUserHome(t);
  const { logs, log } = collector();
  assert.equal(await main(["--install", "--port", "4393", "--no-open"], { cwd: "/p", log }), null);
  const engine = JSON.parse(await readFile(join(home, "engine.json"), "utf8"));
  assert.equal(engine.node, process.execPath);
  assert.match(engine.cli, /\/bin\/cli\.mjs$/);
  assert.deepEqual(logs, [
    `Ottho Builder 2 enregistré : ${join(home, "engine.json")}.`,
    "Le plugin ottho-code-app l'ouvrira au démarrage de Claude Code dans un projet Ottho (ou /pipeline pour le rouvrir).",
  ]);
  assert.doesNotMatch(logs.join("\n"), /[—–]|Dock|Applications/);
  assert.equal(await probe(4393), "free");
  // --plugin, accepté par les anciennes installations, ne change rien.
  logs.length = 0;
  assert.equal(await main(["--install", "--plugin", "pl"], { cwd: "/p", log }), null);
  assert.equal(logs.length, 2);
});

test("--install : signale une ancienne app du Dock sans la supprimer", async (t) => {
  const home = await freshHome(t);
  const user = await fakeUserHome(t);
  const apps = join(user, "Applications");
  await mkdir(join(apps, "Ottho Builder 2.app", "Contents"), { recursive: true });
  const { logs, log } = collector();
  assert.equal(await main(["--install"], { cwd: "/p", log }), null);
  assert.equal(logs[0], `Ottho Builder 2 enregistré : ${join(home, "engine.json")}.`);
  const hint = (name) => `Ancienne app du Dock trouvée : ${join(apps, name)}. Elle ne sert plus, tu peux la supprimer.`;
  assert.deepEqual(logs.slice(2), [hint("Ottho Builder 2.app")]);
  assert.ok((await stat(join(apps, "Ottho Builder 2.app"))).isDirectory());
  // Nom des premières versions aussi.
  await mkdir(join(apps, "ottho-pipeline.app"));
  logs.length = 0;
  await main(["--install"], { cwd: "/p", log });
  assert.deepEqual(logs.slice(2), [hint("Ottho Builder 2.app"), hint("ottho-pipeline.app")]);
  assert.ok((await stat(join(apps, "ottho-pipeline.app"))).isDirectory());
  assert.doesNotMatch(logs.join("\n"), /[—–]/);
});

test("brief --list : aucun exemple, puis une ligne slug<TAB>nom par exemple", async (t) => {
  const home = await freshHome(t);
  const { logs, log } = collector();
  assert.equal(await main(["brief", "--list"], { log }), null);
  assert.deepEqual(logs, ["Aucun exemple de brief enregistré."]);
  await savePreset(join(home, "briefs"), "Haircut", fullBrief("Haircut"));
  logs.length = 0;
  assert.equal(await main(["brief", "--list"], { log }), null);
  assert.deepEqual(logs, ["haircut\tHaircut"]);
  // Rien n'est lancé : pas d'engine.json.
  await assert.rejects(stat(join(home, "engine.json")), { code: "ENOENT" });
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
  await assert.rejects(stat(join(home, "engine.json")), { code: "ENOENT" });
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
  const usage = /^usage : ottho-pipeline brief \[--project <dossier>\] --list \| --preset <nom> \| --json <fichier> \| --save <nom>$/;
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
  // Rien n'est lancé : pas d'engine.json.
  await assert.rejects(stat(join(home, "engine.json")), { code: "ENOENT" });
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
