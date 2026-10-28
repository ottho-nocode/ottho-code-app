import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectQuestions, normalizeQuestion, parseOpenQuestions } from "./questions.mjs";
import { tempDir } from "./tmpdirs.mjs";

const SPEC = `# US-03 — Paiement

## 6. Dépendances

- [ ] ceci n'est pas une question ouverte

## 7. Questions ouvertes

- [ ] Le paiement gère-t-il les remboursements ?
- [x] Quel prestataire de paiement ?
  > Réponse (2026-09-25) : Stripe,
  > en mode test d'abord.
- [ ] {{OPEN_QUESTION_2}}
- [x] Faut-il un reçu PDF ? (posée par designer)
  > Réponse (2026-09-26) : non.

---

## 8. Prochaine étape
- [ ] hors section
`;

test("parseOpenQuestions : section seule, cases, réponses, auteur, placeholders ignorés", () => {
  const { items, sectionFound } = parseOpenQuestions(SPEC);
  assert.equal(sectionFound, true);
  assert.deepEqual(
    items.map((i) => [i.text, i.answered, i.answer, i.answeredAt, i.askedBy]),
    [
      ["Le paiement gère-t-il les remboursements ?", false, null, null, null],
      ["Quel prestataire de paiement ?", true, "Stripe,\nen mode test d'abord.", "2026-09-25", null],
      ["Faut-il un reçu PDF ?", true, "non.", "2026-09-26", "designer"],
    ],
  );
  assert.equal(SPEC.split("\n")[items[0].line], "- [ ] Le paiement gère-t-il les remboursements ?");
});

test("parseOpenQuestions : titre ### non numéroté accepté ; pas de section → vide", () => {
  assert.equal(parseOpenQuestions("### Questions ouvertes\n- [ ] A ?\n").items[0].text, "A ?");
  assert.deepEqual(parseOpenQuestions("# Rien\n- [ ] A ?\n"), { items: [], sectionFound: false });
});

test("normalizeQuestion ignore casse, espaces, ponctuation finale et auteur", () => {
  assert.equal(normalizeQuestion("  Faut-il   un reçu PDF ? (posée par designer)"), normalizeQuestion("faut-il un reçu pdf"));
});

const r = (agent, us, state, questions, end = "2026-09-26T10:05:00Z") => ({
  id: null, agent, source: "plugin", us, branch: null, start: "2026-09-26T10:00:00Z",
  end: state === "done" ? end : null, next: null, verdict: null, state, questions,
});

test("collectQuestions : livrables + direct, dédoublonnage, dernière exécution, fichiers cibles", async () => {
  const dir = await tempDir("op-q-");
  await mkdir(join(dir, "specs"));
  await mkdir(join(dir, "docs"));
  await writeFile(join(dir, "specs", "US-03-paiement.md"), SPEC);
  const prd = "# PRD\n\n## 8. Questions ouvertes\n\n- [ ] Quelle langue par défaut ?\n";
  await writeFile(join(dir, "docs", "PRD.md"), prd);

  const qs = await collectQuestions({
    projectDir: dir,
    runs: [
      r("designer", "US-03", "done", ["Faut-il un export CSV ?", "quel prestataire de paiement"]),
      r("architect", "US-03", "done", ["Ancienne question ?"]),
      r("architect", "US-03", "done", []),
      r("tester", "US-03", "running", []),
      r("brainstorming", "US-07", "done", ["Qui est la cible ?"]),
      r("devops", null, "done", ["Quel hébergeur ?"]),
    ],
  });
  const view = qs.map((q) => [q.origin, q.us, q.askedBy, q.text, q.answered, q.target.file]);
  assert.deepEqual(view, [
    ["livrable", "US-03", "spec-writer", "Le paiement gère-t-il les remboursements ?", false, "specs/US-03-paiement.md"],
    ["livrable", "US-03", "spec-writer", "Quel prestataire de paiement ?", true, "specs/US-03-paiement.md"],
    ["livrable", "US-03", "designer", "Faut-il un reçu PDF ?", true, "specs/US-03-paiement.md"],
    ["livrable", null, "spec-writer", "Quelle langue par défaut ?", false, "docs/PRD.md"],
    ["direct", "US-03", "designer", "Faut-il un export CSV ?", false, "specs/US-03-paiement.md"],
    ["direct", "US-07", "brainstorming", "Qui est la cible ?", false, "docs/questions/US-07.md"],
    ["direct", null, "devops", "Quel hébergeur ?", false, "docs/PRD.md"],
  ]);
  assert.deepEqual(qs[0].target, { file: "specs/US-03-paiement.md" });
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  const again = await collectQuestions({ projectDir: dir, runs: [r("designer", "US-03", "done", ["Faut-il un export CSV ?"])] });
  assert.equal(again.find((q) => q.origin === "direct").id, qs[4].id);
});

test("collectQuestions : docs/questions/US-XX.md lu, questions en direct tronquées et limitées", async () => {
  const dir = await tempDir("op-q-");
  await mkdir(join(dir, "docs", "questions"), { recursive: true });
  await writeFile(join(dir, "docs", "questions", "US-07.md"), "## Questions ouvertes\n\n- [x] Qui est la cible ? (posée par brainstorming)\n  > Réponse (2026-09-26) : les freelances.\n");
  const many = Array.from({ length: 12 }, (_, i) => `Question ${i} ${"x".repeat(400)} ?`);
  const qs = await collectQuestions({ projectDir: dir, runs: [r("designer", "US-07", "done", many)] });
  const livrable = qs.filter((q) => q.origin === "livrable");
  assert.deepEqual(livrable.map((q) => [q.us, q.askedBy, q.answered, q.answer]), [["US-07", "brainstorming", true, "les freelances."]]);
  const direct = qs.filter((q) => q.origin === "direct");
  assert.equal(direct.length, 10);
  // Une question longue reste entière (plus de coupe à 300 caractères).
  assert.ok(direct.every((q) => q.text.length > 400 && q.text.endsWith("?")));
});

test("collectQuestions : question répondue dans le sélecteur du terminal, même reformulée, n'est plus en attente", async () => {
  const dir = await tempDir("op-q-");
  const run = { agent: "brainstorming", us: null, state: "done", questions: ["Sur tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell ?", "Quel nom de domaine ?"] };
  const qs = await collectQuestions({
    projectDir: dir,
    runs: [run],
    terminalAnswers: [{ question: "D'après tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell ?", answer: "Peur de la marketplace" }],
  });
  const planity = qs.find((q) => q.text.includes("Planity"));
  assert.deepEqual([planity.answered, planity.answer, planity.answeredIn], [true, "Peur de la marketplace", "terminal"]);
  assert.equal(qs.find((q) => q.text.includes("domaine")).answered, false);
});

test("collectQuestions : questions d'un agent répondues dans le terminal après son passage (réponse de l'utilisateur ensuite)", async () => {
  const dir = await tempDir("op-q-");
  const end = new Date(Date.now() - 60_000).toISOString();
  const run = { agent: "architect", us: null, state: "done", end, questions: ["Stripe Connect ou non ?"] };
  const before = await collectQuestions({ projectDir: dir, runs: [run] });
  assert.equal(before[0].answered, false);
  const after = await collectQuestions({ projectDir: dir, runs: [run], lastReplyAt: new Date().toISOString() });
  assert.deepEqual([after[0].answered, after[0].answeredIn, after[0].answer], [true, "terminal", null]);
});
