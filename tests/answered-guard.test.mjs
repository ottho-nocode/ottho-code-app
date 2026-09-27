import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answeredPairs, decide, guard, similar } from "../scripts/answered-guard.mjs";

// Format écrit par Ottho Builder 2 (docs/questions/*.md, section « Questions ouvertes » des specs).
const FILE = `# Questions du projet

## Questions ouvertes

- [x] Quel modèle économique : abonnement fixe, ou gratuit avec une commission ? Ma recommandation par défaut : abonnement fixe. (posée par brainstorming)
  > Réponse (2026-09-27) : abonnement fixe
- [x] Sur tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell (prix, commission, complexité) ? Ma recommandation par défaut : l'angle anti-marketplace. (posée par brainstorming)
  > Réponse (2026-09-27) : solo non équipé,
  > anti-marketplace
- [ ] Quel nom de domaine ?
`;

test("answeredPairs : questions cochées et leur réponse (sur plusieurs lignes), sans « (posée par …) »", () => {
  const pairs = answeredPairs(FILE);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[1], {
    question: "Sur tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell (prix, commission, complexité) ? Ma recommandation par défaut : l'angle anti-marketplace.",
    answer: "solo non équipé, anti-marketplace",
  });
});

test("similar : même question reformulée, oui ; autre question, non", () => {
  const [, planity] = answeredPairs(FILE);
  assert.ok(similar("D'après tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell ?", planity.question));
  assert.ok(!similar("Quel nom de domaine veux-tu réserver pour le projet ?", planity.question));
});

test("decide : questions déjà répondues retrouvées, les autres restent à poser", () => {
  const asked = ["D'après tes 10 interviews, pourquoi ces coiffeuses n'utilisent-elles pas déjà Planity, Booksy ou Treatwell ?", "Quel nom de domaine veux-tu réserver ?"];
  const { matched, unmatched } = decide(asked, answeredPairs(FILE));
  assert.deepEqual(matched.map((m) => m.answer), ["solo non équipé, anti-marketplace"]);
  assert.deepEqual(unmatched, ["Quel nom de domaine veux-tu réserver ?"]);
});

test("guard : AskUserQuestion sur des questions déjà répondues dans l'app → refus avec les réponses ; sinon rien", async () => {
  const dir = await mkdtemp(join(tmpdir(), "guard-"));
  await mkdir(join(dir, "docs", "questions"), { recursive: true });
  await writeFile(join(dir, "docs", "questions", "projet.md"), FILE);
  const payload = (questions) => ({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", cwd: dir, tool_input: { questions: questions.map((question) => ({ question, header: "x", options: [] })) } });

  const out = await guard(payload(["Quel modèle économique retiens-tu : abonnement fixe ou gratuit avec commission ?"]), dir);
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  const reason = out.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /déjà répondu dans Ottho Builder 2/);
  assert.match(reason, /→ abonnement fixe/);
  assert.match(reason, /docs\/questions\/projet\.md/);

  assert.equal(await guard(payload(["Quel nom de domaine veux-tu réserver ?"]), dir), null);
  assert.equal(await guard({ ...payload([]), tool_name: "Bash" }, dir), null);
});

test("script : lit le message du hook sur l'entrée standard et répond en JSON", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "guard-"));
  await mkdir(join(dir, "docs", "questions"), { recursive: true });
  await writeFile(join(dir, "docs", "questions", "projet.md"), FILE);
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", cwd: dir, tool_input: { questions: [{ question: "Quel modèle économique : abonnement fixe ou commission ?" }] } });
  const script = new URL("../scripts/answered-guard.mjs", import.meta.url).pathname;
  const out = JSON.parse(execFileSync(process.execPath, [script], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } }).toString());
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
});
