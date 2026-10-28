import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { toAgent, loadAgents, findPluginDir } from "./agents.mjs";
import { tempDir } from "./tmpdirs.mjs";

const tmp = tempDir;

test("toAgent : phase, outils, modèle, corps", () => {
  const a = toAgent(
    "architect.md",
    "---\nname: architect\ndescription: Plan technique\nmodel: opus\neffort: high\nmaxTurns: 25\ntools: Read, Write, Glob\n---\nCorps",
    "plugin",
  );
  assert.equal(a.id, "plugin:architect");
  assert.equal(a.phase, "plan");
  assert.deepEqual(a.tools, ["Read", "Write", "Glob"]);
  assert.equal(a.maxTurns, 25);
  assert.equal(a.effort, "high");
  assert.equal(a.body, "Corps");
});

test("toAgent : agent hors cycle → transverse, modèle hérité, nom tiré du fichier", () => {
  const a = toAgent("devops.md", "Pas de frontmatter", "projet");
  assert.equal(a.name, "devops");
  assert.equal(a.phase, "transverse");
  assert.equal(a.model, "inherit");
  assert.deepEqual(a.tools, []);
});

test("loadAgents lit le plugin puis le projet", async () => {
  const root = await tmp("op-agents-");
  await mkdir(join(root, "plugin", "agents"), { recursive: true });
  await mkdir(join(root, "proj", ".claude", "agents"), { recursive: true });
  await writeFile(join(root, "plugin", "agents", "tester.md"), "---\nname: tester\n---\n");
  await writeFile(join(root, "plugin", "agents", "notes.txt"), "ignoré");
  await writeFile(join(root, "proj", ".claude", "agents", "mon-agent.md"), "---\nname: mon-agent\n---\n");
  const agents = await loadAgents({ pluginDir: join(root, "plugin"), projectDir: join(root, "proj") });
  assert.deepEqual(agents.map((a) => a.id), ["plugin:tester", "projet:mon-agent"]);
});

test("loadAgents sans plugin ni dossier projet → []", async () => {
  const root = await tmp("op-agents-");
  assert.deepEqual(await loadAgents({ pluginDir: null, projectDir: root }), []);
});

test("findPluginDir lit installed_plugins.json", async () => {
  const home = await tmp("op-home-");
  await mkdir(join(home, ".claude", "plugins"), { recursive: true });
  await writeFile(
    join(home, ".claude", "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { "ottho-code-app@ottho-code-app": [{ installPath: "/x/1.1.0" }] } }),
  );
  assert.equal(await findPluginDir(home), "/x/1.1.0");
});

test("findPluginDir replie sur la version la plus haute du cache", async () => {
  const home = await tmp("op-home-");
  const cache = join(home, ".claude", "plugins", "cache", "ottho-code-app", "ottho-code-app");
  for (const v of ["1.1.0", "1.10.0", "1.2.0"]) await mkdir(join(cache, v), { recursive: true });
  assert.equal(await findPluginDir(home), join(cache, "1.10.0"));
});

test("findPluginDir → null si le plugin est absent", async () => {
  assert.equal(await findPluginDir(await tmp("op-home-")), null);
});
