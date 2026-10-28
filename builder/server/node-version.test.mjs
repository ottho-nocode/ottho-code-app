import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MIN_NODE_MAJOR, nodeVersionError } from "./node-version.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

test("nodeVersionError : Node 20 ou plus accepté, plus ancien refusé avec un message clair", () => {
  assert.equal(MIN_NODE_MAJOR, 20);
  for (const ok of ["20.0.0", "20.19.1", "22.11.0", "25.4.0", "100.0.0"]) assert.equal(nodeVersionError(ok), null, ok);
  assert.equal(nodeVersionError("18.19.0"), "Ottho Builder 2 demande Node 20 ou plus (version actuelle : 18.19.0).");
  assert.equal(nodeVersionError("19.9.0"), "Ottho Builder 2 demande Node 20 ou plus (version actuelle : 19.9.0).");
  assert.match(nodeVersionError("16.20.2"), /^Ottho Builder 2 demande Node 20 ou plus/);
  assert.doesNotMatch(nodeVersionError("18.0.0"), /[—–]/);
  // Version illisible : pas de blocage.
  assert.equal(nodeVersionError("inconnue"), null);
  // Node qui exécute les tests : accepté.
  assert.equal(nodeVersionError(), null);
});

test("bin/cli.mjs sous un Node trop ancien (version simulée) : le message sur stderr, code 1, rien de lancé", () => {
  const fakeOld = 'data:text/javascript,Object.defineProperty(process.versions,"node",{value:"18.19.0"})';
  const res = spawnSync(process.execPath, ["--import", fakeOld, CLI, "--project", "/dossier/absent", "--port", "4398", "--no-open"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(res.status, 1);
  assert.equal(res.stdout, "");
  assert.equal(res.stderr, "Ottho Builder 2 demande Node 20 ou plus (version actuelle : 18.19.0).\n");
});
