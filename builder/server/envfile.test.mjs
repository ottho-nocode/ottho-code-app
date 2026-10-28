import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configStatus, publicPrefix, writeEnv } from "./envfile.mjs";
import { tempDir } from "./tmpdirs.mjs";

const project = async (files = {}, { git = false } = {}) => {
  const dir = await tempDir("op-env-");
  if (git) execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [rel, text] of Object.entries(files)) await writeFile(join(dir, rel), text);
  return dir;
};

test("publicPrefix : préfixe des variables publiques selon le framework (Next par défaut)", async () => {
  assert.equal(await publicPrefix(await project({ "package.json": JSON.stringify({ dependencies: { next: "16" } }) })), "NEXT_PUBLIC_");
  assert.equal(await publicPrefix(await project({ "package.json": JSON.stringify({ devDependencies: { vite: "8" } }) })), "VITE_");
  assert.equal(await publicPrefix(await project()), "NEXT_PUBLIC_");
});

test("writeEnv : fusionne dans .env.local sans toucher au reste, guillemets si besoin, retrait, droits 600", async () => {
  const dir = await project({ ".env.local": "# mes réglages\nPORT=3100\nNEXT_PUBLIC_SUPABASE_URL=https://ancien.supabase.co\n" });
  await writeEnv(dir, {
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "eyJ secret avec espaces # et dièse",
  });
  let text = await readFile(join(dir, ".env.local"), "utf8");
  assert.match(text, /^# mes réglages\nPORT=3100\nNEXT_PUBLIC_SUPABASE_URL=https:\/\/abcdefghijklmnopqrst\.supabase\.co\n/);
  assert.match(text, /\nSUPABASE_SERVICE_ROLE_KEY="eyJ secret avec espaces # et dièse"\n$/);
  assert.equal((await stat(join(dir, ".env.local"))).mode & 0o777, 0o600);
  await writeEnv(dir, { PORT: null });
  text = await readFile(join(dir, ".env.local"), "utf8");
  assert.doesNotMatch(text, /PORT=/);
});

test("writeEnv : noms et valeurs vérifiés (une ligne, nom en capitales)", async () => {
  const dir = await project();
  await assert.rejects(writeEnv(dir, { "mauvais nom": "x" }), (e) => e.status === 400);
  await assert.rejects(writeEnv(dir, { CLE: "ligne1\nINJECTE=1" }), (e) => e.status === 400 && !/INJECTE/.test(e.message));
  await assert.rejects(writeEnv(dir, {}), (e) => e.status === 400);
});

test("writeEnv : .env.local ajouté au .gitignore s'il n'y est pas ; noms (sans valeurs) dans .env.example", async () => {
  const dir = await project({ ".gitignore": "node_modules\n", ".env.example": "PORT=\n" }, { git: true });
  const result = await writeEnv(dir, { STRIPE_SECRET_KEY: "sk_test_ABCDEFGH12345678", PORT: "3100" });
  assert.equal(result.gitignoreUpdated, true);
  assert.match(await readFile(join(dir, ".gitignore"), "utf8"), /^\.env\*\.local$/m);
  execFileSync("git", ["check-ignore", "-q", ".env.local"], { cwd: dir }); // lève si non ignoré
  const example = await readFile(join(dir, ".env.example"), "utf8");
  assert.equal(example, "PORT=\nSTRIPE_SECRET_KEY=\n");
  // Déjà ignoré : .gitignore laissé tel quel.
  assert.equal((await writeEnv(dir, { RESEND_API_KEY: "re_ABCDEFGHIJKLMNOPQRSTUV" })).gitignoreUpdated, false);
});

test("configStatus : services prêts à remplir, « défini » ou non, jamais la valeur d'un secret", async () => {
  const dir = await project({
    "package.json": JSON.stringify({ dependencies: { next: "16" } }),
    ".env.local": "NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=eyJSECRET\nMA_VARIABLE=perso\n",
  });
  const status = await configStatus(dir);
  assert.equal(status.file, ".env.local");
  assert.equal(status.prefix, "NEXT_PUBLIC_");
  const supa = status.services.find((s) => s.key === "supabase");
  const field = (name) => supa.fields.find((f) => f.name === name);
  assert.deepEqual(field("NEXT_PUBLIC_SUPABASE_URL"), { name: "NEXT_PUBLIC_SUPABASE_URL", label: "URL du projet", secret: false, required: true, set: true, value: "https://abcdefghijklmnopqrst.supabase.co" });
  assert.deepEqual([field("SUPABASE_SERVICE_ROLE_KEY").set, "value" in field("SUPABASE_SERVICE_ROLE_KEY")], [true, false]);
  assert.equal(field("NEXT_PUBLIC_SUPABASE_ANON_KEY").set, false);
  assert.deepEqual(status.other, ["MA_VARIABLE"]);
  assert.deepEqual(status.services.map((s) => s.key), ["supabase", "stripe", "brevo", "resend"]);
  assert.doesNotMatch(JSON.stringify(status), /eyJSECRET|perso/);
});
