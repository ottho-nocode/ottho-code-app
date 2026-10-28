import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readSnapshot, deriveFeatures } from "./features.mjs";
import { tempDir } from "./tmpdirs.mjs";

const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const g = (cwd, ...args) => execFileSync("git", args, { cwd, env, stdio: "pipe" });

test("readSnapshot : fichiers + Git réel (merge, branche en cours)", async () => {
  const dir = await tempDir("op-proj-");
  g(dir, "init", "-q", "-b", "develop");
  for (const d of ["specs", "plans", "reviews"]) await mkdir(join(dir, d));
  await writeFile(join(dir, "specs", "US-01-inscription.md"), "# US-01 — Inscription\n");
  await writeFile(join(dir, "specs", "US-02-paiement.md"), "# US-02 — Paiement\n");
  await writeFile(join(dir, "plans", "US-01-inscription.md"), "plan");
  await writeFile(join(dir, "reviews", "US-01-inscription-review.md"), "Verdict : APPROUVÉ");
  g(dir, "add", ".");
  g(dir, "commit", "-q", "-m", "chore: init");
  g(dir, "checkout", "-q", "-b", "feature/US-01-inscription");
  await writeFile(join(dir, "a.txt"), "x");
  g(dir, "add", ".");
  g(dir, "commit", "-q", "-m", "feat(US-01): formulaire");
  g(dir, "checkout", "-q", "develop");
  g(dir, "merge", "-q", "--no-ff", "feature/US-01-inscription", "-m", "Merge branch 'feature/US-01-inscription' into develop");
  g(dir, "checkout", "-q", "-b", "feature/US-02-paiement");

  const s = await readSnapshot(dir);
  assert.deepEqual([...s.specs].sort(), ["US-01", "US-02"]);
  assert.equal(s.titles.get("US-02"), "Paiement");
  assert.equal(s.reviews.get("US-01"), "ok");
  assert.equal(s.git.base, "develop");
  assert.equal(s.git.current, "feature/US-02-paiement");
  assert.equal(s.git.dirty, 0);
  await writeFile(join(dir, "specs", "US-02-paiement.md"), "# US-02 — Paiement modifié\n");
  await writeFile(join(dir, "nouveau.txt"), "x");
  assert.equal((await readSnapshot(dir)).git.dirty, 2);

  const [f1, f2] = deriveFeatures(s, []).features;
  assert.equal(f1.columns.code, "done");
  assert.equal(f1.columns.merge, "done");
  assert.equal(f2.columns.code, "running");
  assert.equal(f2.columns.merge, "todo");
  assert.equal(f2.next.agent, "architect");
});

test("readSnapshot hors repo Git → git null", async () => {
  const dir = await tempDir("op-nogit-");
  assert.equal((await readSnapshot(dir)).git, null);
});
