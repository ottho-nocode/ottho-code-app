import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildEvent, findLaunch, handbackText, lastAssistantText, questionsOf, textOf } from "../scripts/pipeline-event.mjs";

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

const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test("vrais messages : début puis lancement asynchrone (pas de fausse fin)", () => {
  const start = buildEvent(fx("agent-pre.json"), { now: NOW, branch: "feature/US-01-ajouter-une-tache-a-une-liste" });
  assert.deepEqual([start.type, start.agent, start.source, start.us], ["start", "spec-writer", "plugin", "US-01"]);
  const launch = buildEvent(fx("agent-post-async.json"), { now: NOW });
  assert.deepEqual(launch, {
    v: 1, ts: NOW.toISOString(), type: "launch", id: "toolu_01L9dqNnq7SCu14k7obDmFXx",
    agentId: "aae4decaacc5b1643", agent: "spec-writer", source: "plugin", us: "US-01", branch: null,
  });
});

const TRANSCRIPT = [
  { type: "user", message: { role: "user", content: "Rédige la fiche US-01" } },
  { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: {} }] } },
  { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
  {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Fiche prête.\n\nQuestions pour toi :\n- Faut-il un compteur de caractères ?\n\n> **Prochaine étape recommandée** : invoquer `designer`" }],
    },
  },
].map((l) => JSON.stringify(l)).join("\n");

test("lastAssistantText : dernier message texte de l'assistant dans la transcription", () => {
  assert.match(lastAssistantText(TRANSCRIPT), /^Fiche prête\./);
  assert.equal(lastAssistantText("pas du json\n{}"), "");
});

test("SubagentStop : vraie fin, reliée au lancement, avec agent suivant et questions", () => {
  const payload = { hook_event_name: "SubagentStop", agent_id: "aae4decaacc5b1643", agent_type: "ottho-code-app:spec-writer", agent_transcript_path: "/t.jsonl" };
  const launch = { id: "toolu_01L9dqNnq7SCu14k7obDmFXx", agent: "spec-writer", source: "plugin", us: "US-01" };
  const e = buildEvent(payload, { now: NOW, branch: "feature/US-01-x", transcript: TRANSCRIPT, launch });
  assert.deepEqual(e, {
    v: 1, ts: NOW.toISOString(), type: "end", id: "toolu_01L9dqNnq7SCu14k7obDmFXx", agentId: "aae4decaacc5b1643",
    agent: "spec-writer", source: "plugin", us: "US-01", branch: "feature/US-01-x",
    next: "designer", verdict: null, questions: ["Faut-il un compteur de caractères ?"],
  });
});

test("SubagentStop sans lancement connu ni agent_type → ignoré ; last_assistant_message prioritaire", () => {
  assert.equal(buildEvent({ hook_event_name: "SubagentStop", agent_id: "x" }, { now: NOW }), null);
  const e = buildEvent(
    { hook_event_name: "SubagentStop", agent_id: "y", agent_type: "tester", last_assistant_message: "Verdict tests : ROUGES" },
    { now: NOW, transcript: TRANSCRIPT },
  );
  assert.deepEqual([e.agent, e.source, e.id, e.verdict, e.next], ["tester", "projet", null, "ROUGES", null]);
});

test("findLaunch retrouve le lancement d'un agentId dans le journal", () => {
  const journal = [
    { v: 1, type: "start", id: "t1", agent: "designer" },
    { v: 1, type: "launch", id: "t1", agentId: "a1", agent: "designer", source: "plugin", us: "US-01" },
    "ligne corrompue",
  ].map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
  assert.deepEqual(findLaunch(journal, "a1"), { v: 1, type: "launch", id: "t1", agentId: "a1", agent: "designer", source: "plugin", us: "US-01" });
  assert.equal(findLaunch(journal, "inconnu"), null);
});

test("vrai SubagentStop : le rapport est dans SubagentHandback, pas dans la phrase de clôture", () => {
  const stop = fx("agent-stop.json");
  const transcript = readFileSync(new URL("./fixtures/agent-transcript.jsonl", import.meta.url), "utf8");
  assert.match(handbackText(transcript), /Prochaine étape recommandée : invoquer `architect`/);
  const launch = { id: "toolu_011WNMGf8ZP2badoEPzs7iGy", agent: "designer", source: "plugin", us: "US-01" };
  const e = buildEvent(stop, { now: NOW, transcript, launch });
  assert.deepEqual([e.type, e.id, e.agentId, e.agent, e.us, e.next, e.verdict], ["end", launch.id, "a84e15673f59d08fc", "designer", "US-01", "architect", null]);
  assert.deepEqual(e.questions, []);
});

test("SubagentStop : questions du rapport de remise, type vide (agents internes de Claude Code) ignoré", () => {
  const transcript = JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", name: "SubagentHandback", input: { message: "Fait.\n\nQuestions pour toi :\n- Faut-il un mode sombre ?\n\nProchaine étape recommandée : invoquer `architect`" } }] },
  });
  const e = buildEvent({ hook_event_name: "SubagentStop", agent_id: "z", agent_type: "ottho-code-app:designer", last_assistant_message: "Transmis." }, { now: NOW, transcript });
  assert.deepEqual([e.next, e.questions], ["architect", ["Faut-il un mode sombre ?"]]);
  assert.equal(buildEvent({ hook_event_name: "SubagentStop", agent_id: "i", agent_type: "", last_assistant_message: "Reading files" }, { now: NOW }), null);
});
