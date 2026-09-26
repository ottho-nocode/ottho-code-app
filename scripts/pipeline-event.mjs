#!/usr/bin/env node
// Hook du plugin ottho-code-app : PreToolUse / PostToolUse (matcher Agent|Task) et
// SubagentStop. Journalise les sub-agents dans <projet>/.claude/pipeline-events.jsonl,
// lu par l'app ottho-pipeline :
//   start  : PreToolUse de l'outil Agent (feature tirée du prompt) ;
//   launch : PostToolUse d'un sub-agent lancé en arrière-plan (relie tool_use_id et agentId) ;
//   end    : SubagentStop (vraie fin, réponse lue dans la transcription) ou PostToolUse synchrone.
// Métadonnées seulement : ni prompt ni réponse, sauf les questions du bloc « Questions
// pour toi » (10 au plus, 300 caractères chacune). Jamais bloquant : sortie 0.
import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const US_RE = /(?<![A-Za-z])US-0*(\d{1,4})/i;
const NEXT_RE = /(?:Prochaine étape recommandée\**\s*:\s*\**\s*(?:re-)?invoquer|\brecommande)\s+\**`([\w:-]+)`/gi;
const REVIEW_RE = /(APPROUVÉ|CORRECTIONS REQUISES)/g;
const TESTS_RE = /Verdict tests\s*:\s*\**\s*(VERTS|ROUGES)/gi;
const QUESTIONS_HEADING_RE = /^\s*[*_]*\s*Questions pour toi\s*:?\s*[*_]*\s*:?\s*$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const MAX_QUESTIONS = 10;
const MAX_QUESTION_LENGTH = 300;

const usKey = (text) => {
  const m = US_RE.exec(text ?? "");
  return m ? `US-${m[1].padStart(2, "0")}` : null;
};

const lastGroup = (re, text) => {
  let last = null;
  for (const m of text.matchAll(re)) last = m[1];
  return last;
};

export function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("\n");
  if (typeof value === "object") return Object.values(value).map(textOf).join("\n");
  return "";
}

// Puces du dernier bloc « Questions pour toi : ». Une ligne indentée qui n'est pas
// une puce prolonge la question précédente ; une ligne vide ou « > » clôt le bloc.
export function questionsOf(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  lines.forEach((l, i) => {
    if (QUESTIONS_HEADING_RE.test(l)) start = i;
  });
  if (start === -1) return [];
  const questions = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      if (questions.length) break;
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) questions.push(bullet[1].trim());
    else if (questions.length && /^\s+\S/.test(line) && !/^\s*>/.test(line)) questions[questions.length - 1] += ` ${line.trim()}`;
    else break;
  }
  return questions
    .map((q) => q.replace(/^\*+|\*+$/g, "").trim().slice(0, MAX_QUESTION_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
}

// Texte du dernier message de l'assistant dans une transcription JSONL de sub-agent.
export function lastAssistantText(jsonl) {
  const lines = jsonl.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const message = entry?.message;
    if (entry?.type !== "assistant" && message?.role !== "assistant") continue;
    const content = message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content) ? content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "";
    if (text.trim()) return text;
  }
  return "";
}

// Événement « launch » d'un agentId dans le journal (le plus récent), ou null.
export function findLaunch(journal, agentId) {
  const lines = journal.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e?.type === "launch" && e.agentId === agentId) return e;
    } catch {
      // ligne illisible : ignorée
    }
  }
  return null;
}

const agentOf = (raw) => {
  if (typeof raw !== "string" || !raw) return null;
  const prefixed = raw.includes(":");
  return { agent: prefixed ? raw.split(":").pop() : raw, source: prefixed ? "plugin" : "projet" };
};

function endFields(agent, text) {
  return {
    next: lastGroup(NEXT_RE, text)?.split(":").pop() ?? null,
    verdict:
      agent === "code-reviewer" ? lastGroup(REVIEW_RE, text)
      : agent === "tester" ? (lastGroup(TESTS_RE, text)?.toUpperCase() ?? null)
      : null,
    questions: questionsOf(text),
  };
}

export function buildEvent(payload, { now = new Date(), branch = null, transcript = "", launch = null } = {}) {
  const hook = payload?.hook_event_name;
  const ts = now.toISOString();

  if (hook === "SubagentStop") {
    const who = launch ? { agent: launch.agent, source: launch.source ?? "plugin" } : agentOf(payload.agent_type);
    if (!who) return null;
    const text = typeof payload.last_assistant_message === "string" ? payload.last_assistant_message : lastAssistantText(transcript);
    return {
      v: 1, ts, type: "end", id: launch?.id ?? null, agentId: payload.agent_id ?? null,
      agent: who.agent, source: who.source, us: launch?.us ?? usKey(branch), branch,
      ...endFields(who.agent, text),
    };
  }

  const type = hook === "PreToolUse" ? "start" : hook === "PostToolUse" ? "end" : null;
  const input = payload?.tool_input ?? {};
  const who = agentOf(input.subagent_type);
  if (!type || !who) return null;
  const base = {
    v: 1,
    ts,
    type,
    id: payload.tool_use_id ?? null,
    agent: who.agent,
    source: who.source,
    us: usKey(`${input.prompt ?? ""}\n${input.description ?? ""}`) ?? usKey(branch),
    branch,
  };
  if (type === "start") return base;
  const response = payload.tool_response;
  if (response?.isAsync || response?.status === "async_launched") {
    // Sub-agent en arrière-plan : sa vraie fin arrivera par SubagentStop.
    const { id, agent, source, us } = base;
    return { v: 1, ts, type: "launch", id, agentId: response.agentId ?? null, agent, source, us, branch };
  }
  return { ...base, ...endFields(who.agent, textOf(response)) };
}

// Fin d'un fichier (transcriptions et journal peuvent grossir) : 2 Mo au plus.
function readTail(path, max = 2 * 1024 * 1024) {
  try {
    const fd = openSync(path, "r");
    try {
      const size = fstatSync(fd).size;
      const length = Math.min(size, max);
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, size - length);
      return buf.toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}

function currentBranch(cwd) {
  try {
    const out = execFileSync("git", ["branch", "--show-current"], { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 2000 });
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd;
  if (!projectDir) return;
  const journal = join(projectDir, ".claude", "pipeline-events.jsonl");
  const options = { branch: currentBranch(projectDir) };
  if (payload.hook_event_name === "SubagentStop") {
    options.launch = payload.agent_id ? findLaunch(readTail(journal), payload.agent_id) : null;
    options.transcript = payload.agent_transcript_path ? readTail(payload.agent_transcript_path) : "";
  }
  const event = buildEvent(payload, options);
  if (!event) return;
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  appendFileSync(journal, JSON.stringify(event) + "\n");
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) {
  try {
    main();
  } catch {
    // jamais bloquant
  }
  process.exit(0);
}
