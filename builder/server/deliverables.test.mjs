import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectDeliverables, historyState, readDeliverable } from "./deliverables.mjs";
import { tempDir } from "./tmpdirs.mjs";

const SPEC = "# US-01 — Tâches\n\n## 7. Questions ouvertes\n\n- [x] Q ?\n\n---\n\n## Historique\n\n- 2026-09-26 — Création par `spec-writer`.\n";
const D = "2026-09-27";

test("historyState : validé seulement si la dernière entrée est une validation", () => {
  assert.deepEqual(historyState(SPEC), { validated: false, validatedAt: null });
  const ok = `${SPEC}- 2026-09-27 — Validé par l'utilisateur (Ottho Builder 2).\n`;
  assert.deepEqual(historyState(ok), { validated: true, validatedAt: "2026-09-27" });
  assert.deepEqual(historyState(`${ok}- 2026-09-28 — Mise à jour par \`spec-writer\`.\n`), { validated: false, validatedAt: null });
  assert.deepEqual(historyState("# Plan sans historique\n"), { validated: false, validatedAt: null });
});

test("historyState : « Validé(e) par l'utilisateur » (deux apostrophes, date ou non, « : » ou « — »), jamais « non validé(e) »", () => {
  const last = (entry) => historyState(`${SPEC}${entry}\n`);
  for (const entry of [
    "- 2026-10-03 : Validé par l'utilisateur.",
    "- 2026-10-03 — Validée par l’utilisateur (Ottho Builder 2).",
    "- 2026-10-03 : validée par l'utilisateur",
  ]) {
    assert.deepEqual(last(entry), { validated: true, validatedAt: "2026-10-03" }, entry);
  }
  for (const entry of ["- Validé par l'utilisateur.", "- Validée par l’utilisateur"]) {
    assert.deepEqual(last(entry), { validated: true, validatedAt: null }, entry);
  }
  for (const entry of [
    "- 2026-10-03 : Non validée par l'utilisateur.",
    "- 2026-10-03 — Version non validée par l’utilisateur (à reprendre).",
    "- 2026-10-03 : non validé par l'utilisateur",
    "- 2026-10-03 : Non-validé par l'utilisateur",
    "- 2026-10-03 : à valider par l'utilisateur",
  ]) {
    assert.deepEqual(last(entry), { validated: false, validatedAt: null }, entry);
  }
});

async function project() {
  const dir = await tempDir("op-deliv-");
  for (const d of ["specs", "design", "plans"]) await mkdir(join(dir, d));
  await writeFile(join(dir, "specs", "US-01-taches.md"), SPEC);
  await writeFile(join(dir, "design", "US-01-taches.md"), "# Maquette\n");
  await writeFile(join(dir, "plans", "US-02-export.md"), `# Plan\n\n## Historique\n\n- ${D} — Validé par l'utilisateur (Ottho Builder 2).\n`);
  return dir;
}

test("collectDeliverables : spec, maquette, plan, avec leur état", async () => {
  const dir = await project();
  const list = await collectDeliverables(dir);
  assert.deepEqual(
    list.map((d) => [d.us, d.agent, d.file, d.validated, d.validatedAt]),
    [
      ["US-01", "spec-writer", "specs/US-01-taches.md", false, null],
      ["US-01", "designer", "design/US-01-taches.md", false, null],
      ["US-02", "architect", "plans/US-02-export.md", true, D],
    ],
  );
  assert.equal("version" in list[0], false);
});

test("readDeliverable : chemin et contenu ; agent inconnu ou fichier absent refusés", async () => {
  const dir = await project();
  const d = await readDeliverable({ projectDir: dir, us: "US-01", agent: "spec-writer" });
  assert.deepEqual(d, { file: "specs/US-01-taches.md", content: SPEC });
  await assert.rejects(readDeliverable({ projectDir: dir, us: "US-01", agent: "developer" }), (e) => e.status === 400);
  await assert.rejects(readDeliverable({ projectDir: dir, us: "US-09", agent: "spec-writer" }), (e) => e.status === 404);
});

test("maquettes du designer : liens Claude Design, images exportées et fichier .pen de la feature", async () => {
  const dir = await project();
  await writeFile(
    join(dir, "design", "US-01-taches.md"),
    "# Maquette\n\n> Maquettes : https://claude.ai/artifact/AbC123-x_9\n\nVoir aussi https://claude.ai/code/artifact/0f1e2d3c et https://evil.example/artifact/x\n",
  );
  await mkdir(join(dir, "design", "US-01-taches"));
  await writeFile(join(dir, "design", "US-01-taches", "vide.png"), "png");
  await writeFile(join(dir, "design", "US-01-taches", "notes.txt"), "pas une image");
  await writeFile(join(dir, "design", "US-01-taches.pen"), "chiffré");
  await writeFile(join(dir, "design", "US-02-export.svg"), "<svg/>");
  const designer = (await collectDeliverables(dir)).find((d) => d.agent === "designer");
  assert.deepEqual(designer.mockups, {
    links: ["https://claude.ai/artifact/AbC123-x_9", "https://claude.ai/code/artifact/0f1e2d3c"],
    screens: [],
    images: ["design/US-01-taches/vide.png"],
    pen: ["design/US-01-taches.pen"],
  });
  const spec = (await collectDeliverables(dir)).find((d) => d.agent === "spec-writer");
  assert.equal(spec.mockups, undefined);
});

test("écrans du canevas rangés dans design/US-XX-*/ : ordre, titres et tailles de canvas.json", async () => {
  const dir = await project();
  await mkdir(join(dir, "design", "US-01-taches"));
  await writeFile(join(dir, "design", "US-01-taches", "Main.dc.html"), "<x-dc></x-dc>");
  await writeFile(join(dir, "design", "US-01-taches", "Mobile.dc.html"), "<x-dc></x-dc>");
  await writeFile(
    join(dir, "design", "US-01-taches", "canvas.json"),
    JSON.stringify({ v: 3, boards: { "Main.dc.html": { x: 0, y: 900, w: 1280, h: 800, title: "Liste vide" }, "Mobile.dc.html": { w: 390, h: 844 } }, order: ["Mobile.dc.html", "Main.dc.html"] }),
  );
  const designer = (await collectDeliverables(dir)).find((d) => d.agent === "designer" && d.us === "US-01");
  assert.deepEqual(designer.mockups.screens, [
    // Sans position : sous les écrans placés (900 + 800 + 160).
    { path: "design/US-01-taches/Mobile.dc.html", title: "Mobile", x: 0, y: 1860, w: 390, h: 844 },
    { path: "design/US-01-taches/Main.dc.html", title: "Liste vide", x: 0, y: 900, w: 1280, h: 800 },
  ]);
});

test("charte graphique : livrable de niveau projet (us null), lien du design system, validation lue dans le fichier", async () => {
  const dir = await project();
  const charte = "# Charte\n\n> Design system : https://claude.ai/artifact/DsCharte01\n\nCouleurs.\n\n## Historique\n\n- 2026-09-26 — Création par `designer`.\n";
  await writeFile(join(dir, "design", "charte.md"), charte);
  const found = (await collectDeliverables(dir)).find((d) => d.kind === "charte");
  assert.deepEqual([found.us, found.agent, found.file, found.validated, found.mockups.links], [null, "designer", "design/charte.md", false, ["https://claude.ai/artifact/DsCharte01"]]);
  const read = await readDeliverable({ projectDir: dir, us: null, agent: "designer" });
  assert.equal(read.file, "design/charte.md");
  await appendFile(join(dir, "design", "charte.md"), `- ${D} — Validée par l'utilisateur.\n`);
  assert.equal((await collectDeliverables(dir)).find((d) => d.kind === "charte").validatedAt, D);
  await assert.rejects(readDeliverable({ projectDir: dir, us: null, agent: "tester" }), (e) => e.status === 400);
  // spec-writer a un livrable de niveau projet (le PRD), absent ici.
  await assert.rejects(readDeliverable({ projectDir: dir, us: null, agent: "spec-writer" }), (e) => e.status === 404);
});

test("PRD et architecture : livrables de niveau projet (us null), lisibles comme une spec", async () => {
  const dir = await tempDir("op-prd-");
  await mkdir(join(dir, "docs"), { recursive: true });
  await writeFile(join(dir, "docs", "PRD.md"), "# PRD\n\n## 1. Vision\n\nUne app.\n");
  await writeFile(join(dir, "docs", "architecture.md"), "# Architecture\n");
  const list = await collectDeliverables(dir);
  const prd = list.find((d) => d.kind === "prd");
  assert.deepEqual([prd.us, prd.agent, prd.file, prd.validated], [null, "spec-writer", "docs/PRD.md", false]);
  assert.equal(list.find((d) => d.kind === "architecture").agent, "architect");
  const read = await readDeliverable({ projectDir: dir, us: null, agent: "spec-writer" });
  assert.deepEqual([read.file, read.content], ["docs/PRD.md", "# PRD\n\n## 1. Vision\n\nUne app.\n"]);
  assert.equal((await readDeliverable({ projectDir: dir, us: null, agent: "architect" })).file, "docs/architecture.md");
});

test("maquettes du projet : canevas de design/projet (Claude Design) et pages HTML de design/maquettes, rattachés à la charte", async () => {
  const dir = await tempDir("op-projmock-");
  await mkdir(join(dir, "design", "projet"), { recursive: true });
  await mkdir(join(dir, "design", "maquettes"), { recursive: true });
  await writeFile(join(dir, "design", "charte.md"), "# Charte\n\n> Maquettes : https://claude.ai/artifact/abc123\n");
  await writeFile(join(dir, "design", "projet", "Accueil.dc.html"), "<h1>Accueil</h1>");
  await writeFile(join(dir, "design", "projet", "Reservation.dc.html"), "<h1>Réservation</h1>");
  await writeFile(join(dir, "design", "projet", "canvas.json"), JSON.stringify({ order: ["Reservation.dc.html", "Accueil.dc.html"], boards: { "Accueil.dc.html": { title: "Accueil", x: 0, y: 0, w: 390, h: 844 } } }));
  await writeFile(join(dir, "design", "maquettes", "index.html"), "<h1>Toutes les maquettes</h1>");
  const charte = (await collectDeliverables(dir)).find((d) => d.kind === "charte");
  assert.deepEqual(charte.mockups.links, ["https://claude.ai/artifact/abc123"]);
  assert.deepEqual(charte.mockups.linkKinds, ["maquettes"]);
  assert.deepEqual(charte.mockups.screens.map((s) => `${s.path}|${s.title}`).sort(), [
    "design/maquettes/index.html|index",
    "design/projet/Accueil.dc.html|Accueil",
    "design/projet/Reservation.dc.html|Reservation",
  ]);
  assert.equal(charte.mockups.screens.length, 3);
  assert.equal(charte.mockups.screens.find((s) => s.title === "Accueil").w, 390);
});

test("maquettes du projet : le lien du canevas peut être noté dans un autre fichier de design/ (ecrans.md)", async () => {
  const dir = await tempDir("op-projlink-");
  await mkdir(join(dir, "design"), { recursive: true });
  await writeFile(join(dir, "design", "charte.md"), "# Charte\n\n> Design system : https://claude.ai/artifact/ds111\n");
  await writeFile(join(dir, "design", "ecrans.md"), "# Écrans clés\n\n> Maquettes (canevas Claude Design) : https://claude.ai/artifact/EMW2B34\n");
  const charte = (await collectDeliverables(dir)).find((d) => d.kind === "charte");
  assert.deepEqual(charte.mockups.links, ["https://claude.ai/artifact/ds111", "https://claude.ai/artifact/EMW2B34"]);
  assert.deepEqual(charte.mockups.linkKinds, ["design system", "maquettes"]);
});

test("écrans sans position (page HTML) placés sous ceux du canevas, jamais par-dessus", async () => {
  const dir = await tempDir("op-place-");
  await mkdir(join(dir, "design", "projet"), { recursive: true });
  await mkdir(join(dir, "design", "maquettes"), { recursive: true });
  await writeFile(join(dir, "design", "charte.md"), "# Charte\n");
  await writeFile(join(dir, "design", "projet", "Main.dc.html"), "<p>a</p>");
  await writeFile(join(dir, "design", "projet", "canvas.json"), JSON.stringify({ order: ["Main.dc.html"], boards: { "Main.dc.html": { x: 0, y: 0, w: 940, h: 460 } } }));
  await writeFile(join(dir, "design", "maquettes", "index.html"), "<p>b</p>");
  const screens = (await collectDeliverables(dir)).find((d) => d.kind === "charte").mockups.screens;
  const page = screens.find((sc) => sc.path.endsWith("index.html"));
  assert.deepEqual([page.x, page.y], [0, 620]);
});
