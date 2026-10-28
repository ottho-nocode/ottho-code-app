// Lecture du journal écrit par le hook du plugin (.claude/pipeline-events.jsonl)
// et appariement début/fin en « runs ».
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const STALE_MS = 30 * 60 * 1000;
const TRAIL = 12; // dernières actions gardées par exécution
const MAX_FILES = 50;
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export const eventsPath = (projectDir) => join(projectDir, ".claude", "pipeline-events.jsonl");

export function parseEvents(text) {
  const events = [];
  let corrupt = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e?.v === 1 && ["start", "launch", "end", "activity", "ask", "reply", "wait", "answered", "resume"].includes(e.type) && typeof e.agent === "string") events.push(e);
      else corrupt++;
    } catch {
      corrupt++;
    }
  }
  return { events, corrupt };
}

// Runs en ordre chronologique. Appariement par id (tool_use_id) si les deux côtés
// l'ont, sinon par agentId (relié au début par l'événement « launch » d'un
// sub-agent en arrière-plan), sinon par agent (dernier début encore ouvert).
export function pairRuns(events, now = Date.now()) {
  const runs = [];
  for (const e of events) {
    if (e.type === "start") {
      runs.push({
        id: e.id ?? null,
        agentId: null,
        agent: e.agent,
        source: e.source ?? "projet",
        us: e.us ?? null,
        branch: e.branch ?? null,
        start: e.ts,
        end: null,
        next: null,
        verdict: null,
        questions: [],
        activity: null,
        // Dernier signe de vie (lancement, puis chaque action) : sert à repérer un agent silencieux.
        lastSeen: e.ts,
        steps: 0,
        trail: [],
        files: [],
        report: null,
        state: "running",
      });
      continue;
    }
    // Session principale (questions, réponse, autorisation) : lue par sessionStatus.
    if (e.type === "ask" || e.type === "reply" || e.type === "wait" || e.type === "answered" || e.type === "resume") continue;
    if (e.type === "activity") {
      // Action en cours d'un sous-agent : par agentId (relié au lancement), sinon par nom.
      const run =
        runs.findLast((r) => r.end === null && e.agentId && r.agentId === e.agentId) ??
        runs.findLast((r) => r.end === null && r.agent === e.agent);
      if (run) {
        const step = { tool: String(e.tool ?? ""), detail: String(e.detail ?? ""), ts: e.ts };
        run.activity = step;
        run.lastSeen = e.ts;
        run.steps += 1;
        run.trail = [...run.trail, step].slice(-TRAIL);
        // Fichiers produits : écritures et modifications, sans doublon.
        if (WRITE_TOOLS.has(step.tool) && step.detail && !run.files.includes(step.detail) && run.files.length < MAX_FILES) {
          run.files = [...run.files, step.detail];
        }
      }
      continue;
    }
    if (e.type === "launch") {
      const run = runs.findLast((r) => r.end === null && r.id && r.id === e.id);
      if (run) run.agentId = e.agentId ?? null;
      continue;
    }
    const run = runs.findLast(
      (r) =>
        r.end === null &&
        (e.id && r.id ? r.id === e.id : e.agentId && r.agentId ? r.agentId === e.agentId : r.agent === e.agent),
    );
    if (!run) continue; // fin sans début (hook installé en cours de route)
    Object.assign(run, {
      end: e.ts,
      next: e.next ?? null,
      verdict: e.verdict ?? null,
      questions: Array.isArray(e.questions) ? e.questions : [],
      report: typeof e.report === "string" ? e.report : null,
      state: "done",
      us: run.us ?? e.us ?? null,
    });
  }
  for (const r of runs) {
    // Interrompu : plus aucun signe de vie depuis 30 min (session fermée, app relancée…).
    if (r.state === "running" && now - Date.parse(r.lastSeen) > STALE_MS) r.state = "interrupted";
  }
  return runs;
}

export async function rotateIfNeeded(file, { maxBytes = 5 * 1024 * 1024, keep = 1000 } = {}) {
  let size;
  try {
    size = (await stat(file)).size;
  } catch {
    return false;
  }
  if (size <= maxBytes) return false;
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean).slice(-keep);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, lines.join("\n") + "\n");
  await rename(tmp, file);
  return true;
}

const ASK_MAX_AGE = 12 * 3600 * 1000;
const WAIT_MAX_AGE = 30 * 60 * 1000;

// Ce que la session principale (Claude Code, dans le terminal) attend de l'utilisateur : les questions
// de son dernier tour tant qu'il n'a pas répondu, et une autorisation en suspens tant que
// rien d'autre ne s'est passé depuis.
export function sessionStatus(events, now = Date.now()) {
  let ask = null;
  let wait = null;
  for (const e of events) {
    if (e.type === "ask") {
      const questions = Array.isArray(e.questions) ? e.questions.filter((q) => typeof q === "string") : [];
      ask = questions.length ? { ts: e.ts, session: e.session ?? null, questions } : null;
      wait = null;
    } else if (e.type === "reply") {
      if (!ask?.session || !e.session || e.session === ask.session) ask = null;
      wait = null;
    } else if (e.type === "wait") {
      wait = {
        ts: e.ts,
        session: e.session ?? null,
        message: typeof e.message === "string" ? e.message : "",
        // « questions » : Claude pose des questions dans le sélecteur du terminal ; sinon une autorisation.
        ...(e.kind === "questions" ? { kind: "questions", questions: Array.isArray(e.questions) ? e.questions.filter((q) => typeof q === "string") : [] } : {}),
      };
    } else if (wait && e.ts > wait.ts) {
      wait = null; // une action ou une fin : l'autorisation a été donnée (ou refusée)
    }
  }
  if (ask && now - Date.parse(ask.ts) > ASK_MAX_AGE) ask = null;
  if (wait && now - Date.parse(wait.ts) > WAIT_MAX_AGE) wait = null;
  return { ask, wait };
}
