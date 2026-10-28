import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectAppDatabase } from "./database.mjs";
import { tempDir } from "./tmpdirs.mjs";

const project = async (files) => {
  const dir = await tempDir("op-db-");
  for (const [rel, text] of Object.entries(files)) await writeFile(join(dir, rel), text);
  return dir;
};

test("detectAppDatabase : projet Supabase de l'app, le .env.local l'emporte ; aucune clé ne sort", async () => {
  const dir = await project({
    ".env": "NEXT_PUBLIC_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co\n",
    ".env.local": 'NEXT_PUBLIC_SUPABASE_URL="https://bbbbbbbbbbbbbbbbbbbb.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY=eyJSECRET\n',
  });
  const db = await detectAppDatabase(dir);
  assert.deepEqual(db, { kind: "supabase", project: "bbbbbbbbbbbbbbbbbbbb", host: "bbbbbbbbbbbbbbbbbbbb.supabase.co", source: ".env.local" });
  assert.doesNotMatch(JSON.stringify(db), /SECRET|eyJ/);
});

test("detectAppDatabase : DATABASE_URL, hôte seulement (jamais l'identifiant ni le mot de passe)", async () => {
  const pg = await detectAppDatabase(await project({ ".env": "DATABASE_URL=postgresql://postgres:MotDePasse@db.cccccccccccccccccccc.supabase.co:5432/postgres\n" }));
  assert.deepEqual(pg, { kind: "supabase", project: "cccccccccccccccccccc", host: "db.cccccccccccccccccccc.supabase.co", source: ".env" });
  const other = await detectAppDatabase(await project({ ".env": "DATABASE_URL=postgres://u:p@localhost:5432/app\n" }));
  assert.deepEqual(other, { kind: "postgres", project: null, host: "localhost", source: ".env" });
  const sqlite = await detectAppDatabase(await project({ ".env": 'DATABASE_URL="file:./dev.db"\n' }));
  assert.deepEqual(sqlite, { kind: "sqlite", project: null, host: "./dev.db", source: ".env" });
  assert.doesNotMatch(JSON.stringify([pg, other]), /MotDePasse|u:p/);
});

test("detectAppDatabase : aucun .env ou aucune base, null", async () => {
  assert.equal(await detectAppDatabase(await project({})), null);
  assert.equal(await detectAppDatabase(await project({ ".env": "PORT=3000\n# SUPABASE_URL=https://x.supabase.co\n" })), null);
});
