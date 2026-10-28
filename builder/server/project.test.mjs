import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectPhase } from "./project.mjs";
import { tempDir } from "./tmpdirs.mjs";

const snap = (specs = []) => ({ specs: new Set(specs) });
const run = (agent, state, us = null) => ({ agent, state, us });
const states = (phase) => Object.fromEntries(phase.stages.map((s) => [s.key, s.state]));

test("projectPhase : projet neuf, prochaine étape le brief ; puis le cadrage", async () => {
  const dir = await tempDir("op-phase-");
  let phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [], brief: { exists: false, complete: false } });
  assert.deepEqual(phase.next, { key: "brief", agent: null, state: "todo" });
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [], brief: { exists: true, complete: true } });
  assert.deepEqual(phase.next, { key: "vision", agent: "brainstorming", state: "todo" });
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [run("brainstorming", "running")], deliverables: [], brief: { exists: true, complete: true } });
  assert.deepEqual(phase.next, { key: "vision", agent: "brainstorming", state: "running" });
});

test("projectPhase : PRD à valider, architecture, infra, première feature", async () => {
  const dir = await tempDir("op-phase-");
  const brief = { exists: true, complete: true };
  const prd = { kind: "prd", validated: false };
  let phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [run("brainstorming", "done")], deliverables: [prd], brief });
  assert.deepEqual(phase.next, { key: "prd", agent: "spec-writer", state: "validate" });
  // PRD validé : le designer (charte, maquettes) passe avant l'architecte.
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [{ kind: "prd", validated: true }], brief });
  assert.deepEqual(phase.next, { key: "design", agent: "designer", state: "todo" });
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [{ kind: "prd", validated: true }, { kind: "charte", validated: false }], brief });
  assert.deepEqual(phase.next, { key: "design", agent: "designer", state: "validate" });
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [{ kind: "prd", validated: true }, { kind: "charte", validated: true }], brief });
  assert.deepEqual(phase.next, { key: "architecture", agent: "architect", state: "todo" });
  const validated = [{ kind: "prd", validated: true }, { kind: "charte", validated: true }, { kind: "architecture", validated: true }];
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: validated, brief });
  assert.deepEqual(phase.next, { key: "infra", agent: "devops", state: "todo" });
  await mkdir(join(dir, "docs"));
  await writeFile(join(dir, "docs", "devops.md"), "# DevOps");
  phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: validated, brief });
  assert.deepEqual(phase.next, { key: "features", agent: "spec-writer", state: "todo" });
  assert.deepEqual(states(phase), { brief: "done", vision: "done", prd: "done", design: "done", architecture: "done", infra: "done", features: "todo" });
});

test("projectPhase : projet qui a déjà des features, plus de prochaine étape projet", async () => {
  const dir = await tempDir("op-phase-");
  const phase = await projectPhase({ projectDir: dir, snap: snap(["US-01"]), runs: [], deliverables: [], brief: { exists: false, complete: false } });
  assert.equal(phase.next, null);
  assert.equal(states(phase).features, "done");
});

test("projectPhase : projet déjà architecturé sans design (ou sans interface), l'étape Design ne bloque pas", async () => {
  const dir = await tempDir("op-phase-");
  const phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [{ kind: "prd", validated: true }, { kind: "architecture", validated: true }], brief: { exists: true, complete: true } });
  assert.equal(states(phase).design, "done");
  assert.equal(phase.next.key, "infra");
});

test("projectPhase : brief incomplet mais projet déjà plus loin (PRD), le brief n'est plus la prochaine étape", async () => {
  const dir = await tempDir("op-phase-");
  const phase = await projectPhase({ projectDir: dir, snap: snap(), runs: [], deliverables: [{ kind: "prd", validated: true }], brief: { exists: true, complete: false } });
  assert.equal(states(phase).brief, "done");
  assert.equal(phase.next.key, "design");
});
