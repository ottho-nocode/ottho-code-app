// Questions des agents : celles des livrables (section « Questions ouvertes » des
// specs, du PRD et de docs/questions/) et celles posées en direct (bloc
// « Questions pour toi » recopié par le hook dans l'événement de fin).
// Les livrables font foi ; une question en direct déjà présente n'est pas doublée.
// Lecture seule : l'élève répond dans le CLI.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { filesByUs, usKey } from "./features.mjs";
import { readText, sha1 } from "./files.mjs";

export const MAX_LIVE_QUESTIONS = 10;
export const MAX_QUESTION_LENGTH = 2000;
// Au-delà : coupé sur le dernier mot entier, suivi de « … ».
const clipText = (text) => (text.length <= MAX_QUESTION_LENGTH ? text : `${text.slice(0, MAX_QUESTION_LENGTH - 1).replace(/\s+\S*$/, "")}…`);

const HEADING_RE = /^(#{2,3})\s*(?:\d+[.)]\s*)?Questions ouvertes\b/i;
const SECTION_END_RE = /^(#{1,6}\s|---\s*$)/;
const ITEM_RE = /^\s?[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const ANSWER_RE = /^Réponse(?:\s*\((\d{4}-\d{2}-\d{2})\))?\s*:\s*(.*)$/i;
const ASKED_BY_RE = /\s*\(posée par ([\w:-]+)\)\s*$/i;


export function normalizeQuestion(text) {
  return text
    .replace(ASKED_BY_RE, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s?.!:…]+$/u, "")
    .trim();
}

// Items de la section « Questions ouvertes ». line = index (0) de la ligne de l'item.
export function parseOpenQuestions(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const start = lines.findIndex((l) => HEADING_RE.test(l));
  if (start === -1) return { items: [], sectionFound: false };
  const items = [];
  for (let i = start + 1; i < lines.length && !SECTION_END_RE.test(lines[i]); i++) {
    const m = ITEM_RE.exec(lines[i]);
    if (!m || /\{\{.*\}\}/.test(m[2])) continue;
    const askedBy = ASKED_BY_RE.exec(m[2])?.[1]?.split(":").pop() ?? null;
    const item = {
      text: m[2].replace(ASKED_BY_RE, "").trim(),
      answered: m[1] !== " ",
      answer: null,
      answeredAt: null,
      askedBy,
      line: i,
    };
    const quoted = [];
    while (i + 1 < lines.length && QUOTE_RE.test(lines[i + 1])) quoted.push(QUOTE_RE.exec(lines[++i])[1]);
    const first = quoted.length ? ANSWER_RE.exec(quoted[0]) : null;
    if (first) {
      item.answeredAt = first[1] ?? null;
      item.answer = [first[2], ...quoted.slice(1)].join("\n").trim() || null;
    }
    items.push(item);
  }
  return { items, sectionFound: true };
}


const questionId = (origin, file, askedBy, text) =>
  `q${sha1(`${origin}|${file}|${askedBy}|${normalizeQuestion(text)}`).slice(0, 16)}`;

// Fichiers pouvant porter des questions, dans l'ordre d'affichage.
async function livrableFiles(projectDir) {
  const specs = await filesByUs(join(projectDir, "specs"));
  let qNames = [];
  try {
    qNames = (await readdir(join(projectDir, "docs", "questions"))).sort();
  } catch {
    // pas de dossier docs/questions
  }
  const files = [];
  for (const [us, name] of [...specs].sort(([a], [b]) => Number(a.slice(3)) - Number(b.slice(3)))) {
    files.push({ file: `specs/${name}`, us, askedBy: "spec-writer" });
  }
  for (const name of qNames) {
    const us = /^US-\d+\.md$/i.test(name) ? usKey(name) : null;
    if (us) files.push({ file: `docs/questions/${name}`, us, askedBy: "brainstorming" });
  }
  files.push({ file: "docs/PRD.md", us: null, askedBy: "spec-writer" });
  if (qNames.includes("projet.md")) files.push({ file: "docs/questions/projet.md", us: null, askedBy: "brainstorming" });
  return { files, specs };
}

// Mots porteurs de sens (4 lettres et plus), sans accents : repérer une même question
// reformulée (réponse donnée dans le sélecteur du terminal). Même règle que le hook
// answered-guard du plugin : 60 % des mots de la plus courte, 3 au moins.
const words = (s) =>
  new Set(
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
  );
export function similarQuestion(a, b) {
  const A = words(a);
  const B = words(b);
  const common = [...A].filter((w) => B.has(w)).length;
  return common >= 3 && common / Math.min(A.size, B.size) >= 0.6;
}

// terminalAnswers : réponses données dans le sélecteur du terminal (événements « answered »).
// lastReplyAt : dernière réponse de l'utilisateur dans le terminal (message ou sélecteur).
export async function collectQuestions({ projectDir, runs, terminalAnswers = [], lastReplyAt = null }) {
  const { files, specs } = await livrableFiles(projectDir);
  // Fichiers déjà lus : présents ou non (le PRD reçoit les questions de niveau projet s'il existe).
  const present = new Map();
  const questions = [];
  const seen = new Set(); // `${us}|${texte normalisé}` déjà présents dans un livrable

  for (const f of files) {
    const text = await readText(join(projectDir, f.file));
    present.set(f.file, text !== null);
    if (text === null) continue;
    for (const item of parseOpenQuestions(text).items) {
      const key = `${f.us}|${normalizeQuestion(item.text)}`;
      if (seen.has(key)) continue; // déjà repris dans la spec
      seen.add(key);
      const askedBy = item.askedBy ?? f.askedBy;
      questions.push({
        id: questionId("livrable", f.file, askedBy, item.text),
        origin: "livrable",
        us: f.us,
        askedBy,
        text: item.text,
        answered: item.answered,
        answer: item.answer,
        answeredAt: item.answeredAt,
        askedAt: null,
        line: item.line,
        target: { file: f.file },
      });
    }
  }

  const exists = async (file) => {
    if (!present.has(file)) present.set(file, (await readText(join(projectDir, file))) !== null);
    return present.get(file);
  };
  const targetFor = async (us) => {
    if (us) {
      const spec = specs.get(us);
      return { file: spec ? `specs/${spec}` : `docs/questions/${us}.md` };
    }
    return { file: (await exists("docs/PRD.md")) ? "docs/PRD.md" : "docs/questions/projet.md" };
  };

  // Dernière exécution de chaque agent sur chaque feature (runs chronologiques).
  const last = new Map();
  for (const run of runs) last.set(`${run.us}|${run.agent}`, run);
  for (const run of last.values()) {
    if (run.state !== "done" || !Array.isArray(run.questions)) continue;
    for (const raw of run.questions.slice(0, MAX_LIVE_QUESTIONS)) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const text = clipText(raw.trim());
      const key = `${run.us}|${normalizeQuestion(text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const target = await targetFor(run.us);
      questions.push({
        id: questionId("direct", String(run.us), run.agent, text),
        origin: "direct",
        us: run.us,
        askedBy: run.agent,
        text,
        answered: false,
        answer: null,
        answeredAt: null,
        askedAt: run.end,
        line: null,
        target,
      });
    }
  }
  // Répondues dans le terminal (sélecteur de Claude Code) : plus « en attente » dans l'app.
  for (const q of questions) {
    if (q.answered) continue;
    const pair = terminalAnswers.findLast((p) => typeof p?.question === "string" && similarQuestion(p.question, q.text));
    if (pair) Object.assign(q, { answered: true, answer: String(pair.answer ?? ""), answeredIn: "terminal" });
    // Question d'un agent suivie d'une réponse de l'utilisateur dans le terminal : on y a répondu là.
    else if (q.origin === "direct" && lastReplyAt && q.askedAt && lastReplyAt > q.askedAt) Object.assign(q, { answered: true, answer: null, answeredIn: "terminal" });
  }
  return questions;
}
