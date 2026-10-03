#!/usr/bin/env node
// Pont des réponses du plugin ottho-code-app : réponses de l'utilisateur aux questions des
// agents consignées dans les fichiers (par Claude, depuis le terminal) : docs/questions/*.md,
// specs/*.md ou docs/PRD.md, section « Questions ouvertes ». Claude doit les voir.
//   PreToolUse AskUserQuestion : question déjà répondue refusée, la réponse est donnée à Claude ;
//   sinon, chaque question reçoit le choix « Suivre tes recos » (l'IA décide selon sa recommandation).
//   UserPromptSubmit : les réponses données depuis le dernier message sont ajoutées au contexte
//   (elles priment sur toute hypothèse). Déjà transmises : .claude/ottho-answers-seen.json.
// Jamais bloquant sur une erreur : sortie 0 sans rien écrire.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { readFile as readFileAsync, readdir as readdirAsync } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ITEM_RE = /^\s?[-*]\s+\[[xX]\]\s+(.+?)\s*$/;
const ANSWER_RE = /^\s*>\s?Réponse(?:\s*\([^)]*\))?\s*:\s*(.*)$/i;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const ASKED_BY_RE = /\s*\(posée par [^)]*\)\s*$/i;

// Questions cochées et leur réponse (citation « > Réponse (date) : … », éventuellement sur plusieurs lignes).
export function answeredPairs(markdown) {
  const lines = markdown.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length; i++) {
    const item = ITEM_RE.exec(lines[i]);
    if (!item) continue;
    const first = ANSWER_RE.exec(lines[i + 1] ?? "");
    if (!first) continue;
    const answer = [first[1]];
    for (let j = i + 2; j < lines.length && QUOTE_RE.test(lines[j]) && !ANSWER_RE.test(lines[j]); j++) answer.push(QUOTE_RE.exec(lines[j])[1]);
    pairs.push({ question: item[1].replace(ASKED_BY_RE, "").trim(), answer: answer.join(" ").replace(/\s+/g, " ").trim() });
  }
  return pairs;
}

// Mots porteurs de sens (4 lettres et plus), sans accents ni ponctuation.
const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );

// Même question, éventuellement reformulée : 60 % des mots de la plus courte, 3 au moins.
export function similar(a, b) {
  const A = words(a);
  const B = words(b);
  const common = [...A].filter((w) => B.has(w)).length;
  return common >= 3 && common / Math.min(A.size, B.size) >= 0.6;
}

export function decide(asked, pairs) {
  const matched = [];
  const unmatched = [];
  for (const question of asked) {
    const pair = pairs.find((p) => similar(question, p.question));
    if (pair) matched.push({ asked: question, ...pair });
    else unmatched.push(question);
  }
  return { matched, unmatched };
}

async function answerFiles(projectDir) {
  const list = async (dir) => (await readdirAsync(join(projectDir, dir)).catch(() => [])).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`);
  return [...(await list("docs/questions")), ...(await list("specs")), "docs/PRD.md"];
}

// Choix ajouté à chaque question du sélecteur : laisser Claude trancher selon sa recommandation.
export const FOLLOW_RECO = { label: "Suivre tes recos", description: "Laisse l'IA choisir selon sa recommandation (elle la consigne dans le livrable)" };
const MAX_OPTIONS = 4; // limite du sélecteur AskUserQuestion

export function withFollowReco(input) {
  const questions = Array.isArray(input?.questions) ? input.questions : [];
  let changed = false;
  const next = questions.map((q) => {
    const options = Array.isArray(q?.options) ? q.options : [];
    if (options.length >= MAX_OPTIONS || options.some((o) => /reco/i.test(o?.label ?? ""))) return q;
    changed = true;
    return { ...q, options: [...options, FOLLOW_RECO] };
  });
  return changed ? { ...input, questions: next } : null;
}

export async function guard(payload, projectDir) {
  if (payload?.tool_name !== "AskUserQuestion") return null;
  const asked = (payload.tool_input?.questions ?? []).map((q) => q?.question).filter((q) => typeof q === "string" && q.trim());
  if (!asked.length) return null;
  const pairs = [];
  const sources = new Set();
  for (const file of await answerFiles(projectDir)) {
    const text = await readFileAsync(join(projectDir, file), "utf8").catch(() => null);
    if (!text) continue;
    const found = answeredPairs(text);
    if (found.length) sources.add(file);
    pairs.push(...found);
  }
  const { matched, unmatched } = decide(asked, pairs);
  if (!matched.length) {
    const updatedInput = withFollowReco(payload.tool_input);
    return updatedInput ? { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput } } : null;
  }
  const reason = [
    `L'utilisateur a déjà répondu dans Ottho Builder 2 (${[...sources].join(", ")}). Utilise ces réponses et ne repose pas ces questions :`,
    ...matched.map((m) => `- ${m.asked} → ${m.answer}`),
    unmatched.length ? `Repose seulement celles-ci, qui restent sans réponse : ${unmatched.map((q) => `« ${q} »`).join(" ; ")}` : "Toutes tes questions ont une réponse : continue avec elles.",
  ].join("\n");
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

async function allPairs(projectDir) {
  const pairs = [];
  for (const file of await answerFiles(projectDir)) {
    const text = await readFileAsync(join(projectDir, file), "utf8").catch(() => null);
    if (text) pairs.push(...answeredPairs(text).map((p) => ({ ...p, file })));
  }
  return pairs;
}

const keyOf = (p) => createHash("sha1").update(`${p.question}\n${p.answer}`).digest("hex").slice(0, 16);

// Réponses consignées depuis le dernier message de l'utilisateur : ajoutées au contexte de Claude.
export async function newAnswersContext(projectDir) {
  const statePath = join(projectDir, ".claude", "ottho-answers-seen.json");
  let seen = [];
  try {
    seen = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    // premier passage
  }
  const known = new Set(Array.isArray(seen) ? seen : []);
  const pairs = await allPairs(projectDir);
  const fresh = pairs.filter((p) => !known.has(keyOf(p)));
  if (!pairs.length) return null;
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  writeFileSync(statePath, JSON.stringify(pairs.map(keyOf)));
  if (!fresh.length) return null;
  const files = [...new Set(fresh.map((p) => p.file))].join(", ");
  const context = [
    `Réponses de l'utilisateur consignées dans Ottho Builder 2 depuis son dernier message (${files}). Elles priment sur toute hypothèse : ne les remplace pas, transmets-les aux agents concernés et ne repose pas ces questions.`,
    ...fresh.map((p) => `- ${p.question} → ${p.answer}`),
  ].join("\n");
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } };
}

async function main() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd;
  if (!projectDir) return;
  const out = payload.hook_event_name === "UserPromptSubmit" ? await newAnswersContext(projectDir) : await guard(payload, projectDir);
  if (out) process.stdout.write(JSON.stringify(out));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
