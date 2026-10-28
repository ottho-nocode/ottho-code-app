// Éléments de marque fournis par l'élève (logo, images, polices, charte en PDF),
// déposés dans design/assets/ depuis le CLI, pour le designer (charte, maquettes) et le
// développeur. L'app les liste en lecture seule ; types limités.
import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

export const ASSETS_DIR = "design/assets";
const KINDS = {
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"],
  font: [".woff2", ".woff", ".ttf", ".otf"],
  document: [".pdf"],
};

const kindOfExt = (ext) => Object.keys(KINDS).find((kind) => KINDS[kind].includes(ext)) ?? null;

export const kindOf = (name) => kindOfExt(extname(name).toLowerCase());

export async function collectAssets(projectDir) {
  let names;
  try {
    names = await readdir(join(projectDir, ASSETS_DIR));
  } catch {
    return [];
  }
  const assets = [];
  for (const name of names.sort()) {
    const kind = kindOf(name);
    if (!kind || name.startsWith(".")) continue;
    const info = await stat(join(projectDir, ASSETS_DIR, name)).catch(() => null);
    if (info?.isFile()) assets.push({ path: `${ASSETS_DIR}/${name}`, name, kind, size: info.size });
  }
  return assets;
}
