#!/usr/bin/env node
// Hook du plugin ottho-code-app : PreToolUse / PostToolUse (matcher Agent|Task) et
// SubagentStop. Journalise les sub-agents dans <projet>/.claude/pipeline-events.jsonl,
// lu par l'app Ottho Builder 2 :
//   start  : PreToolUse de l'outil Agent (feature tirée du prompt) ;
//   launch : PostToolUse d'un sub-agent lancé en arrière-plan (relie tool_use_id et agentId) ;
//   end    : SubagentStop (vraie fin, réponse lue dans la transcription) ou PostToolUse synchrone ;
//   activity : PreToolUse d'un outil appelé DANS un sous-agent (agent_id présent) : outil + détail court.
// Session principale (le terminal central, qui orchestre les agents) :
//   ask   : Stop, fin d'un tour ; questions posées à l'utilisateur (liste vide s'il n'y en a pas) ;
//   reply : UserPromptSubmit, l'utilisateur a répondu (jamais le contenu de son message) ;
//   wait  : Notification permission_prompt, Claude attend une autorisation ; ou PreToolUse
//   AskUserQuestion, Claude pose des questions dans le terminal (kind « questions ») ;
//   resume : PostToolUse d'un outil de la session principale après une demande d'autorisation
//   (marqueur .claude/ottho-waiting) : l'autorisation est donnée, l'app retire la notification ;
//   answered : PostToolUse AskUserQuestion, réponses données dans le sélecteur du terminal
//   (question et réponse, pour que l'app ne les laisse pas « en attente »).
// Pas de prompt ni de contenu de fichier. En fin d'exécution : les questions du bloc
// « Questions pour toi » (10 au plus, 2 000 caractères chacune) et le compte rendu de
// l'agent (8 000 caractères au plus, secrets reconnaissables masqués), consultables
// dans l'historique du pipeline. Journal local, ignoré par Git. Écrit sans suivre de lien
// symbolique (dépôt piégé). Jamais bloquant : sortie 0.
import { closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, existsSync, rmSync, writeSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const US_RE = /(?<![A-Za-z])US-0*(\d{1,4})/i;
const NEXT_RE = /(?:Prochaine étape recommandée\**\s*:\s*\**\s*(?:re-)?invoquer|\brecommande)\s+\**`([\w:-]+)`/gi;
const REVIEW_RE = /(APPROUVÉ|CORRECTIONS REQUISES)/g;
const TESTS_RE = /Verdict tests\s*:\s*\**\s*(VERTS|ROUGES)/gi;
const QUESTIONS_HEADING_RE = /^\s*[*_]*\s*Questions pour toi\s*:?\s*[*_]*\s*:?\s*$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const MAX_QUESTIONS = 10;
const MAX_REPORT = 8000;
// Mêmes familles que scripts/secret-scan.sh, élargies aux JWT (clés Supabase), GitHub, Slack.
const SECRET_RES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /sk_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bre_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /xkeysib-[A-Za-z0-9]{20,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

export function maskSecrets(text) {
  return SECRET_RES.reduce((out, re) => out.replace(re, "[secret masqué]"), text);
}

const reportOf = (text) => {
  const clean = maskSecrets(text.trim());
  return clean.length > MAX_REPORT ? `${clean.slice(0, MAX_REPORT)}…` : clean;
};
const MAX_QUESTION_LENGTH = 2000;
// Au-delà de max : coupé sur le dernier mot entier, suivi de « … » (on voit qu'il y a une suite).
export const clipText = (text, max = MAX_QUESTION_LENGTH) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

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
    .map((q) => clipText(q.replace(/^\*+|\*+$/g, "").trim()))
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
}

const cleanQuestions = (qs) =>
  qs
    .map((q) => clipText(maskSecrets(q.replace(/^\*+|\*+$/g, "").trim())))
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);

// Questions de la session principale à la fin d'un tour : bloc « Questions pour toi », sinon
// liste (numérotée ou à puces) de questions dans la fin du message, sinon sa dernière phrase
// si elle est interrogative.
export function sessionQuestionsOf(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const block = questionsOf(text);
  if (block.length) return cleanQuestions(block);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-25);
  // Ligne de liste qui pose une question (« ? » suivi d'un espace ou en fin de ligne : pas
  // celui d'une adresse web), même suivie d'une recommandation.
  const listed = lines.map((l) => /^(?:\d+[.)]|[-*•])\s+(.*\?(?:\s.*)?)$/.exec(l)?.[1]?.replace(/[*_\s]+$/, "")).filter(Boolean);
  if (listed.length) return cleanQuestions(listed);
  const last = lines.at(-1) ?? "";
  return /\?[*_\s]*$/.test(last) && last.length <= 400 ? cleanQuestions([last]) : [];
}

// Réponses du sélecteur AskUserQuestion : { "question": "réponse" } dans l'entrée de l'outil
// (remplie par Claude Code) ou dans sa réponse.
export function askAnswers(payload) {
  const source = payload?.tool_input?.answers ?? payload?.tool_response?.answers;
  if (!source || typeof source !== "object") return [];
  return Object.entries(source)
    .filter(([q, a]) => q && a !== undefined && a !== null)
    .map(([question, answer]) => ({ question: clipText(maskSecrets(String(question))), answer: clipText(maskSecrets(Array.isArray(answer) ? answer.join(", ") : String(answer))) }))
    .slice(0, MAX_QUESTIONS);
}

function sessionEvent(payload, ts) {
  const base = { v: 1, ts, agent: "claude", source: "session", session: payload.session_id ?? null };
  const hook = payload.hook_event_name;
  if (hook === "UserPromptSubmit") return { ...base, type: "reply" };
  if (hook === "Stop") return { ...base, type: "ask", questions: sessionQuestionsOf(payload.last_assistant_message) };
  if (hook === "Notification" && payload.notification_type === "permission_prompt") {
    return { ...base, type: "wait", message: clipText(maskSecrets(String(payload.message ?? "")), 500) };
  }
  return null;
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

// Rapport de remise du sub-agent (outil SubagentHandback) : c'est lui qui porte le
// compte rendu, l'agent recommandé et les questions ; le dernier texte n'est souvent
// qu'une phrase de clôture. Le plus récent, ou "".
export function handbackText(jsonl) {
  const lines = jsonl.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    const call = content.findLast((c) => c?.type === "tool_use" && c.name === "SubagentHandback");
    if (call) return typeof call.input?.message === "string" ? call.input.message : textOf(call.input);
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

function endFields(agent, text, report = text) {
  return {
    next: lastGroup(NEXT_RE, text)?.split(":").pop() ?? null,
    verdict:
      agent === "code-reviewer" ? lastGroup(REVIEW_RE, text)
      : agent === "tester" ? (lastGroup(TESTS_RE, text)?.toUpperCase() ?? null)
      : null,
    questions: questionsOf(text),
    report: reportOf(report),
  };
}

const MAX_DETAIL = 120;
const clip = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL) : "");

// Détail court d'une action : jamais de contenu de fichier ni de commande complète
// (secrets possibles) ; un chemin est rendu relatif au projet.
export function activityDetail(tool, input = {}, projectDir = null) {
  const path = input.file_path ?? input.notebook_path;
  if (typeof path === "string") {
    const rel = projectDir && isAbsolute(path) ? relative(projectDir, path) : path;
    return clip(rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : basename(path));
  }
  if (tool === "Bash") return clip(input.description) || clip(String(input.command ?? "").split(/\s+/)[0]);
  if (tool === "Glob" || tool === "Grep") return clip(input.pattern);
  if (tool === "WebFetch") {
    try {
      return new URL(input.url).host;
    } catch {
      return "";
    }
  }
  if (tool === "WebSearch") return clip(input.query);
  if (tool === "Artifact") return clip(input.action ?? "publish");
  if (tool === "Skill") return clip(input.skill);
  if (tool.startsWith("mcp__")) return tool.split("__").slice(1).join(" · ");
  return "";
}

export function buildEvent(payload, { now = new Date(), branch = null, transcript = "", launch = null, projectDir = null } = {}) {
  const hook = payload?.hook_event_name;
  const ts = now.toISOString();
  if (hook === "Stop" || hook === "UserPromptSubmit" || hook === "Notification") return sessionEvent(payload, ts);
  if (hook === "PreToolUse" && payload?.tool_name === "AskUserQuestion" && !payload.agent_id) {
    const questions = (payload.tool_input?.questions ?? []).map((q) => q?.question).filter((q) => typeof q === "string" && q.trim()).map((q) => clipText(maskSecrets(q))).slice(0, MAX_QUESTIONS);
    if (!questions.length) return null;
    return { v: 1, ts, type: "wait", agent: "claude", source: "session", session: payload.session_id ?? null, kind: "questions", message: `${questions.length} question${questions.length > 1 ? "s" : ""} dans le terminal`, questions };
  }
  if (hook === "PostToolUse" && payload?.tool_name === "AskUserQuestion") {
    const pairs = askAnswers(payload);
    return pairs.length ? { v: 1, ts, type: "answered", agent: "claude", source: "terminal", session: payload.session_id ?? null, pairs } : null;
  }

  // Action d'un sous-agent en cours (les hooks de l'utilisateur s'exécutent aussi
  // dans les sous-agents, avec agent_id et agent_type).
  const tool = payload?.tool_name;
  if (hook === "PreToolUse" && payload.agent_id && tool && tool !== "Agent" && tool !== "Task") {
    const who = agentOf(payload.agent_type);
    if (!who) return null;
    return { v: 1, ts, type: "activity", agentId: payload.agent_id, agent: who.agent, tool, detail: activityDetail(tool, payload.tool_input, projectDir) };
  }

  if (hook === "SubagentStop") {
    const who = launch ? { agent: launch.agent, source: launch.source ?? "plugin" } : agentOf(payload.agent_type);
    if (!who) return null;
    const closing = typeof payload.last_assistant_message === "string" ? payload.last_assistant_message : lastAssistantText(transcript);
    const handback = handbackText(transcript);
    const text = [handback, closing].filter(Boolean).join("\n\n");
    return {
      v: 1, ts, type: "end", id: launch?.id ?? null, agentId: payload.agent_id ?? null,
      agent: who.agent, source: who.source, us: launch?.us ?? usKey(branch), branch,
      ...endFields(who.agent, text, handback || closing),
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
    const out = execFileSync("git", ["branch", "--show-current"], { cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 2000, windowsHide: true });
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

const { O_WRONLY, O_CREAT, O_TRUNC, O_APPEND, O_NOFOLLOW } = fsConstants;

// Écrit (append : ajoute) sans suivre de lien symbolique : un lien piégé vers un fichier de
// l'utilisateur fait échouer l'écriture (O_NOFOLLOW ; sans lui, sous Windows, lstat d'abord).
export function writeNoFollow(path, text, { append = false } = {}) {
  if (O_NOFOLLOW === undefined) {
    let link = false;
    try {
      link = lstatSync(path).isSymbolicLink();
    } catch {
      // absent : créé
    }
    if (link) throw new Error(`lien symbolique refusé : ${path}`);
  }
  const fd = openSync(path, O_WRONLY | O_CREAT | (append ? O_APPEND : O_TRUNC) | (O_NOFOLLOW ?? 0), 0o644);
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd;
  if (!projectDir) return;
  const journal = join(projectDir, ".claude", "pipeline-events.jsonl");
  const options = { branch: currentBranch(projectDir), projectDir };
  if (payload.hook_event_name === "SubagentStop") {
    options.launch = payload.agent_id ? findLaunch(readTail(journal), payload.agent_id) : null;
    options.transcript = payload.agent_transcript_path ? readTail(payload.agent_transcript_path) : "";
  }
  // Autorisation en attente (marqueur) puis outil exécuté dans la session principale : reprise.
  const waiting = join(projectDir, ".claude", "ottho-waiting");
  if (payload.hook_event_name === "PostToolUse" && !payload.agent_id && !["Agent", "Task", "AskUserQuestion"].includes(payload.tool_name) && existsSync(waiting)) {
    rmSync(waiting, { force: true });
    writeNoFollow(journal, JSON.stringify({ v: 1, ts: new Date().toISOString(), type: "resume", agent: "claude", source: "session", session: payload.session_id ?? null }) + "\n", { append: true });
    return;
  }
  const event = buildEvent(payload, options);
  if (!event) return;
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  writeNoFollow(journal, JSON.stringify(event) + "\n", { append: true });
  if (event.type === "wait" && event.kind !== "questions") writeNoFollow(waiting, event.ts);
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
