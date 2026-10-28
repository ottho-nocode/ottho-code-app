import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listProjectDocs, readProjectFile } from "./viewer.mjs";
import { tempDir } from "./tmpdirs.mjs";

test("readProjectFile : fichiers texte du projet en lecture ; secrets, dossiers cachés, binaires et chemins sortants refusés", async () => {
  const dir = await tempDir("op-view-");
  await mkdir(join(dir, "plans"));
  await mkdir(join(dir, "src"));
  await mkdir(join(dir, "node_modules", "x"), { recursive: true });
  await writeFile(join(dir, "plans", "US-01.md"), "# Plan");
  await writeFile(join(dir, "src", "app.ts"), "export {};");
  await writeFile(join(dir, ".env"), "SECRET=1");
  await writeFile(join(dir, "node_modules", "x", "i.js"), "x");
  await writeFile(join(dir, "gros.md"), "x".repeat(600 * 1024));
  await writeFile(join(dir, "logo.png"), "png");

  assert.deepEqual(await readProjectFile(dir, "plans/US-01.md"), { path: "plans/US-01.md", content: "# Plan", kind: "markdown" });
  assert.equal((await readProjectFile(dir, "src/app.ts")).kind, "text");
  for (const bad of [".env", "../x.md", "/etc/passwd", "node_modules/x/i.js", "logo.png", "absent.md", ".claude/pipeline-events.jsonl"]) {
    await assert.rejects(readProjectFile(dir, bad), (e) => e.status === 404 || e.status === 400, bad);
  }
  await assert.rejects(readProjectFile(dir, "gros.md"), (e) => e.status === 413);
});

test("listProjectDocs : les .md du projet, racine puis dossiers de la méthode, sans dossiers cachés ni dépendances", async () => {
  const dir = await tempDir("op-docs-");
  for (const d of ["specs", "design/US-01-x", "plans", "docs/adr", "src", ".claude", "node_modules/pkg"]) await mkdir(join(dir, d), { recursive: true });
  const files = {
    "README.md": "# Lisez-moi", "CLAUDE.md": "x", "specs/US-01-x.md": "# Spec", "design/charte.md": "c", "design/US-01-x.md": "d",
    "design/US-01-x/notes.md": "n", "plans/US-01-x.md": "p", "docs/adr/0001.md": "a", "src/app.ts": "t", "src/LISEZ.mdx": "m",
    ".claude/memo.md": "caché", "node_modules/pkg/README.md": "dépendance", "logo.png": "png",
  };
  for (const [f, c] of Object.entries(files)) await writeFile(join(dir, f), c);
  const docs = await listProjectDocs(dir);
  assert.deepEqual(docs.map((d) => d.path), [
    "CLAUDE.md", "README.md", "specs/US-01-x.md", "design/charte.md", "design/US-01-x.md", "design/US-01-x/notes.md",
    "plans/US-01-x.md", "docs/adr/0001.md", "src/LISEZ.mdx",
  ]);
  assert.equal(typeof docs[0].mtime, "string");
  assert.equal(docs[0].size, 1);
});
