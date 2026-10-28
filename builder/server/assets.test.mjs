import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectAssets } from "./assets.mjs";
import { tempDir } from "./tmpdirs.mjs";

test("collectAssets : liste triée avec type et taille ; dossier absent → vide", async () => {
  const dir = await tempDir("op-assets-");
  assert.deepEqual(await collectAssets(dir), []);
  const assets = join(dir, "design", "assets");
  await mkdir(assets, { recursive: true });
  await writeFile(join(assets, "police.woff2"), "font");
  await writeFile(join(assets, "charte.pdf"), "pdf");
  await writeFile(join(assets, "logo.svg"), "<svg/>");
  // Ignorés : type hors liste, fichier caché.
  await writeFile(join(assets, "notes.txt"), "x");
  await writeFile(join(assets, ".logo.png"), "x");
  assert.deepEqual(await collectAssets(dir), [
    { path: "design/assets/charte.pdf", name: "charte.pdf", kind: "document", size: 3 },
    { path: "design/assets/logo.svg", name: "logo.svg", kind: "image", size: 6 },
    { path: "design/assets/police.woff2", name: "police.woff2", kind: "font", size: 4 },
  ]);
});
