import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildEvent, findLaunch, handbackText, lastAssistantText, maskSecrets, questionsOf, sessionQuestionsOf, textOf } from "../scripts/pipeline-event.mjs";

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
  assert.equal(buildEvent({ hook_event_name: "SessionStart", tool_input: { subagent_type: "x" } }), null);
});

test("textOf parcourt objets et tableaux", () => {
  assert.equal(textOf({ a: ["x", { b: "y" }], n: 3 }), "x\ny\n");
});

test("fin : questions du bloc « Questions pour toi » ; compte rendu gardé, secrets masqués", () => {
  const e = buildEvent(
    post(
      "designer",
      "Maquettes prêtes (clé : sk_live_abcdefgh12345678).\n\n**Questions pour toi :**\n\n- Faut-il un reçu PDF\n  envoyé par e-mail ?\n2. Mode sombre dans le MVP ?\n\n> **Prochaine étape recommandée** : invoquer `architect`",
    ),
    { now: NOW },
  );
  assert.deepEqual(e.questions, ["Faut-il un reçu PDF envoyé par e-mail ?", "Mode sombre dans le MVP ?"]);
  assert.equal(e.next, "architect");
  assert.match(e.report, /^Maquettes prêtes \(clé : \[secret masqué\]\)/);
  assert.equal(JSON.stringify(e).includes("sk_live_abcdefgh"), false);
});

test("maskSecrets : clés d'API, jetons, clés privées ; texte ordinaire intact", () => {
  const text = [
    "stripe sk_test_ABCDEF1234567890", "aws AKIAABCDEFGHIJKLMNOP", "gh ghp_" + "a".repeat(36),
    "jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJlLXRyZXMtbG9uZ3Vl",
    "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----", "texte normal : re_trouver",
  ].join("\n");
  const out = maskSecrets(text);
  assert.equal((out.match(/\[secret masqué\]/g) ?? []).length, 5);
  assert.match(out, /texte normal : re_trouver/);
});

test("questionsOf : dernier bloc seulement, 10 au plus, rien sans bloc ; une longue question reste entière", () => {
  const many = Array.from({ length: 12 }, (_, i) => `- Q${i} ${"x".repeat(400)} ?`).join("\n");
  const out = questionsOf(`Questions pour toi :\n- ancienne ?\n\nSuite.\n\nQuestions pour toi :\n${many}\n`);
  assert.equal(out.length, 10);
  assert.ok(out.every((q) => q.length > 400 && q.startsWith("Q") && q.endsWith("?")));
  assert.deepEqual(questionsOf("Aucune question ici ?"), []);
});

test("questions très longues : coupées sur un mot au-delà de 2 000 caractères, avec « … »", () => {
  const long = `Quelle cible retiens-tu ${"pour le MVP ".repeat(250)}?`;
  const [q] = questionsOf(`Questions pour toi :\n- ${long}\n`);
  assert.ok(q.length <= 2000 && q.endsWith("…") && !q.endsWith(" …"));
  const real = "Quelle cible retiens-tu pour le MVP : coiffeuses solo uniquement (moins de 100k), ou indépendants beauté sur RDV (coiffure, barbiers, esthétique) pour repasser au-dessus de 100k ? Ma recommandation par défaut : MVP sur les coiffeuses solo, avec l'élargissement documenté comme cible de marché dans le PRD.";
  assert.deepEqual(sessionQuestionsOf(`Deux points :\n1. ${real}\n2. On continue ?`), [real, "On continue ?"]);
  // Le « ? » d'une adresse web ne fait pas une question.
  assert.deepEqual(sessionQuestionsOf("Sources :\n- https://exemple.com/?page=2\n- La doc Supabase"), []);
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
    report: "Fiche prête.\n\nQuestions pour toi :\n- Faut-il un compteur de caractères ?\n\n> **Prochaine étape recommandée** : invoquer `designer`",
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
  assert.match(e.report, /Prochaine étape recommandée : invoquer `architect`/);
  assert.equal(e.report.includes("Le compte rendu est transmis"), false);
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

const inner = (tool, input, over = {}) => ({
  hook_event_name: "PreToolUse", tool_name: tool, tool_use_id: "toolu_in", tool_input: input,
  agent_id: "a84e15673f59d08fc", agent_type: "ottho-code-app:designer", ...over,
});

test("activité d'un sous-agent : outil et détail court, chemins relatifs au projet", () => {
  const opts = { now: NOW, projectDir: "/projet" };
  assert.deepEqual(buildEvent(inner("Write", { file_path: "/projet/design/charte.md", content: "SECRET" }), opts), {
    v: 1, ts: NOW.toISOString(), type: "activity", agentId: "a84e15673f59d08fc", agent: "designer", tool: "Write", detail: "design/charte.md",
  });
  assert.equal(buildEvent(inner("Read", { file_path: "/ailleurs/notes.md" }), opts).detail, "notes.md");
  assert.equal(buildEvent(inner("Bash", { command: "curl -H 'Authorization: sk_live_x' …", description: "Installe les dépendances" }), opts).detail, "Installe les dépendances");
  assert.equal(buildEvent(inner("Bash", { command: "npm test -- --token=abc" }), opts).detail, "npm");
  assert.equal(buildEvent(inner("WebFetch", { url: "https://docs.example.com/a?key=1" }), opts).detail, "docs.example.com");
  assert.equal(buildEvent(inner("Artifact", { action: "publish", url: "https://claude.ai/artifact/x" }), opts).detail, "publish");
  assert.equal(buildEvent(inner("mcp__pencil__execute", { input: "…" }), opts).detail, "pencil · execute");
  assert.equal(JSON.stringify(buildEvent(inner("Write", { file_path: "/projet/a.md", content: "SECRET" }), opts)).includes("SECRET"), false);
});

test("outil du fil principal (sans agent_id) : pas d'activité", () => {
  assert.equal(buildEvent({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/projet/x" } }, { now: NOW }), null);
});

// Session principale (terminal central) : questions de fin de tour, réponse, attente d'autorisation.
const REAL_ASK = `Il va installer Playwright avec npm et télécharger Chromium, soit quelques centaines de Mo. C'est gratuit.

Deux questions attendent toujours votre réponse :
1. Je lance l'agent architect pour mettre à jour la règle de validateLabel au § 2 du plan ?
2. Je commite specs/ et reviews/ ?`;

test("sessionQuestionsOf : liste numérotée, bloc standard, dernière phrase interrogative ; sinon rien", () => {
  assert.deepEqual(sessionQuestionsOf(REAL_ASK), [
    "Je lance l'agent architect pour mettre à jour la règle de validateLabel au § 2 du plan ?",
    "Je commite specs/ et reviews/ ?",
  ]);
  assert.deepEqual(sessionQuestionsOf("Plan écrit.\n\n**Questions pour toi :**\n- Stripe ou Paddle ?\n"), ["Stripe ou Paddle ?"]);
  assert.deepEqual(sessionQuestionsOf("La spec est prête. Je lance le designer ?"), ["La spec est prête. Je lance le designer ?"]);
  assert.deepEqual(sessionQuestionsOf("Tests verts, tout est commité."), []);
  assert.deepEqual(sessionQuestionsOf("Pourquoi ? Parce que la RLS manquait.\n\nCorrigé."), []);
});

test("Stop : questions de la session principale, sa session, lancée ou non dans le terminal du pipeline", () => {
  const stop = { hook_event_name: "Stop", session_id: "s1", last_assistant_message: REAL_ASK };
  assert.deepEqual(buildEvent(stop, { now: NOW, inApp: true }), {
    v: 1, ts: "2026-09-26T14:05:12.000Z", type: "ask", agent: "claude", source: "session", session: "s1", inApp: true,
    questions: [
      "Je lance l'agent architect pour mettre à jour la règle de validateLabel au § 2 du plan ?",
      "Je commite specs/ et reviews/ ?",
    ],
  });
  // Fin de tour sans question : l'événement part quand même (les anciennes questions sont caduques).
  assert.deepEqual(buildEvent({ ...stop, last_assistant_message: "C'est fait." }, { now: NOW }).questions, []);
});

test("UserPromptSubmit : réponse de l'utilisateur, sans le contenu du message", () => {
  const e = buildEvent({ hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "1. oui 2. non, clé sk_live_ABCDEFGH123" }, { now: NOW });
  assert.deepEqual(e, { v: 1, ts: "2026-09-26T14:05:12.000Z", type: "reply", agent: "claude", source: "session", session: "s1" });
});

test("Notification permission_prompt : Claude attend une autorisation ; autres notifications ignorées", () => {
  const n = { hook_event_name: "Notification", session_id: "s1", notification_type: "permission_prompt", message: "Claude needs your permission to use Bash" };
  assert.deepEqual(buildEvent(n, { now: NOW, inApp: false }), {
    v: 1, ts: "2026-09-26T14:05:12.000Z", type: "wait", agent: "claude", source: "session", session: "s1", inApp: false,
    message: "Claude needs your permission to use Bash",
  });
  assert.equal(buildEvent({ ...n, notification_type: "idle_prompt" }, { now: NOW }), null);
});
