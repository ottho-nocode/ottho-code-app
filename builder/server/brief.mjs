// Brief du projet, écrit par Claude depuis le CLI (sous-commande brief) : docs/brief.md, lu par brainstorming
// (point de départ du cadrage) et par spec-writer (PRD). Il suit le canevas en six blocs du
// module « De l'idée au projet validé » (formation Claude Builder, Ottho Academy) : mêmes
// champs, mêmes consignes, mêmes critères que la vérification IA de l'academy
// (ottho-academy, src/lib/projects/blocks.ts). Markdown pour les agents ; les données du
// canevas suivent dans un commentaire (affichés par l'app, repris à la réécriture).
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HttpError, atomicWrite, readText } from "./files.mjs";

export const BRIEF_FILE = "docs/brief.md";
const DATA_RE = /<!-- ottho-brief (\{[\s\S]*\}) -->\s*$/;
const SHORT = 300;
const LONG = 5000;
const MAX_PERSONAS = 5;

export const POSTURE = [
  "Ce n'est pas toi qui décides si ton idée est bonne : c'est le marché.",
  "Pas d'ego dans l'idée : tu vas la modifier, en jeter des morceaux, en reprendre d'autres.",
  "Le test minimal : ton idée s'annonce en une seule phrase, comprise par un inconnu en dix secondes.",
];

// Canevas en six blocs (repris de l'academy). persona : plusieurs, jamais une seule.
export const BLOCKS = [
  {
    key: "domaine", title: "Le domaine",
    intro: "Le terrain que tu apprécies ou maîtrises.",
    fields: [
      { key: "domaine", label: "Ton domaine / thème", type: "text" },
      { key: "legitimite", label: "Ta légitimité", type: "textarea", help: "Langage maîtrisé, audience connue, unfair advantage." },
    ],
    rubric: [
      "L'auteur maîtrise le langage du milieu",
      "L'auteur connaît personnellement l'audience",
      "Un avantage déloyal (accès, réseau, expertise rare) est nommé",
    ],
  },
  {
    key: "probleme", title: "Le problème",
    intro: "Un problème dur : douloureux, urgent, récurrent, et conscient.",
    fields: [
      { key: "description", label: "Le problème", type: "textarea" },
      { key: "vecu", label: "L'as-tu vécu toi-même ?", type: "textarea" },
      { key: "autres", label: "Qui d'autre le vit (nommé) ?", type: "textarea" },
    ],
    rubric: [
      "Le problème est douloureux (impact négatif réel)",
      "Le problème est urgent (la cible cherche déjà une solution)",
      "Le problème est récurrent",
      "La cible a conscience du problème",
      "Ce n'est pas un problème temporaire ni isolé de son contexte",
    ],
  },
  {
    key: "cible", title: "La cible quantifiable",
    intro: "5-10% d'un marché, 100k-1M de personnes, déjà en recherche.",
    fields: [
      { key: "marche", label: "Marché visé", type: "text" },
      { key: "pourcentage", label: "% du marché concerné", type: "text" },
      { key: "volume", label: "Volume estimé (personnes)", type: "text" },
      { key: "recherche", label: "Comment cherchent-ils déjà une solution ?", type: "textarea" },
    ],
    rubric: [
      "La cible représente ~5 à 10% d'un marché identifiable",
      "Le volume absolu est entre 100k et 1M",
      "La cible cherche déjà activement une solution",
    ],
  },
  {
    key: "persona", title: "La persona", multiple: true,
    intro: "Inventée puis comparée à de vrais utilisateurs. Plusieurs, jamais une seule.",
    fields: [
      { key: "identite", label: "Identité (prénom, âge, rôle, lieu)", type: "text" },
      { key: "contexte", label: "Contexte (personnel / pro / techno)", type: "textarea" },
      { key: "objectifs", label: "3 objectifs prioritaires", type: "textarea" },
      { key: "freins", label: "Freins / craintes", type: "textarea" },
      { key: "techno", label: "Profil techno", type: "textarea" },
      { key: "interviews", label: "Nb de personnes interviewées", type: "number" },
    ],
    rubric: [
      "La persona est sourcée (interviews/observations), pas un fantasme",
      "Le contexte va au-delà de la démographie (situations, contraintes)",
      "Les motivations sont claires et priorisées",
      "La démarche est itérative (datée, à réviser)",
    ],
  },
  {
    key: "solution", title: "La solution",
    intro: "Réalisable, formulée Modèle + Action + Comment.",
    fields: [
      { key: "modele", label: "Modèle (automatisation, mise en relation…)", type: "text" },
      { key: "action", label: "Action", type: "text" },
      { key: "comment", label: "Comment", type: "text" },
    ],
    rubric: [
      "La solution est réalisable",
      "La formulation évite le vague (\"augmenter\", \"par IA\" sans bénéfice concret)",
    ],
  },
  {
    key: "uvp", title: "La phrase de valeur (Steve Blank)",
    intro: "J'aide [cible] à résoudre [problème] grâce à [solution].",
    fields: [{ key: "phrase", label: "Ta phrase", type: "textarea", help: "J'aide ... à résoudre ... grâce à ..." }],
    rubric: ["Moins de 25 mots", "Compréhensible par un inconnu en 10 secondes", "Les 3 slots (cible, problème, solution) sont remplis"],
  },
];

const emptyBlock = (b) => Object.fromEntries(b.fields.map((f) => [f.key, ""]));

export const emptyBrief = () => ({
  name: "",
  ...Object.fromEntries(BLOCKS.map((b) => [b.key, b.multiple ? [] : emptyBlock(b)])),
});

const text = (value, max, field) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") throw new HttpError(400, `Champ invalide : ${field}.`);
  if (value.length > max) throw new HttpError(400, `Champ trop long : ${field}.`);
  return value.trim();
};
const cleanFields = (block, input) =>
  Object.fromEntries(block.fields.map((f) => [f.key, text(input?.[f.key], f.type === "textarea" ? LONG : SHORT, `${block.key}.${f.key}`)]));

// Données reçues (JSON de la sous-commande brief, exemple) : seuls les champs du canevas, bornés.
export function cleanBrief(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Brief attendu.");
  const out = { name: text(input.name, SHORT, "name") };
  for (const b of BLOCKS) {
    if (!b.multiple) {
      out[b.key] = cleanFields(b, input[b.key]);
      continue;
    }
    const list = input[b.key] ?? [];
    if (!Array.isArray(list)) throw new HttpError(400, `Liste attendue : ${b.key}.`);
    if (list.length > MAX_PERSONAS) throw new HttpError(400, `Trop d'éléments : ${b.key}.`);
    out[b.key] = list.map((item) => cleanFields(b, item)).filter((item) => Object.values(item).some(Boolean));
  }
  return out;
}

// Brief de la première version de l'onboarding (nom, problème, personas…) : repris au mieux.
function migrate(old) {
  if (!old || typeof old !== "object" || "domaine" in old) return old;
  return {
    name: old.name,
    probleme: { description: old.problem ?? "" },
    persona: (old.personas ?? []).map((p) => ({ identite: p?.name ?? "", objectifs: p?.need ?? "", freins: p?.pain ?? "" })),
    uvp: { phrase: old.pitch ?? "" },
  };
}

// Complet : un nom, et le champ principal de chaque bloc (au moins une persona identifiée).
// missingBlocks donne ce qui manque : « Le nom du projet » puis le titre de chaque bloc vide.
export const missingBlocks = (b) => [
  ...(b.name ? [] : ["Le nom du projet"]),
  ...BLOCKS.filter((block) => !(block.multiple ? b[block.key].some((p) => p[block.fields[0].key]) : b[block.key][block.fields[0].key])).map((block) => block.title),
];
export const isComplete = (b) => missingBlocks(b).length === 0;

export const wordCount = (s) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

export function renderBrief(b, date) {
  const out = [
    `# Brief projet : ${b.name || "(sans nom)"}`,
    "",
    `> Écrit depuis Claude Code le ${date}, sur le canevas en six blocs du module « De l'idée au projet validé » (Claude Builder).`,
    "> Point de départ de brainstorming : ne pas redemander ce qui est rempli, vérifier chaque bloc avec ses critères, challenger ce qui ne passe pas.",
    "",
  ];
  const fieldLines = (block, values) =>
    block.fields.filter((f) => values[f.key]).map((f) => (values[f.key].includes("\n") ? `- **${f.label}** :\n\n  ${values[f.key].replace(/\n/g, "\n  ")}\n` : `- **${f.label}** : ${values[f.key]}`));
  BLOCKS.forEach((block, i) => {
    out.push(`## ${i + 1}. ${block.title}`, "", `_${block.intro}_`, "");
    if (block.multiple) {
      const items = b[block.key];
      if (!items.length) out.push("(à remplir)", "");
      items.forEach((item, j) => {
        out.push(`### Persona ${j + 1}${item.identite ? ` : ${item.identite}` : ""}`, "");
        out.push(...fieldLines({ fields: block.fields.filter((f) => f.key !== "identite") }, item), "");
      });
    } else {
      const lines = fieldLines(block, b[block.key]);
      out.push(...(lines.length ? lines : ["(à remplir)"]), "");
      if (block.key === "uvp" && b.uvp.phrase) out.push(`(${wordCount(b.uvp.phrase)} mots)`, "");
    }
    out.push("**Critères à vérifier** :", "", ...block.rubric.map((r) => `- [ ] ${r}`), "");
  });
  // Un « --> » tapé par l'utilisateur ne doit pas refermer le commentaire.
  out.push(`<!-- ottho-brief ${JSON.stringify(b).replace(/-->/g, "--\\u003e")} -->`, "");
  return out.join("\n");
}

export async function readBrief(projectDir) {
  const base = { blocks: BLOCKS, posture: POSTURE, file: BRIEF_FILE };
  const md = await readText(join(projectDir, BRIEF_FILE));
  if (md === null) return { ...base, exists: false, complete: false, data: emptyBrief() };
  let data = emptyBrief();
  const m = DATA_RE.exec(md);
  try {
    if (m) data = { ...emptyBrief(), ...cleanBrief({ ...emptyBrief(), ...migrate(JSON.parse(m[1])) }) };
  } catch {
    // commentaire abîmé (fichier édité à la main) : canevas vide, le Markdown reste
  }
  // Brief écrit à la main (sans commentaire) : présent, jugé complet s'il a du contenu.
  const complete = m ? isComplete(data) : md.trim().length > 200;
  return { ...base, exists: true, complete, data };
}

export const isEmptyBrief = (b) => !b.name && BLOCKS.every((block) => (block.multiple ? !b[block.key].length : Object.values(b[block.key]).every((v) => !v)));
const BACKUPS = ".claude/brief-backups";
const MAX_BACKUPS = 20;

export async function writeBrief(projectDir, input, date) {
  const brief = cleanBrief(input);
  const path = join(projectDir, BRIEF_FILE);
  const previous = await readText(path);
  if (previous !== null) {
    // Un brief vide ne doit jamais effacer un brief rempli.
    const current = await readBrief(projectDir);
    if (isEmptyBrief(brief) && (!isEmptyBrief(current.data) || !DATA_RE.test(previous))) {
      throw new HttpError(409, `Le brief enregistré est rempli : il n'est pas remplacé par un brief vide (${BRIEF_FILE} reste inchangé).`);
    }
    // Copie de sauvegarde de la version remplacée (les 20 dernières).
    const next = renderBrief(brief, date);
    if (next !== previous) {
      const dir = join(projectDir, BACKUPS);
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
      await writeFile(join(dir, `brief-${stamp}.md`), previous);
      const old = (await readdir(dir)).filter((f) => f.startsWith("brief-")).sort();
      for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) await rm(join(dir, f), { force: true });
    }
  }
  await atomicWrite(path, renderBrief(brief, date));
  return { complete: isComplete(brief) };
}

// Exemples de brief (démo, projets types) : gardés hors du projet, dans ~/.ottho-pipeline/briefs,
// proposés par Claude au cadrage d'un nouveau projet (brief --list, --preset), enregistrés depuis le
// brief d'un projet (brief --save).
const slugOf = (name) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export async function listPresets(presetsDir) {
  const files = (await readdir(presetsDir).catch(() => [])).filter((f) => f.endsWith(".json")).sort();
  const out = [];
  for (const f of files) {
    try {
      const saved = JSON.parse(await readFile(join(presetsDir, f), "utf8"));
      out.push({ slug: f.replace(/\.json$/, ""), name: String(saved.name ?? f), savedAt: saved.savedAt ?? null, brief: { ...emptyBrief(), ...cleanBrief(saved.brief) } });
    } catch {
      // exemple illisible : ignoré
    }
  }
  return out;
}

export async function savePreset(presetsDir, name, input) {
  const clean = typeof name === "string" ? name.trim().slice(0, SHORT) : "";
  const slug = slugOf(clean);
  if (!slug) throw new HttpError(400, "Donne un nom à l'exemple (le nom du projet).");
  const brief = cleanBrief(input);
  const file = join(presetsDir, `${slug}.json`);
  // replaced : un exemple du même nom existait (il est remplacé, pas dupliqué).
  const replaced = (await readText(file)) !== null;
  await atomicWrite(file, JSON.stringify({ name: clean, savedAt: new Date().toISOString(), brief }, null, 2));
  return { slug, replaced };
}
