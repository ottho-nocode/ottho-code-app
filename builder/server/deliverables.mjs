// Livrables soumis à la validation de l'utilisateur (spec, maquette, plan).
// L'état vit dans le fichier : la dernière entrée de la section « Historique »
// dit s'il est validé (validation donnée dans le CLI ; l'app ne fait que lire).
// Le navigateur ne donne jamais de chemin : { us, agent } suffit, le fichier est
// retrouvé dans la liste fermée ci-dessous.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { usKey } from "./features.mjs";
import { HttpError, readText } from "./files.mjs";

export const DELIVERABLES = [
  { agent: "spec-writer", dir: "specs" },
  { agent: "designer", dir: "design" },
  { agent: "architect", dir: "plans" },
];
export const IMAGE_RE = /\.(png|jpe?g|webp|svg)$/i;
export const SCREEN_RE = /\.dc\.html$/i;
// Aperçu d'écran : canevas Claude Design (.dc.html) et pages HTML de maquettes, sous design/.
export const PREVIEW_RE = /\.html$/i;
// Maquettes de niveau projet (écrans clés) : canevas copié de Claude Design, ou pages HTML.
const PROJECT_MOCKUP_DIRS = ["projet", "maquettes"];
export const CHARTE_FILE = "design/charte.md";
// Livrables de niveau projet (sans feature), un par agent : la charte du designer, le PRD
// de spec-writer, l'architecture d'architect.
export const PROJECT_DOCS = [
  { agent: "designer", kind: "charte", file: CHARTE_FILE },
  { agent: "spec-writer", kind: "prd", file: "docs/PRD.md" },
  { agent: "architect", kind: "architecture", file: "docs/architecture.md" },
];
const CLAUDE_LINK_RE = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/g;
const MAX_IMAGES = 12;

const HISTORY_RE = /^#{2,3}\s*(?:\d+[.)]\s*)?Historique\b/i;
const SECTION_END_RE = /^(#{1,6}\s|---\s*$)/;
const ENTRY_RE = /^\s*[-*]\s+(.*)$/;
// « Validé(e) par l'utilisateur », jamais « non validé(e) par l'utilisateur ».
const VALIDATED_RE = /(?<!\bnon[\s-]*)validée?\s+par\s+l['’]utilisateur/i;

function historySection(lines) {
  const start = lines.findIndex((l) => HISTORY_RE.test(l));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !SECTION_END_RE.test(lines[end])) end++;
  return { start, end };
}

export function historyState(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const section = historySection(lines);
  const entries = section ? lines.slice(section.start + 1, section.end).filter((l) => ENTRY_RE.test(l)) : [];
  const last = entries.at(-1) ?? "";
  if (!VALIDATED_RE.test(last)) return { validated: false, validatedAt: null };
  return { validated: true, validatedAt: /(\d{4}-\d{2}-\d{2})/.exec(last)?.[1] ?? null };
}

const linksOf = (text) => [...new Set(text.match(CLAUDE_LINK_RE) ?? [])];
// Nature de chaque lien d'après la ligne qui l'annonce : « > Maquettes : … » ou « > Design system : … ».
const linkKindsOf = (text, links) =>
  links.map((url) => {
    const line = text.split("\n").find((l) => l.includes(url)) ?? "";
    return /maquette|canevas|écrans/i.test(line) ? "maquettes" : /design system/i.test(line) ? "design system" : "claude design";
  });

// Écrans d'un canevas Claude Design rangés par le designer (fichiers .dc.html) :
// ordre, titres et tailles tirés du canvas.json voisin s'il existe.
async function screensOf(projectDir, files, pattern = SCREEN_RE) {
  const screens = [];
  const indexes = new Map();
  for (const rel of files.filter((n) => pattern.test(n))) {
    const folder = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    if (!indexes.has(folder)) {
      const raw = await readText(join(projectDir, "design", folder, "canvas.json"));
      let index = null;
      try {
        index = raw ? JSON.parse(raw) : null;
      } catch {
        index = null;
      }
      indexes.set(folder, index);
    }
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    const board = indexes.get(folder)?.boards?.[name] ?? {};
    const order = indexes.get(folder)?.order ?? [];
    screens.push({
      path: `design/${rel}`,
      title: typeof board.title === "string" && board.title ? board.title : name.replace(SCREEN_RE, "").replace(PREVIEW_RE, ""),
      x: Number.isFinite(board.x) ? board.x : null,
      y: Number.isFinite(board.y) ? board.y : null,
      w: Number(board.w) || 1280,
      h: Number(board.h) || 800,
      rank: order.includes(name) ? order.indexOf(name) : order.length,
    });
  }
  // Position sur le canevas (celle de canvas.json) ; sans position, à la suite sur une ligne.
  // Sans position : sur une ligne, sous les écrans placés (jamais par-dessus).
  const sorted = screens.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
  const placedOnes = sorted.filter((sc) => sc.x !== null && sc.y !== null);
  const below = placedOnes.length ? Math.max(...placedOnes.map((sc) => sc.y + sc.h)) + 160 : 0;
  let cursor = 0;
  return sorted.map(({ rank, ...sc }) => {
    if (sc.x !== null && sc.y !== null) return sc;
    const placed = { ...sc, x: cursor, y: below };
    cursor += placed.w + 80;
    return placed;
  });
}

// Maquettes du designer : liens Claude Design cités dans le livrable, écrans du
// canevas, images exportées (Pencil) et fichiers .pen de la feature, sous design/.
async function mockupsOf(projectDir, us, text) {
  let names = [];
  try {
    names = (await readdir(join(projectDir, "design"), { recursive: true })).map((n) => n.split("\\").join("/")).sort();
  } catch {
    // pas de dossier design/
  }
  const own = names.filter((n) => usKey(n.split("/")[0]) === us);
  return {
    links: linksOf(text),
    screens: await screensOf(projectDir, own),
    images: own.filter((n) => IMAGE_RE.test(n)).slice(0, MAX_IMAGES).map((n) => `design/${n}`),
    pen: own.filter((n) => n.endsWith(".pen")).map((n) => `design/${n}`),
  };
}

// Maquettes du projet (écrans clés, niveau projet) : rattachées à la charte du designer.
async function projectMockupsOf(projectDir, charteText) {
  let names = [];
  try {
    names = (await readdir(join(projectDir, "design"), { recursive: true })).map((n) => n.split("\\").join("/")).sort();
  } catch {
    // pas de dossier design/
  }
  const own = names.filter((n) => PROJECT_MOCKUP_DIRS.includes(n.split("/")[0]) && n.includes("/"));
  // Liens Claude Design : la charte d'abord, puis les autres fichiers Markdown de design/ (ecrans.md…)
  // et du dossier des maquettes du projet ; les livrables de feature (US-XX-*.md) ont les leurs.
  const others = names.filter((n) => n.endsWith(".md") && n !== "charte.md" && !/^US-\d+/i.test(n) && (!n.includes("/") || PROJECT_MOCKUP_DIRS.includes(n.split("/")[0])));
  let text = charteText;
  for (const n of others) text += `\n${(await readText(join(projectDir, "design", n))) ?? ""}`;
  const links = linksOf(text);
  return {
    links,
    linkKinds: linkKindsOf(text, links),
    screens: await screensOf(projectDir, own, PREVIEW_RE),
    images: own.filter((n) => IMAGE_RE.test(n)).slice(0, MAX_IMAGES).map((n) => `design/${n}`),
    pen: [],
  };
}

// Livrable Markdown de chaque feature (le premier par ordre alphabétique) ; les
// sous-dossiers et images d'une feature (exports de maquettes) sont ignorés ici.
async function markdownByUs(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return new Map();
  }
  const map = new Map();
  for (const name of names.filter((n) => /^US-\d+.*\.md$/i.test(n)).sort()) {
    const key = usKey(name);
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

export async function collectDeliverables(projectDir) {
  const list = [];
  for (const d of DELIVERABLES) {
    const files = await markdownByUs(join(projectDir, d.dir));
    for (const [us, name] of files) {
      const file = `${d.dir}/${name}`;
      const text = await readText(join(projectDir, file));
      if (text === null) continue;
      const item = { us, agent: d.agent, file, ...historyState(text) };
      if (d.agent === "designer") item.mockups = await mockupsOf(projectDir, us, text);
      list.push(item);
    }
  }
  // Livrables de niveau projet (us null) : charte, PRD, architecture.
  for (const doc of PROJECT_DOCS) {
    const text = await readText(join(projectDir, doc.file));
    if (text === null) continue;
    list.push({
      us: null,
      agent: doc.agent,
      kind: doc.kind,
      file: doc.file,
      ...historyState(text),
      ...(doc.kind === "charte" ? { mockups: await projectMockupsOf(projectDir, text) } : {}),
    });
  }
  return list;
}

async function locate(projectDir, us, agent) {
  const d = DELIVERABLES.find((x) => x.agent === agent);
  if (us === null || us === undefined || us === "") {
    // Sans feature : le livrable de niveau projet de l'agent (charte, PRD, architecture).
    const doc = PROJECT_DOCS.find((x) => x.agent === agent);
    if (!doc) throw new HttpError(400, "Livrable inconnu.");
    return { file: doc.file, abs: join(projectDir, doc.file) };
  }
  if (!d || typeof us !== "string") throw new HttpError(400, "Livrable inconnu.");
  const name = (await markdownByUs(join(projectDir, d.dir))).get(us);
  if (!name) throw new HttpError(404, "Livrable introuvable.");
  const file = `${d.dir}/${name}`;
  return { file, abs: join(projectDir, file) };
}

export async function readDeliverable({ projectDir, us, agent }) {
  const { file, abs } = await locate(projectDir, us, agent);
  const content = await readText(abs);
  if (content === null) throw new HttpError(404, "Livrable introuvable.");
  return { file, content };
}
