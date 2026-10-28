import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEvents, pairRuns, rotateIfNeeded, sessionStatus, STALE_MS } from "./events.mjs";
import { tempDir } from "./tmpdirs.mjs";

const ev = (type, agent, extra = {}) => ({ v: 1, ts: "2026-09-26T10:00:00.000Z", type, agent, ...extra });
const NOW = Date.parse("2026-09-26T10:10:00.000Z");

test("parseEvents ignore et compte les lignes corrompues", () => {
  const text = [JSON.stringify(ev("start", "architect")), "{pas du json", JSON.stringify({ v: 2 }), ""].join("\n");
  const { events, corrupt } = parseEvents(text);
  assert.equal(events.length, 1);
  assert.equal(corrupt, 2);
});

test("pairRuns apparie par id et reporte next, verdict, us", () => {
  const runs = pairRuns(
    [
      ev("start", "code-reviewer", { id: "a", us: "US-03", source: "plugin" }),
      ev("end", "code-reviewer", { id: "a", next: "tester", verdict: "APPROUVÉ" }),
    ],
    NOW,
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].state, "done");
  assert.equal(runs[0].next, "tester");
  assert.equal(runs[0].verdict, "APPROUVÉ");
  assert.equal(runs[0].us, "US-03");
});

test("pairRuns reprend les questions de l'événement de fin (liste vide par défaut)", () => {
  const runs = pairRuns(
    [
      ev("start", "designer", { id: "q" }),
      ev("end", "designer", { id: "q", questions: ["Faut-il un reçu PDF ?"] }),
      ev("start", "architect"),
    ],
    NOW,
  );
  assert.deepEqual(runs.map((r) => r.questions), [["Faut-il un reçu PDF ?"], []]);
});

test("pairRuns sans id : la fin ferme le dernier début ouvert du même agent", () => {
  const runs = pairRuns([ev("start", "tester"), ev("start", "architect"), ev("end", "tester")], NOW);
  assert.deepEqual(runs.map((r) => [r.agent, r.state]), [["tester", "done"], ["architect", "running"]]);
});

test("pairRuns : sub-agent en arrière-plan, la fin (SubagentStop) rejoint le début via le lancement", () => {
  const runs = pairRuns(
    [
      ev("start", "spec-writer", { id: "t1", us: "US-01" }),
      ev("launch", "spec-writer", { id: "t1", agentId: "a1" }),
      ev("start", "spec-writer", { id: "t2", us: "US-02" }),
      ev("launch", "spec-writer", { id: "t2", agentId: "a2" }),
      ev("end", "spec-writer", { id: null, agentId: "a1", next: "designer" }),
    ],
    NOW,
  );
  assert.deepEqual(runs.map((r) => [r.us, r.state, r.next]), [["US-01", "done", "designer"], ["US-02", "running", null]]);
});

test("pairRuns : activité d'un sous-agent rattachée par agentId (sinon par nom), trace bornée", () => {
  const acts = Array.from({ length: 15 }, (_, i) => ev("activity", "designer", { agentId: "a1", tool: "Read", detail: `f${i}.md` }));
  const runs = pairRuns(
    [
      ev("start", "designer", { id: "t1", us: "US-01" }),
      ev("launch", "designer", { id: "t1", agentId: "a1" }),
      ...acts,
      ev("start", "architect", { id: "t2", us: "US-01" }),
      ev("activity", "architect", { agentId: "inconnu", tool: "Write", detail: "plans/US-01.md" }),
    ],
    NOW,
  );
  assert.deepEqual([runs[0].steps, runs[0].activity.detail, runs[0].trail.length, runs[0].trail[0].detail], [15, "f14.md", 12, "f3.md"]);
  assert.deepEqual(runs[1].activity, { tool: "Write", detail: "plans/US-01.md", ts: "2026-09-26T10:00:00.000Z" });
});

test("pairRuns : fichiers produits (écritures, sans doublon) et compte rendu de fin", () => {
  const runs = pairRuns(
    [
      ev("start", "architect", { id: "t", us: "US-01" }),
      ev("launch", "architect", { id: "t", agentId: "a" }),
      ev("activity", "architect", { agentId: "a", tool: "Read", detail: "specs/US-01.md" }),
      ev("activity", "architect", { agentId: "a", tool: "Write", detail: "plans/US-01.md" }),
      ev("activity", "architect", { agentId: "a", tool: "Edit", detail: "plans/US-01.md" }),
      ev("activity", "architect", { agentId: "a", tool: "Write", detail: "docs/adr/ADR-001.md" }),
      ev("end", "architect", { agentId: "a", report: "Plan écrit." }),
    ],
    NOW,
  );
  assert.deepEqual(runs[0].files, ["plans/US-01.md", "docs/adr/ADR-001.md"]);
  assert.equal(runs[0].report, "Plan écrit.");
});

test("parseEvents accepte les lancements", () => {
  assert.deepEqual(parseEvents(JSON.stringify(ev("launch", "designer", { id: "t", agentId: "a" }))).corrupt, 0);
});

test("pairRuns : fin orpheline ignorée", () => {
  assert.deepEqual(pairRuns([ev("end", "tester")], NOW), []);
});

test("pairRuns : début sans fin depuis plus de 30 min → interrompu", () => {
  const old = new Date(NOW - STALE_MS - 1000).toISOString();
  const runs = pairRuns([{ ...ev("start", "developer"), ts: old }], NOW);
  assert.equal(runs[0].state, "interrupted");
  assert.equal(runs[0].lastSeen, old);
});

test("pairRuns : un long passage qui agit encore n'est pas interrompu ; lastSeen = dernière action", () => {
  const old = new Date(NOW - STALE_MS - 60_000).toISOString();
  const recent = new Date(NOW - 5 * 60_000).toISOString();
  const runs = pairRuns(
    [
      { ...ev("start", "developer"), ts: old },
      { v: 1, ts: recent, type: "activity", agentId: null, agent: "developer", tool: "Edit", detail: "src/app.js" },
    ],
    NOW,
  );
  assert.deepEqual([runs[0].state, runs[0].lastSeen], ["running", recent]);
});

test("rotateIfNeeded garde les dernières lignes au-delà du seuil", async () => {
  const file = join(await tempDir("op-ev-"), "events.jsonl");
  await writeFile(file, Array.from({ length: 50 }, (_, i) => `{"n":${i}}`).join("\n") + "\n");
  assert.equal(await rotateIfNeeded(file, { maxBytes: 100, keep: 10 }), true);
  const lines = (await readFile(file, "utf8")).trim().split("\n");
  assert.equal(lines.length, 10);
  assert.equal(lines[0], '{"n":40}');
});

test("rotateIfNeeded ne touche pas un petit fichier ni un fichier absent", async () => {
  const dir = await tempDir("op-ev-");
  await writeFile(join(dir, "e.jsonl"), "{}\n");
  assert.equal(await rotateIfNeeded(join(dir, "e.jsonl")), false);
  assert.equal(await rotateIfNeeded(join(dir, "absent.jsonl")), false);
});

const at = (min) => new Date(NOW - min * 60_000).toISOString();
const ask = (min, questions, over = {}) => ({ v: 1, ts: at(min), type: "ask", agent: "claude", source: "session", session: "s1", inApp: true, questions, ...over });

test("sessionStatus : questions de la session principale en attente jusqu'à la réponse", () => {
  const q = ["Je lance architect ?", "Je commite ?"];
  assert.deepEqual(sessionStatus([ask(5, q)], NOW).ask, { ts: at(5), session: "s1", questions: q });
  // Réponse de l'utilisateur, ou tour suivant sans question : plus rien en attente.
  assert.equal(sessionStatus([ask(5, q), { v: 1, ts: at(3), type: "reply", agent: "claude", session: "s1" }], NOW).ask, null);
  assert.equal(sessionStatus([ask(5, q), ask(2, [])], NOW).ask, null);
  // La réponse d'une autre session ne compte pas.
  assert.notEqual(sessionStatus([ask(5, q), { v: 1, ts: at(3), type: "reply", agent: "claude", session: "s2" }], NOW).ask, null);
  // Questions de plus de 12 h : session sans doute fermée.
  assert.equal(sessionStatus([ask(13 * 60, q)], NOW).ask, null);
});

test("sessionStatus : attente d'autorisation, levée dès que quelque chose se passe ensuite", () => {
  const wait = { v: 1, ts: at(2), type: "wait", agent: "claude", session: "s1", inApp: false, message: "Claude needs your permission to use Bash" };
  assert.deepEqual(sessionStatus([wait], NOW).wait, { ts: at(2), session: "s1", message: "Claude needs your permission to use Bash" });
  assert.equal(sessionStatus([wait, { v: 1, ts: at(1), type: "activity", agent: "tester", tool: "Bash", detail: "npx" }], NOW).wait, null);
  assert.equal(sessionStatus([{ ...wait, ts: at(40) }], NOW).wait, null);
});

test("parseEvents / pairRuns : les événements de session ne créent ni ne ferment de passage", () => {
  const text = [ev("start", "tester"), ask(1, ["Je commite ?"]), { v: 1, ts: at(0), type: "reply", agent: "claude", session: "s1" }].map((e) => JSON.stringify(e)).join("\n");
  const { events } = parseEvents(text);
  assert.equal(events.length, 3);
  const runs = pairRuns(events, NOW);
  assert.deepEqual(runs.map((r) => [r.agent, r.state]), [["tester", "running"]]);
});

test("sessionStatus : questions posées dans le sélecteur du terminal (wait, kind questions), levées par la réponse", () => {
  const wait = { v: 1, ts: at(2), type: "wait", agent: "claude", session: "s1", inApp: true, kind: "questions", message: "2 questions dans le terminal", questions: ["Quelle cible ?", "Quel modèle ?"] };
  assert.deepEqual(sessionStatus([wait], NOW).wait, { ts: at(2), session: "s1", message: "2 questions dans le terminal", kind: "questions", questions: ["Quelle cible ?", "Quel modèle ?"] });
  const answered = { v: 1, ts: at(1), type: "answered", agent: "claude", session: "s1", pairs: [] };
  assert.equal(sessionStatus([wait, answered], NOW).wait, null);
});

test("sessionStatus : autorisation donnée, l'outil a tourné (resume) : plus d'attente", () => {
  const wait = { v: 1, ts: at(3), type: "wait", agent: "claude", session: "s1", inApp: true, message: "Claude needs your permission" };
  assert.notEqual(sessionStatus([wait], NOW).wait, null);
  assert.equal(sessionStatus([wait, { v: 1, ts: at(2), type: "resume", agent: "claude", session: "s1" }], NOW).wait, null);
});
