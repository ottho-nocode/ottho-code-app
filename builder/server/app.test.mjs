import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveStatic, startApp } from "./app.mjs";
import { writeBrief } from "./brief.mjs";
import { tempDir } from "./tmpdirs.mjs";

async function fixture() {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "specs"));
  await writeFile(join(dir, "specs", "US-01-inscription.md"), "# US-01 — Inscription\n");
  return dir;
}

function rawGet(port, path, host) {
  return new Promise((ok, ko) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers: { Host: host } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", ko);
    req.end();
  });
}

test("resolveStatic refuse de sortir du dossier dist", () => {
  assert.equal(resolveStatic("/srv/dist", "/"), resolve("/srv/dist/index.html"));
  assert.equal(resolveStatic("/srv/dist", "/assets/a.js?v=1"), resolve("/srv/dist/assets/a.js"));
  assert.equal(resolveStatic("/srv/dist", "/../package.json"), null);
  assert.equal(resolveStatic("/srv/dist", "/..%2fpackage.json"), null);
  assert.equal(resolveStatic("/srv/dist", "/%E0%A4%A"), null);
});

test("API : health, state, Host étranger refusé", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;

  const health = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(health, { ok: true, app: "ottho-pipeline", project: dir });

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.features[0].us, "US-01");
  assert.equal(state.features[0].title, "Inscription");
  assert.equal(state.git, false);
  assert.deepEqual(state.questions, []);

  assert.equal(await rawGet(app.port, "/api/health", "evil.example"), 403);
  assert.equal(await rawGet(app.port, "/api/health", `localhost:${app.port}`), 200);
});

test("SSE : état initial puis nouvel état après un événement", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, pollMs: 100 });
  t.after(() => app.close());
  const res = await fetch(`http://127.0.0.1:${app.port}/api/stream`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const first = dec.decode((await reader.read()).value);
  assert.match(first, /^data: /);

  await mkdir(join(dir, ".claude"), { recursive: true });
  const event = { v: 1, ts: new Date().toISOString(), type: "start", id: "x", agent: "architect", source: "plugin", us: "US-01", branch: null };
  await appendFile(join(dir, ".claude", "pipeline-events.jsonl"), JSON.stringify(event) + "\n");

  let chunk = "";
  while (!chunk.includes('"state":"running"')) chunk += dec.decode((await reader.read()).value);
  assert.match(chunk, /"agent":"architect"/);
  await reader.cancel();
});

test("livrables : lecture seule, validation lue dans l'historique du fichier, prochaine étape à jour", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "specs"));
  const spec = "# US-01 — Inscription\n\n## Historique\n\n- 2026-09-26 — Création par `spec-writer`.\n";
  await writeFile(join(dir, "specs", "US-01-inscription.md"), spec);
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.features[0].next, { agent: "spec-writer", reason: "validate" });
  assert.deepEqual(state.deliverables.map((d) => [d.agent, d.validated, d.blocking]), [["spec-writer", false, true]]);

  const read = await (await fetch(`${base}/api/deliverable?us=US-01&agent=spec-writer`)).json();
  assert.deepEqual([read.file, read.content], ["specs/US-01-inscription.md", spec]);
  assert.equal((await fetch(`${base}/api/deliverable?us=US-01&agent=developer`)).status, 400);

  // Validation donnée dans le CLI : l'app la lit dans le fichier.
  await appendFile(join(dir, "specs", "US-01-inscription.md"), "- 2026-09-27 — Validé par l'utilisateur.\n");
  const validated = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(validated.deliverables.map((d) => [d.validated, d.validatedAt]), [[true, "2026-09-27"]]);
  assert.deepEqual(validated.features[0].next, { agent: "architect", reason: "todo" });
});

test("GET /api/design-file : images de design/ seulement", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "design", "US-01-x"), { recursive: true });
  await writeFile(join(dir, "design", "US-01-x", "ecran.png"), "PNGDATA");
  await writeFile(join(dir, "design", "US-01-x.md"), "# secret");
  await writeFile(join(dir, "package.json"), "{}");
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const get = (p) => fetch(`http://127.0.0.1:${app.port}/api/design-file?path=${encodeURIComponent(p)}`);
  const ok = await get("design/US-01-x/ecran.png");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.match(ok.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(await ok.text(), "PNGDATA");
  for (const bad of ["design/US-01-x.md", "package.json", "design/../package.json", "design/US-01-x/absent.png"]) {
    assert.equal((await get(bad)).status, 404, bad);
  }
});

test("GET /api/design-preview : écran de canevas en HTML statique, sans script, CSP stricte", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "design", "US-01-x"), { recursive: true });
  await writeFile(join(dir, "design", "US-01-x", "Main.dc.html"), `<html><head></head><body><div style="color: {{accent}}">A</div><script type="text/x-dc" data-props='{"accent":{"default":"#123456"}}'>x</script></body></html>`);
  // Page HTML de maquettes (niveau projet) : aperçue elle aussi, scripts retirés.
  await writeFile(join(dir, "design", "US-01-x", "notes.html"), "<p>maquettes</p><script>alert(1)</script>");
  await writeFile(join(dir, "design", "US-01-x", "notes.js"), "alert(1)");
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const get = (p) => fetch(`http://127.0.0.1:${app.port}/api/design-preview?path=${encodeURIComponent(p)}`);
  const res = await get("design/US-01-x/Main.dc.html");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(/script-src/.test(res.headers.get("content-security-policy")), false);
  const body = await res.text();
  assert.match(body, /color: #123456/);
  assert.equal(/<script/i.test(body), false);
  const page = await get("design/US-01-x/notes.html");
  assert.equal(page.status, 200);
  assert.equal(/<script/i.test(await page.text()), false);
  for (const bad of ["design/US-01-x/notes.js", "design/../package.json", "specs/US-01.dc.html"]) assert.equal((await get(bad)).status, 404, bad);
});

test("éléments de marque : déposés dans design/assets (CLI), listés dans l'état et servis", async (t) => {
  const dir = await tempDir("op-app-");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  await mkdir(join(dir, "design", "assets"), { recursive: true });
  await writeFile(join(dir, "design", "assets", "logo-marque.png"), png);
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.assets.map((a) => [a.path, a.kind]), [["design/assets/logo-marque.png", "image"]]);
  const served = await fetch(`${base}/api/design-file?path=${encodeURIComponent("design/assets/logo-marque.png")}`);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
});

test("historique : compte rendu à la demande (jeton), lecture d'un fichier produit", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, ".claude"), { recursive: true });
  await mkdir(join(dir, "plans"));
  await writeFile(join(dir, "plans", "US-01-x.md"), "# Plan US-01");
  const ts = new Date().toISOString();
  const events = [
    { v: 1, ts, type: "start", id: "t1", agent: "architect", source: "plugin", us: "US-01", branch: null },
    { v: 1, ts, type: "activity", agentId: "a", agent: "architect", tool: "Write", detail: "plans/US-01-x.md" },
    { v: 1, ts, type: "end", id: "t1", agent: "architect", us: "US-01", next: "developer", verdict: null, questions: [], report: "## Plan\nÉcrit." },
  ];
  await writeFile(join(dir, ".claude", "pipeline-events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  const [run] = state.runs;
  assert.deepEqual([run.files, run.hasReport, "report" in run], [["plans/US-01-x.md"], true, false]);
  const key = encodeURIComponent(`${run.agent}|${run.start}`);
  assert.equal((await fetch(`${base}/api/report?key=${key}&token=faux`)).status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/report?key=${key}&token=${state.writeToken}`)).json(), { report: "## Plan\nÉcrit." });
  const file = await (await fetch(`${base}/api/file?path=${encodeURIComponent("plans/US-01-x.md")}&token=${state.writeToken}`)).json();
  assert.deepEqual(file, { path: "plans/US-01-x.md", content: "# Plan US-01", kind: "markdown" });
  assert.equal((await fetch(`${base}/api/file?path=${encodeURIComponent(".env")}&token=${state.writeToken}`)).status, 404);
  assert.equal((await fetch(`${base}/api/docs?token=faux`)).status, 403);
  const { docs } = await (await fetch(`${base}/api/docs?token=${state.writeToken}`)).json();
  assert.deepEqual(docs.map((d) => d.path), ["plans/US-01-x.md"]);
});

test("terminal intégré retiré : routes inconnues (404) même avec le jeton, absent de l'état", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal("terminal" in state, false);
  const post = (path) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Ottho-Token": state.writeToken }, body: JSON.stringify({ cols: 100, rows: 30, data: "x" }) });
  for (const path of ["/api/terminal/start", "/api/terminal/restart", "/api/terminal/input", "/api/terminal/resize"]) {
    assert.equal((await post(path)).status, 404, path);
  }
  assert.equal((await fetch(`${base}/api/terminal/stream?token=${state.writeToken}`)).status, 404);
});

test("écritures retirées (réponses, brief, validations, livrables, fichiers de marque) : 404 même avec le jeton, lectures intactes", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "specs"));
  const spec = "# US-01 — Inscription\n\n## 7. Questions ouvertes\n\n- [ ] Faut-il un captcha ?\n\n## Historique\n\n- 2026-09-26 — Création par `spec-writer`.\n";
  await writeFile(join(dir, "specs", "US-01-inscription.md"), spec);
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json") });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.match(state.writeToken, /^[0-9a-f]{48}$/);
  const [q] = state.questions;
  assert.equal(q.text, "Faut-il un captcha ?");
  const post = (path, body) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Ottho-Token": state.writeToken }, body: JSON.stringify(body) });
  const read = await (await fetch(`${base}/api/deliverable?us=US-01&agent=spec-writer`)).json();
  const bodies = {
    "/api/upload": { name: "logo.png" },
    "/api/answer": { id: q.id, answer: "Oui." },
    "/api/brief": { brief: { name: "Devis Facile" } },
    "/api/brief/presets": { name: "Devis Facile", brief: { name: "Devis Facile" } },
    "/api/validate": { us: "US-01", agent: "spec-writer" },
    "/api/deliverable": { us: "US-01", agent: "spec-writer", content: "# Écrasé\n" },
  };
  for (const [path, body] of Object.entries(bodies)) assert.equal((await post(path, body)).status, 404, path);
  assert.equal((await fetch(`${base}/api/brief/presets?token=${state.writeToken}`)).status, 404);
  // Rien n'a été écrit dans le projet.
  assert.equal(await readFile(join(dir, "specs", "US-01-inscription.md"), "utf8"), spec);
  for (const absent of ["docs/brief.md", "design/assets"]) await assert.rejects(access(join(dir, absent)), absent);
  // Lectures gardées : brief (jeton) et livrable.
  assert.deepEqual((await (await fetch(`${base}/api/brief?token=${state.writeToken}`)).json()).exists, false);
  assert.deepEqual([read.file, read.content], ["specs/US-01-inscription.md", spec]);
});

test("état : services branchés (noms seulement) et services de chaque agent", async (t) => {
  const dir = await tempDir("op-app-");
  await mkdir(join(dir, "plugin", "agents"), { recursive: true });
  await writeFile(join(dir, "plugin", "agents", "developer.md"), "---\nname: developer\ntools: Read, mcp__supabase, mcp__claude_ai_Supabase, mcp__stripe\n---\nCorps");
  await writeFile(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { supabase: { headers: { Authorization: "Bearer sk_SECRET" } } } }));
  const app = await startApp({ projectDir: dir, pluginDir: join(dir, "plugin"), distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json") });
  t.after(() => app.close());
  const state = await (await fetch(`http://127.0.0.1:${app.port}/api/state`)).json();
  assert.deepEqual(state.services, [{ key: "supabase", label: "Supabase", via: ["projet"], targets: [{ via: "projet", project: null, readOnly: false }] }]);
  assert.equal(state.database, null);
  assert.deepEqual(state.agents.find((a) => a.name === "developer").services, ["supabase", "stripe"]);
  assert.doesNotMatch(JSON.stringify(state), /sk_SECRET/);
});

test("aperçu : état dans /api/state, démarrage et arrêt protégés par le jeton", async (t) => {
  const dir = await tempDir("op-app-");
  await writeFile(join(dir, "index.html"), "<h1>Aperçu</h1>");
  const from = 44100 + Math.floor(Math.random() * 400) * 2;
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json"), previewPorts: [from, from + 1] });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual([state.preview.status, state.preview.mode], ["idle", "static"]);
  const post = (path, token, origin = base) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Ottho-Token": token }, body: "{}" });
  assert.equal((await post("/api/preview/start", "faux")).status, 403);
  assert.equal((await post("/api/preview/start", state.writeToken, "https://evil.example")).status, 403);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).preview.status, "idle");
  assert.equal((await post("/api/preview/start", state.writeToken)).status, 200);
  const running = (await (await fetch(`${base}/api/state`)).json()).preview;
  assert.deepEqual([running.status, running.url], ["running", `http://127.0.0.1:${from}/`]);
  assert.equal(await (await fetch(running.url)).text(), "<h1>Aperçu</h1>");
  assert.equal((await post("/api/preview/stop", state.writeToken)).status, 200);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).preview.status, "idle");
});

test("configuration : lecture (jeton) sans secret, écriture protégée dans .env.local", async (t) => {
  const dir = await tempDir("op-app-");
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json") });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const { writeToken } = await (await fetch(`${base}/api/state`)).json();
  assert.equal((await fetch(`${base}/api/config?token=faux`)).status, 403);
  const post = (token, values, origin = base) =>
    fetch(`${base}/api/config`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Ottho-Token": token }, body: JSON.stringify({ values }) });
  const values = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "eyJ.CLE_SECRETE.xyz" };
  assert.equal((await post("faux", values)).status, 403);
  // Bon jeton mais autre origine : refusé, rien d'écrit.
  assert.equal((await post(writeToken, values, "https://evil.example")).status, 403);
  await assert.rejects(access(join(dir, ".env.local")));
  assert.equal((await fetch(`${base}/api/config`, { method: "PUT" })).status, 405);
  const saved = await post(writeToken, values);
  assert.equal(saved.status, 200);
  assert.doesNotMatch(await saved.text(), /CLE_SECRETE/);
  const env = await readFile(join(dir, ".env.local"), "utf8");
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=eyJ\.CLE_SECRETE\.xyz/);
  assert.equal((await post(writeToken, { SUPABASE_SERVICE_ROLE_KEY: "eyJ.PIRATE.xyz" }, "https://evil.example")).status, 403);
  assert.equal(await readFile(join(dir, ".env.local"), "utf8"), env);
  const status = await (await fetch(`${base}/api/config?token=${writeToken}`)).text();
  assert.doesNotMatch(status, /CLE_SECRETE/);
  // L'état voit la base de l'app aussitôt, sans la clé.
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.database.project, "abcdefghijklmnopqrst");
  assert.doesNotMatch(JSON.stringify(state), /CLE_SECRETE/);
});

test("brief et phase projet : lecture (jeton), brief écrit dans le CLI lu par l'app, phase dans l'état", async (t) => {
  const dir = await tempDir("op-app-");
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json") });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  let state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual([state.brief, state.phase.next], [{ exists: false, complete: false }, { key: "brief", agent: null, state: "todo" }]);
  assert.equal((await fetch(`${base}/api/brief?token=faux`)).status, 403);
  const brief = {
    name: "Devis Facile",
    domaine: { domaine: "Freelances créatifs" },
    probleme: { description: "Relances oubliées." },
    cible: { marche: "Freelances en France" },
    persona: [{ identite: "Léa, graphiste" }],
    solution: { modele: "Automatisation" },
    uvp: { phrase: "J'aide les freelances à relancer leurs devis grâce à l'automatisation." },
  };
  assert.deepEqual(await writeBrief(dir, brief, "2026-10-03"), { complete: true });
  state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual([state.brief.complete, state.phase.next.key], [true, "vision"]);
  assert.equal((await (await fetch(`${base}/api/brief?token=${state.writeToken}`)).json()).data.name, "Devis Facile");
});

// Promesse bornée : échoue au lieu de bloquer le test.
const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((_, ko) => (timer = setTimeout(() => ko(new Error(`délai dépassé (${ms} ms)`)), ms)))]).finally(() => clearTimeout(timer));
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

test("arrêt automatique : sans onglet ouvert, l'app s'arrête après idleExitMs et prévient une fois", async (t) => {
  const dir = await fixture();
  let calls = 0;
  let idle;
  const stopped = new Promise((ok) => (idle = ok));
  const onIdleExit = () => {
    calls++;
    idle();
  };
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json"), idleExitMs: 150, idleCheckMs: 30, onIdleExit });
  t.after(() => app.close());
  await within(stopped, 2000);
  await assert.rejects(fetch(`http://127.0.0.1:${app.port}/api/health`));
  await sleep(100);
  assert.equal(calls, 1);
});

test("arrêt automatique : pas d'arrêt tant qu'un onglet est branché (SSE), arrêt après sa fermeture", async (t) => {
  const dir = await fixture();
  let calls = 0;
  let idle;
  const stopped = new Promise((ok) => (idle = ok));
  const onIdleExit = () => {
    calls++;
    idle();
  };
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json"), idleExitMs: 150, idleCheckMs: 30, onIdleExit });
  t.after(() => app.close());
  const req = http.request({ host: "127.0.0.1", port: app.port, path: "/api/stream" });
  req.on("error", () => {});
  const res = await new Promise((ok) => req.on("response", ok).end());
  res.resume();
  await sleep(400);
  assert.equal(calls, 0);
  assert.equal((await fetch(`http://127.0.0.1:${app.port}/api/health`)).status, 200);
  req.destroy();
  await within(stopped, 2000);
  assert.equal(calls, 1);
});

test("arrêt automatique : le hook du plugin (health avec le projet) maintient l'app en vie, un sondage ordinaire non", async (t) => {
  const dir = await fixture();
  let calls = 0;
  const onIdleExit = () => calls++;
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json"), idleExitMs: 300, idleCheckMs: 30, onIdleExit });
  t.after(() => app.close());
  const health = (query) => fetch(`http://127.0.0.1:${app.port}/api/health${query}`);
  // Health avec le projet toutes les 100 ms pendant plus de 600 ms : toujours en vie.
  for (let i = 0; i < 7; i++) {
    assert.equal((await health(`?project=${encodeURIComponent(dir)}`)).status, 200);
    await sleep(100);
  }
  assert.equal(calls, 0);
  // Sans le projet ou avec un autre projet, toutes les 50 ms : l'app s'arrête pendant ces sondages.
  const ignore = () => {};
  for (const from = Date.now(); calls === 0 && Date.now() - from < 2000; ) {
    await health("").catch(ignore);
    await health(`?project=${encodeURIComponent(`${dir}-autre`)}`).catch(ignore);
    await sleep(50);
  }
  assert.equal(calls, 1);
});

test("arrêt automatique : un onglet fermé pendant sa connexion ne bloque pas l'arrêt", async (t) => {
  const dir = await fixture();
  let idle;
  const stopped = new Promise((ok) => (idle = ok));
  const app = await startApp({ projectDir: dir, pluginDir: null, distDir: dir, port: 0, claudeConfigPath: join(dir, "absent.json"), idleExitMs: 150, idleCheckMs: 30, onIdleExit: () => idle() });
  t.after(() => app.close());
  // Onglet refermé pendant le calcul de l'état, avant la réponse.
  const req = http.request({ host: "127.0.0.1", port: app.port, path: "/api/stream" });
  req.on("error", () => {});
  req.end();
  await sleep(3);
  req.destroy();
  await within(stopped, 2000);
});
