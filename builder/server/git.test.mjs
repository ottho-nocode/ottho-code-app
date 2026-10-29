import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readGit } from "./git.mjs";
import { tempDir } from "./tmpdirs.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
const index = (dir) => readFileSync(join(dir, ".git", "index"));

test("readGit : branche et fichiers modifiés, sans réécrire .git/index (surveillé par la signature : sinon chaque lecture relancerait la suivante)", async () => {
  const dir = await tempDir("op-git-");
  git(dir, "init", "-q", "-b", "main");
  await writeFile(join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-qm", "feat: init");
  // Fichier suivi dont la date change sans que le contenu change : un git status ordinaire
  // rafraîchit l'index et le réécrit.
  const past = new Date("2020-01-01T00:00:00Z");
  await utimes(join(dir, "a.txt"), past, past);
  const before = index(dir);
  const snapshot = await readGit(dir);
  assert.equal(snapshot.current, "main");
  assert.equal(snapshot.base, "main");
  assert.deepEqual(snapshot.subjects, ["feat: init"]);
  assert.equal(snapshot.dirty, 0);
  assert.ok(index(dir).equals(before), ".git/index réécrit par readGit");
  // Témoin : sans --no-optional-locks, git status le réécrit bien.
  git(dir, "status", "--porcelain");
  assert.ok(!index(dir).equals(before), "témoin : git status ordinaire aurait dû réécrire l'index");
});

test("readGit : dossier hors repo → null", async () => {
  assert.equal(await readGit(await tempDir("op-nogit-")), null);
});
