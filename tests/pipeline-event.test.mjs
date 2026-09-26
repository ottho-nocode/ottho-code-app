import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildEvent, questionsOf, textOf } from "../scripts/pipeline-event.mjs";

const NOW = new Date("2026-09-26T14:05:12.000Z");
const pre = (over = {}) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Agent",
  tool_use_id: "toolu_01",
  tool_input: { subagent_type: "ottho-code-app:architect", description: "Plan", prompt: "Plan technique de US-3 paiement" },
  ...over,
});
const post = (agent, response, over = {}) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Agent",
  tool_use_id: "toolu_02",
  tool_input: { subagent_type: `ottho-code-app:${agent}`, prompt: "Travail sur US-03" },
  tool_response: response,
  ...over,
});

test("début : agent sans préfixe, source plugin, US normalisée depuis le prompt", () => {
  assert.deepEqual(buildEvent(pre(), { now: NOW, branch: "feature/US-09-autre" }), {
    v: 1, ts: "2026-09-26T14:05:12.000Z", type: "start", id: "toolu_01",
    agent: "architect", source: "plugin", us: "US-03", branch: "feature/US-09-autre",
  });
});

test("début sans US dans le prompt : repli sur la branche ; agent de projet", () => {
  const e = buildEvent(pre({ tool_input: { subagent_type: "mon-agent", prompt: "fais un truc" } }), { now: NOW, branch: "feature/US-12-x" });
  assert.equal(e.us, "US-12");
  assert.equal(e.agent, "mon-agent");
  assert.equal(e.source, "projet");
});

test("fin : next (dernière recommandation) et verdict review", () => {
  const e = buildEvent(
    post("code-reviewer", { content: [{ type: "text", text: "Rapport…\n\nVerdict : CORRECTIONS REQUISES\n\n> **Prochaine étape recommandée** : re-invoquer `developer` avec ce rapport" }] }),
    { now: NOW },
  );
  assert.equal(e.type, "end");
  assert.equal(e.next, "developer");
  assert.equal(e.verdict, "CORRECTIONS REQUISES");
  assert.deepEqual(e.questions, []);
});

test("fin tester : verdict VERTS/ROUGES ; tool_response en chaîne ; sans tool_use_id", () => {
  const e = buildEvent(
    post("tester", "Suite OK.\nVerdict tests : VERTS\n> **Prochaine étape recommandée** : invoquer `doc-writer`", { tool_name: "Task", tool_use_id: undefined }),
    { now: NOW },
  );
  assert.equal(e.verdict, "VERTS");
  assert.equal(e.next, "doc-writer");
  assert.equal(e.id, null);
});

test("fin spec-writer : « recommande `designer` » compris comme agent suivant", () => {
  const e = buildEvent(post("spec-writer", "Fiche prête.\n\nJe **recommande `designer`** pour les maquettes."), { now: NOW });
  assert.equal(e.next, "designer");
});

test("verdict ignoré pour les autres agents", () => {
  const e = buildEvent({ hook_event_name: "PostToolUse", tool_input: { subagent_type: "ottho-code-app:architect" }, tool_response: "APPROUVÉ" }, { now: NOW });
  assert.equal(e.verdict, null);
});

test("pas de sub-agent ou événement inconnu → null", () => {
  assert.equal(buildEvent({ hook_event_name: "PreToolUse", tool_input: { command: "ls" } }), null);
  assert.equal(buildEvent({ hook_event_name: "Stop", tool_input: { subagent_type: "x" } }), null);
});

test("textOf parcourt objets et tableaux", () => {
  assert.equal(textOf({ a: ["x", { b: "y" }], n: 3 }), "x\ny\n");
});

test("fin : questions du bloc « Questions pour toi », jamais le reste de la réponse", () => {
  const e = buildEvent(
    post(
      "designer",
      "Maquettes prêtes (secret : sk_live_123).\n\n**Questions pour toi :**\n\n- Faut-il un reçu PDF\n  envoyé par e-mail ?\n2. Mode sombre dans le MVP ?\n\n> **Prochaine étape recommandée** : invoquer `architect`",
    ),
    { now: NOW },
  );
  assert.deepEqual(e.questions, ["Faut-il un reçu PDF envoyé par e-mail ?", "Mode sombre dans le MVP ?"]);
  assert.equal(e.next, "architect");
  assert.equal(JSON.stringify(e).includes("sk_live"), false);
  assert.equal(JSON.stringify(e).includes("Maquettes"), false);
});

test("questionsOf : dernier bloc seulement, 10 au plus, 300 caractères au plus, rien sans bloc", () => {
  const many = Array.from({ length: 12 }, (_, i) => `- Q${i} ${"x".repeat(400)} ?`).join("\n");
  const out = questionsOf(`Questions pour toi :\n- ancienne ?\n\nSuite.\n\nQuestions pour toi :\n${many}\n`);
  assert.equal(out.length, 10);
  assert.ok(out.every((q) => q.length <= 300 && q.startsWith("Q")));
  assert.deepEqual(questionsOf("Aucune question ici ?"), []);
});

const fx = (name) => new URL(`./fixtures/${name}`, import.meta.url);
test("fixtures réelles (capturées pendant la recette)", { skip: !existsSync(fx("agent-pre.json")) && "fixtures pas encore capturées" }, () => {
  const start = buildEvent(JSON.parse(readFileSync(fx("agent-pre.json"))), { now: NOW });
  const end = buildEvent(JSON.parse(readFileSync(fx("agent-post.json"))), { now: NOW });
  assert.equal(start.type, "start");
  assert.equal(end.type, "end");
  assert.equal(start.agent, end.agent);
});
