// Dossiers temporaires des tests unitaires : créés dans le dossier temporaire du système,
// supprimés à la fin du fichier de test qui les a créés (rien ne reste dans $TMPDIR).
// Le hook est posé à l'import, au niveau du fichier de test (chaque fichier tourne à part).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const made = new Set();

after(() => Promise.all([...made].map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3 }))));

export async function tempDir(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  made.add(dir);
  return dir;
}
