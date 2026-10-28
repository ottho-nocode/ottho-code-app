import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BLOCKS, BRIEF_FILE, emptyBrief, isComplete, listPresets, missingBlocks, readBrief, renderBrief, savePreset, wordCount, writeBrief } from "./brief.mjs";
import { tempDir } from "./tmpdirs.mjs";

const full = () => ({
  name: "Devis Facile",
  domaine: { domaine: "Freelances du graphisme", legitimite: "Graphiste depuis 10 ans, je connais 200 freelances." },
  probleme: { description: "Les devis ne sont pas relancés.\nDes contrats sont perdus.", vecu: "Oui, chaque mois.", autres: "Léa, Karim, Sophie" },
  cible: { marche: "Freelances créatifs en France", pourcentage: "8 %", volume: "150 000", recherche: "Tableurs, rappels dans l'agenda" },
  persona: [{ identite: "Léa, 32 ans, graphiste, Lyon", contexte: "Seule, 15 clients", objectifs: "Signer plus", freins: "Pas le temps", techno: "Mac, Notion", interviews: "6" }],
  solution: { modele: "Automatisation", action: "relancer les devis", comment: "e-mails programmés" },
  uvp: { phrase: "J'aide les freelances créatifs à ne plus perdre de devis grâce à des relances automatiques." },
});

test("canevas : les six blocs du module « De l'idée au projet validé », dans l'ordre", () => {
  assert.deepEqual(BLOCKS.map((b) => b.key), ["domaine", "probleme", "cible", "persona", "solution", "uvp"]);
  assert.deepEqual(BLOCKS.find((b) => b.key === "probleme").fields.map((f) => f.label), ["Le problème", "L'as-tu vécu toi-même ?", "Qui d'autre le vit (nommé) ?"]);
  assert.equal(BLOCKS.find((b) => b.key === "uvp").rubric[0], "Moins de 25 mots");
});

test("renderBrief : un titre par bloc, sa consigne, ses champs remplis, ses critères à cocher", () => {
  const md = renderBrief(full(), "2026-09-27");
  assert.match(md, /^# Brief projet : Devis Facile\n/);
  assert.match(md, /## 2\. Le problème\n\n_Un problème dur : douloureux, urgent, récurrent, et conscient\._\n\n- \*\*Le problème\*\* :\n\n  Les devis ne sont pas relancés\.\n  Des contrats sont perdus\.\n/);
  assert.match(md, /### Persona 1 : Léa, 32 ans, graphiste, Lyon\n\n- \*\*Contexte \(personnel \/ pro \/ techno\)\*\* : Seule, 15 clients/);
  assert.match(md, /- \*\*Nb de personnes interviewées\*\* : 6/);
  assert.match(md, /\*\*Critères à vérifier\*\* :\n\n- \[ \] La persona est sourcée/);
  assert.match(md, /\(15 mots\)/);
  assert.match(md, /<!-- ottho-brief \{.*\} -->\n$/);
});

test("writeBrief puis readBrief : aller-retour, complet quand chaque bloc a son champ principal", async () => {
  const dir = await tempDir("op-brief-");
  const empty = await readBrief(dir);
  assert.deepEqual([empty.exists, empty.complete, empty.file, empty.blocks.length], [false, false, BRIEF_FILE, 6]);
  assert.deepEqual(empty.data, emptyBrief());
  await writeBrief(dir, { ...emptyBrief(), name: "Brouillon", domaine: { domaine: "Santé" } }, "2026-09-27");
  let brief = await readBrief(dir);
  assert.deepEqual([brief.exists, brief.complete, brief.data.domaine.domaine, brief.data.domaine.legitimite], [true, false, "Santé", ""]);
  await writeBrief(dir, full(), "2026-09-27");
  brief = await readBrief(dir);
  assert.equal(brief.complete, true);
  assert.deepEqual(brief.data, full());
});

test("missingBlocks : le nom puis chaque bloc sans son champ principal ; complet quand rien ne manque", () => {
  assert.deepEqual(missingBlocks(emptyBrief()), ["Le nom du projet", ...BLOCKS.map((b) => b.title)]);
  assert.deepEqual(missingBlocks({ ...full(), persona: [{ identite: "", contexte: "Seule" }], solution: { modele: "", action: "relancer" } }), ["La persona", "La solution"]);
  assert.deepEqual(missingBlocks(full()), []);
  assert.deepEqual([isComplete(full()), isComplete({ ...full(), name: "" })], [true, false]);
});

test("writeBrief : champs bornés, personas limitées, commentaire jamais cassé", async () => {
  const dir = await tempDir("op-brief-");
  await assert.rejects(writeBrief(dir, { ...full(), name: "x".repeat(3000) }, "2026-09-27"), (e) => e.status === 400);
  await assert.rejects(writeBrief(dir, { ...full(), persona: Array(9).fill({ identite: "a" }) }, "2026-09-27"), (e) => e.status === 400);
  await assert.rejects(writeBrief(dir, { ...full(), cible: { marche: { objet: 1 } } }, "2026-09-27"), (e) => e.status === 400);
  await writeBrief(dir, { ...full(), probleme: { description: "fin de commentaire --> ici" } }, "2026-09-27");
  assert.equal((await readBrief(dir)).data.probleme.description, "fin de commentaire --> ici");
});

test("readBrief : un brief de la première version (nom, problème, personas) est repris", async () => {
  const dir = await tempDir("op-brief-");
  await mkdir(join(dir, "docs"));
  const old = { name: "Ancien", problem: "Relances oubliées", pitch: "Une phrase", personas: [{ name: "Léa", need: "suivre", pain: "oublie" }] };
  await writeFile(join(dir, BRIEF_FILE), `# Brief\n\n<!-- ottho-brief ${JSON.stringify(old)} -->\n`);
  const { data } = await readBrief(dir);
  assert.deepEqual([data.name, data.probleme.description, data.persona[0].identite, data.persona[0].freins, data.uvp.phrase], ["Ancien", "Relances oubliées", "Léa", "oublie", "Une phrase"]);
});

test("wordCount : les mots d'une phrase de valeur", () => {
  assert.equal(wordCount("J'aide les freelances à relancer leurs devis grâce à l'automatisation."), 10);
});

test("writeBrief : ne remplace jamais un brief rempli par un brief vide ; copie de sauvegarde avant chaque écriture", async () => {
  const { readdir } = await import("node:fs/promises");
  const dir = await tempDir("op-brief-");
  await writeBrief(dir, full(), "2026-09-27");
  await assert.rejects(writeBrief(dir, emptyBrief(), "2026-09-27"), (e) => e.status === 409 && /vide/.test(e.message));
  assert.equal((await readBrief(dir)).data.name, "Devis Facile");
  await writeBrief(dir, { ...full(), name: "Devis Facile 2" }, "2026-09-27");
  const backups = await readdir(join(dir, ".claude", "brief-backups"));
  assert.equal(backups.length, 1);
  assert.match(await readFile(join(dir, ".claude", "brief-backups", backups[0]), "utf8"), /^# Brief projet : Devis Facile\n/);
});

test("exemples de brief : enregistrés hors du projet sous leur nom, relus pour préremplir un nouveau projet", async () => {
  const dir = await tempDir("op-presets-");
  assert.deepEqual(await listPresets(dir), []);
  const saved = await savePreset(dir, "Haircut", { ...full(), name: "Haircut" });
  assert.equal(saved.slug, "haircut");
  await savePreset(dir, "Devis Facile", full());
  const presets = await listPresets(dir);
  assert.deepEqual(presets.map((p) => [p.slug, p.name]), [["devis-facile", "Devis Facile"], ["haircut", "Haircut"]]);
  assert.equal(presets.find((p) => p.slug === "haircut").brief.domaine.domaine, "Freelances du graphisme");
  assert.equal(saved.replaced, false);
  // Même nom : remplacé, pas dupliqué ; nom vide refusé.
  assert.equal((await savePreset(dir, "Haircut", { ...full(), name: "Haircut", uvp: { phrase: "Nouvelle phrase" } })).replaced, true);
  assert.equal((await listPresets(dir)).length, 2);
  assert.equal((await listPresets(dir)).find((p) => p.slug === "haircut").brief.uvp.phrase, "Nouvelle phrase");
  await assert.rejects(savePreset(dir, "  ", full()), (e) => e.status === 400);
});
