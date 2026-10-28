// Lecture seule des fichiers produits par les agents (historique du pipeline) :
// texte uniquement, jamais un dossier ou fichier caché (.env, .git, .claude),
// ni node_modules ou dist, chemin confiné au projet, 512 Ko au plus.
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { HttpError } from "./files.mjs";

const TEXT_EXT = new Set([
  ".md", ".mdx", ".txt", ".json", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss",
  ".html", ".yml", ".yaml", ".toml", ".sql", ".sh", ".py", ".dc.html",
]);
const EXCLUDED = new Set(["node_modules", "dist", "build", ".git", ".next"]);
const MAX_VIEW = 512 * 1024;

export async function readProjectFile(projectDir, rel) {
  if (typeof rel !== "string" || !rel || isAbsolute(rel)) throw new HttpError(400, "Chemin invalide.");
  const clean = normalize(rel).split(sep).join("/");
  const parts = clean.split("/");
  if (parts.some((p) => p === ".." || p.startsWith(".") || EXCLUDED.has(p))) throw new HttpError(404, "Fichier non consultable.");
  if (!TEXT_EXT.has(extname(clean).toLowerCase())) throw new HttpError(404, "Seuls les fichiers texte sont consultables.");
  const root = resolve(projectDir);
  const file = resolve(root, clean);
  if (!file.startsWith(root + sep)) throw new HttpError(404, "Fichier non consultable.");
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "Fichier introuvable.");
  if (info.size > MAX_VIEW) throw new HttpError(413, "Fichier trop gros pour être affiché.");
  return { path: clean, content: await readFile(file, "utf8"), kind: /\.mdx?$/i.test(clean) ? "markdown" : "text" };
}

// Documents Markdown du projet (bouton « Documents ») : mêmes exclusions que la lecture,
// liens symboliques jamais suivis. Racine d'abord, puis les dossiers de la méthode.
const DOC_EXT = /\.mdx?$/i;
const GROUP_ORDER = ["", "specs", "design", "plans", "docs"];
const MAX_DOCS = 500;
const MAX_DEPTH = 8;

export async function listProjectDocs(projectDir) {
  const root = resolve(projectDir);
  const found = [];
  async function walk(rel, depth) {
    if (depth > MAX_DEPTH || found.length >= MAX_DOCS) return;
    const entries = await readdir(join(root, rel), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile() && DOC_EXT.test(entry.name) && found.length < MAX_DOCS) found.push(path);
    }
  }
  await walk("", 0);
  const rank = (path) => {
    const top = path.includes("/") ? path.split("/")[0] : "";
    const i = GROUP_ORDER.indexOf(top);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  const dir = (path) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
  const byName = (a, b) => a.localeCompare(b, "fr", { sensitivity: "base" });
  found.sort((a, b) => rank(a) - rank(b) || byName(dir(a), dir(b)) || byName(a, b));
  return Promise.all(
    found.map(async (path) => {
      const info = await stat(join(root, path));
      return { path, size: info.size, mtime: info.mtime.toISOString() };
    }),
  );
}
