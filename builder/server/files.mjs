// Utilitaires partagés : erreur HTTP, empreinte (identifiant des questions), lecture tolérante, écriture atomique
// (.env.local, brief), date locale.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const sha1 = (text) => createHash("sha1").update(text).digest("hex");

export async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

// Fichier temporaire au nom imprévisible, créé en exclusif (flag wx : échoue si le chemin existe,
// lien symbolique compris, jamais suivi), puis renommé sur la cible. Si la cible est elle-même un
// lien symbolique, rename remplace le lien par un fichier ordinaire : le fichier pointé reste intact.
// mode : droits du fichier dès sa création (0o600 pour un fichier de secrets).
export async function atomicWrite(file, content, { mode = 0o666 } = {}) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(8).toString("hex")}.ottho-tmp`;
  try {
    await writeFile(tmp, content, { flag: "wx", mode });
    await rename(tmp, file);
  } catch (err) {
    // wx refusé : le chemin n'est pas à nous, on n'y touche pas.
    if (err.code !== "EEXIST") await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
