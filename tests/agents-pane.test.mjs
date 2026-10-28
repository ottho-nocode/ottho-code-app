import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_MAX_MS,
  STALE_MS,
  buildSnapshot,
  describeActivity,
  parseEvents,
  since,
  toastFor,
} from "../hooks/agents-pane/model.ts";

const T0 = Date.parse("2026-10-05T10:00:00.000Z");
const at = (min) => new Date(T0 + min * 60_000).toISOString();
const line = (o) => JSON.stringify(o);

// Journal écrit par scripts/pipeline-event.mjs : lancement, activité du sous-agent, fin avec suite.
const LOG = [
  line({ type: "start", ts: at(0), id: "toolu_1", agent: "spec-writer", source: "plugin", us: "US-02" }),
  line({ type: "launch", ts: at(0), id: "toolu_1", agentId: "a1", agent: "spec-writer" }),
  line({ type: "activity", ts: at(1), agentId: "a1", agent: "spec-writer", tool: "Write", detail: "specs/US-02.md" }),
  line({ type: "end", ts: at(2), id: "toolu_1", agent: "spec-writer", us: "US-02", next: "valide la spec", verdict: null }),
  line({ type: "start", ts: at(3), id: "toolu_2", agent: "architect", source: "plugin", us: "US-02" }),
  line({ type: "launch", ts: at(3), id: "toolu_2", agentId: "a2", agent: "architect" }),
  line({ type: "activity", ts: at(4), agentId: "a2", agent: "architect", tool: "Read", detail: "specs/US-02.md" }),
  "{ ligne coupée",
  line({ type: "ask", ts: at(5), agent: "claude", source: "session", questions: [{}, {}] }),
].join("\n");

test("agents : dernière exécution, terminée avec la suite ou en cours avec son activité", () => {
  const snap = buildSnapshot(parseEvents(LOG), T0 + 6 * 60_000);
  assert.equal(snap.latest["spec-writer"].status, "done");
  assert.equal(snap.latest["spec-writer"].next, "valide la spec");
  assert.equal(snap.latest.architect.status, "running");
  assert.equal(snap.latest.architect.activity, "lit specs/US-02.md");
  assert.equal(snap.latest.designer, undefined);
  assert.equal(snap.next, "valide la spec");
  assert.equal(snap.us, "US-02");
  assert.deepEqual(snap.waiting, { kind: "ask", count: 2, since: T0 + 5 * 60_000 });
});

test("agents : sans signe de vie depuis 30 min, interrompu ; une réponse lève l'attente", () => {
  const events = parseEvents(`${LOG}\n${line({ type: "reply", ts: at(6), agent: "claude", source: "session" })}`);
  const snap = buildSnapshot(events, T0 + 4 * 60_000 + STALE_MS + 1);
  assert.equal(snap.latest.architect.status, "interrupted");
  assert.equal(snap.waiting, null);
});

test("agents : une question restée sans réponse plus de 12 h ne s'affiche plus", () => {
  const snap = buildSnapshot(parseEvents(LOG), T0 + 5 * 60_000 + ASK_MAX_MS + 1);
  assert.equal(snap.waiting, null);
});

test("agents : textes de l'activité, des durées et des notifications", () => {
  assert.equal(describeActivity("Bash", "git"), "lance git");
  assert.equal(describeActivity("mcp__supabase__list_tables", undefined), "service supabase");
  assert.equal(since(30_000), "à l'instant");
  assert.equal(since(3 * 60_000), "3 min");
  assert.equal(since(125 * 60_000), "2 h 05");
  assert.equal(
    toastFor({ type: "end", agent: "code-reviewer", us: "US-07", verdict: "APPROUVÉ", next: "tester" }),
    "✓ code-reviewer a fini (US-07) : APPROUVÉ → tester",
  );
  assert.equal(toastFor({ type: "start", agent: "developer", us: "US-07" }), "◉ developer démarre (US-07)");
  assert.equal(toastFor({ type: "ask", agent: "claude", source: "session", questions: [{}] }), "? Claude attend ta réponse (1 question)");
  assert.equal(toastFor({ type: "activity", agentId: "a1" }), null);
});
