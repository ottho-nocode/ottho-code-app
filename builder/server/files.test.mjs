import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { lstat, mkdir, readFile, readdir, readlink, stat, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { atomicWrite } from "./files.mjs";
import { tempDir } from "./tmpdirs.mjs";

// Un dossier de projet et, à côté, le fichier qu'un lien piégé voudrait faire écraser.
async function setup() {
  const dir = await tempDir("op-files-");
  const victim = join(dir, "victime.txt");
  await writeFile(victim, "intact");
  await mkdir(join(dir, "projet"));
  return { dir, victim, file: join(dir, "projet", ".env.local") };
}

const leftovers = async (dir) => (await readdir(dir)).filter((n) => n.endsWith(".ottho-tmp"));

test("atomicWrite : écrit le contenu, crée le dossier, ne laisse aucun fichier temporaire", async () => {
  const dir = await tempDir("op-files-");
  const file = join(dir, "absent", "docs", "brief.md");
  await atomicWrite(file, "un");
  await atomicWrite(file, "deux");
  assert.equal(await readFile(file, "utf8"), "deux");
  assert.deepEqual(await leftovers(join(dir, "absent", "docs")), []);
});

test("atomicWrite : un lien symbolique posé au nom temporaire prévisible d'avant (<cible>.ottho-tmp) est ignoré", async () => {
  const { victim, file } = await setup();
  await symlink(victim, `${file}.ottho-tmp`);
  await atomicWrite(file, "SECRET=1\n");
  assert.equal(await readFile(victim, "utf8"), "intact");
  assert.equal(await readFile(file, "utf8"), "SECRET=1\n");
  // Le lien n'est pas à nous : il reste tel quel.
  assert.equal(await readlink(`${file}.ottho-tmp`), victim);
});

test("atomicWrite : un lien symbolique posé au nom temporaire tiré au sort ne redirige pas l'écriture (flag wx)", async (t) => {
  const { dir, victim, file } = await setup();
  // Tirage connu d'avance (le pire cas : l'attaquant a deviné le nom).
  t.mock.method(crypto, "randomBytes", () => Buffer.from("0011223344556677", "hex"));
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const tmp = `${file}.0011223344556677.ottho-tmp`;
  await symlink(victim, tmp);
  await assert.rejects(atomicWrite(file, "SECRET=1\n"), { code: "EEXIST" });
  assert.equal(await readFile(victim, "utf8"), "intact");
  await assert.rejects(stat(file), { code: "ENOENT" });
  // Le chemin refusé n'est pas supprimé : il n'a pas été créé par nous.
  assert.equal(await readlink(tmp), victim);
  // Lien cassé (cible absente) : refusé aussi, rien n'est créé au bout du lien.
  const ghost = join(dir, "fantome.txt");
  await symlink(ghost, `${join(dir, "projet", "brief.md")}.0011223344556677.ottho-tmp`);
  await assert.rejects(atomicWrite(join(dir, "projet", "brief.md"), "x"), { code: "EEXIST" });
  await assert.rejects(stat(ghost), { code: "ENOENT" });
});

test("atomicWrite : si la cible est un lien symbolique, le lien est remplacé par un fichier, le fichier pointé reste intact", async () => {
  const { victim, file } = await setup();
  await symlink(victim, file);
  await atomicWrite(file, "SECRET=1\n");
  assert.equal(await readFile(victim, "utf8"), "intact");
  assert.ok((await lstat(file)).isFile());
  assert.equal(await readFile(file, "utf8"), "SECRET=1\n");
});

test("atomicWrite : échec du renommage (cible : un dossier) → erreur, fichier temporaire supprimé", async () => {
  const dir = await tempDir("op-files-");
  await mkdir(join(dir, "cible", "plein"), { recursive: true });
  await assert.rejects(atomicWrite(join(dir, "cible"), "x"));
  assert.deepEqual(await leftovers(dir), []);
  assert.ok((await stat(join(dir, "cible"))).isDirectory());
});

test("atomicWrite : mode appliqué dès la création (0o600 pour les secrets)", async () => {
  const dir = await tempDir("op-files-");
  await atomicWrite(join(dir, ".env.local"), "A=1\n", { mode: 0o600 });
  assert.equal((await stat(join(dir, ".env.local"))).mode & 0o777, 0o600);
});

test("atomicWrite : écritures simultanées sur le même fichier, chacune avec son propre fichier temporaire", async () => {
  const dir = await tempDir("op-files-");
  const file = join(dir, "exemple.json");
  const contents = Array.from({ length: 10 }, (_, i) => `version ${i}`);
  await Promise.all(contents.map((c) => atomicWrite(file, c)));
  assert.ok(contents.includes(await readFile(file, "utf8")));
  assert.deepEqual(await leftovers(dir), []);
});
