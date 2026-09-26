#!/usr/bin/env node
// Hook PreToolUse / PostToolUse (matcher Agent|Task) du plugin ottho-code-app.
// Journalise le début et la fin des sub-agents dans <projet>/.claude/pipeline-events.jsonl,
// lu par l'app ottho-pipeline. Métadonnées seulement : ni prompt ni réponse, sauf les
// questions du bloc « Questions pour toi » (10 au plus, 300 caractères chacune).
// Ne bloque jamais Claude Code : toute erreur est avalée, sortie 0.
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
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

export function buildEvent(payload, { now = new Date(), branch = null } = {}) {
  const type = payload?.hook_event_name === "PreToolUse" ? "start" : payload?.hook_event_name === "PostToolUse" ? "end" : null;
  const input = payload?.tool_input ?? {};
  const raw = input.subagent_type;
  if (!type || typeof raw !== "string" || !raw) return null;
  const prefixed = raw.includes(":");
  const agent = prefixed ? raw.split(":").pop() : raw;
  const event = {
    v: 1,
    ts: now.toISOString(),
    type,
    id: payload.tool_use_id ?? null,
    agent,
    source: prefixed ? "plugin" : "projet",
    us: usKey(`${input.prompt ?? ""}\n${input.description ?? ""}`) ?? usKey(branch),
    branch,
  };
  if (type === "end") {
    const text = textOf(payload.tool_response);
    event.next = lastGroup(NEXT_RE, text)?.split(":").pop() ?? null;
    event.verdict =
      agent === "code-reviewer" ? lastGroup(REVIEW_RE, text)
      : agent === "tester" ? (lastGroup(TESTS_RE, text)?.toUpperCase() ?? null)
      : null;
    event.questions = questionsOf(text);
  }
  return event;
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
  const event = buildEvent(payload, { branch: currentBranch(projectDir) });
  if (!event) return;
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  appendFileSync(join(projectDir, ".claude", "pipeline-events.jsonl"), JSON.stringify(event) + "\n");
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
