import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { signature } from "./signature.mjs";
import { tempDir } from "./tmpdirs.mjs";

const T = 1_000_000_000;

test("change quand un événement est ajouté", async () => {
  const dir = await tempDir("op-sig-");
  await mkdir(join(dir, ".claude"));
  const a = await signature(dir, T);
  await appendFile(join(dir, ".claude", "pipeline-events.jsonl"), "{}\n");
  assert.notEqual(await signature(dir, T), a);
});

test("change quand une spec apparaît", async () => {
  const dir = await tempDir("op-sig-");
  const a = await signature(dir, T);
  await mkdir(join(dir, "specs"));
  await writeFile(join(dir, "specs", "US-01-x.md"), "# x");
  assert.notEqual(await signature(dir, T), a);
});

test("stable sans changement, change à la minute suivante", async () => {
  const dir = await tempDir("op-sig-");
  assert.equal(await signature(dir, T), await signature(dir, T + 1000));
  assert.notEqual(await signature(dir, T), await signature(dir, T + 60_000));
});

test("change quand le PRD ou docs/questions bouge", async () => {
  const dir = await tempDir("op-sig-");
  const a = await signature(dir, T);
  await mkdir(join(dir, "docs", "questions"), { recursive: true });
  await writeFile(join(dir, "docs", "questions", "US-07.md"), "## Questions ouvertes\n");
  const b = await signature(dir, T);
  assert.notEqual(b, a);
  await writeFile(join(dir, "docs", "PRD.md"), "# PRD\n");
  assert.notEqual(await signature(dir, T), b);
});
