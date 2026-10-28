import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { connect } from "node:net";
import { createDevServer, detectPreview, devArgs, frameProxy, framableHeaders, freePort } from "./devserver.mjs";
import { tempDir } from "./tmpdirs.mjs";

const project = async (files) => {
  const dir = await tempDir("op-dev-");
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), text);
  }
  return dir;
};
const get = (port, path, host = `127.0.0.1:${port}`) =>
  new Promise((ok, ko) => {
    request({ port, host: "127.0.0.1", path, headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => ok({ status: res.statusCode, body, type: res.headers["content-type"] }));
    })
      .on("error", ko)
      .end();
  });
// Plage de ports propre aux tests (le 3100 de l'élève n'est jamais touché).
let nextRange = 43100 + Math.floor(Math.random() * 500) * 4;
const range = () => {
  nextRange += 4;
  return [nextRange, nextRange + 3];
};

test("detectPreview : npm (framework reconnu), site statique, ou rien", async () => {
  assert.deepEqual(await detectPreview(await project({ "package.json": JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "16" } }) })), {
    mode: "npm", command: "npm run dev", framework: "next",
  });
  assert.equal((await detectPreview(await project({ "package.json": JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "8" } }) }))).framework, "vite");
  assert.equal((await detectPreview(await project({ "index.html": "<h1>x</h1>", "package.json": "{}" }))).mode, "static");
  assert.equal((await detectPreview(await project({ "README.md": "x" }))).mode, "none");
});

test("devArgs : port et hôte local imposés selon le framework", () => {
  assert.deepEqual(devArgs("next", 3101), ["-p", "3101", "-H", "127.0.0.1"]);
  assert.deepEqual(devArgs("vite", 3100), ["--port", "3100", "--strictPort", "--host", "127.0.0.1"]);
  assert.deepEqual(devArgs(null, 3100), []);
});

test("freePort : saute un port déjà pris", async () => {
  const [from, to] = range();
  const busy = createServer().listen(from, "127.0.0.1");
  await new Promise((ok) => busy.once("listening", ok));
  try {
    assert.equal(await freePort([from, to]), from + 1);
  } finally {
    busy.close();
  }
});

test("site statique : sert le projet sur 127.0.0.1, jamais .env ni .git, refuse un autre hôte ; arrêt", async () => {
  const dir = await project({ "index.html": "<h1>Mes tâches</h1>", "src/app.js": "console.log(1)", ".env": "SECRET=1", ".git/config": "x" });
  let changes = 0;
  const dev = createDevServer({ projectDir: dir, ports: range(), onChange: () => changes++ });
  assert.equal((await dev.snapshot()).mode, "static");
  await dev.start();
  const snap = await dev.snapshot();
  assert.equal(snap.status, "running");
  const port = Number(new URL(snap.url).port);
  assert.match(snap.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual([(await get(port, "/")).body, (await get(port, "/src/app.js")).type], ["<h1>Mes tâches</h1>", "text/javascript; charset=utf-8"]);
  for (const bad of ["/.env", "/.git/config", "/../x", "/absent.html"]) assert.equal((await get(port, bad)).status, 404, bad);
  assert.equal((await get(port, "/", "evil.example:80")).status, 403);
  dev.stop();
  assert.equal((await dev.snapshot()).status, "idle");
  assert.ok(changes >= 2);
});

// Faux « npm run dev » : ouvre vraiment le port demandé, comme un serveur de dev.
function fakeNpm({ announce = null, exitCode = null } = {}) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = undefined;
    calls.push({ cmd, args, opts });
    if (exitCode !== null) {
      setTimeout(() => (child.stderr.emit("data", "Error: boom\n"), child.emit("exit", exitCode)), 20);
      child.kill = () => {};
      return child;
    }
    const port = announce ?? Number(opts.env.PORT);
    const server = createServer((_, res) => res.end("dev")).listen(port, "127.0.0.1");
    setTimeout(() => child.stdout.emit("data", `  ▲ Local: http://localhost:${port}\n`), 30);
    child.kill = () => {
      server.close();
      child.killed = true;
    };
    return child;
  };
  return { spawn, calls };
}

test("projet npm : lance « npm run dev » avec port et hôte imposés, attend qu'il réponde ; arrêt tue le serveur", async () => {
  const dir = await project({ "package.json": JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "16" } }), "node_modules/.keep": "" });
  const fake = fakeNpm();
  const ports = range();
  const dev = createDevServer({ projectDir: dir, spawn: fake.spawn, ports });
  await dev.start();
  assert.equal((await dev.snapshot()).status, "starting");
  const [{ args, opts }] = fake.calls;
  assert.deepEqual(args, ["run", "dev", "--", "-p", String(ports[0]), "-H", "127.0.0.1"]);
  assert.deepEqual([opts.env.PORT, opts.env.HOST, opts.cwd, "CLAUDECODE" in opts.env], [String(ports[0]), "127.0.0.1", dir, false]);
  for (let i = 0; i < 40 && (await dev.snapshot()).status !== "running"; i++) await new Promise((r) => setTimeout(r, 100));
  const running = await dev.snapshot();
  assert.equal(running.url, `http://127.0.0.1:${ports[0]}/`);
  // Aperçu en cadre : par le relais local, pas l'adresse directe.
  assert.notEqual(running.frameUrl, running.url);
  assert.equal(await (await fetch(running.frameUrl)).text(), "dev");
  dev.stop();
  assert.equal((await dev.snapshot()).frameUrl, null);
  await assert.rejects(fetch(running.frameUrl));
  assert.equal((await dev.snapshot()).status, "idle");
});

test("projet npm : dépendances absentes ou serveur qui plante, message clair et journal", async () => {
  const pkg = JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "8" } });
  const noDeps = createDevServer({ projectDir: await project({ "package.json": pkg }), spawn: fakeNpm().spawn, ports: range() });
  await noDeps.start();
  assert.match((await noDeps.snapshot()).error, /npm install/);

  const crash = createDevServer({ projectDir: await project({ "package.json": pkg, "node_modules/.keep": "" }), spawn: fakeNpm({ exitCode: 1 }).spawn, ports: range() });
  await crash.start();
  for (let i = 0; i < 20 && (await crash.snapshot()).status !== "failed"; i++) await new Promise((r) => setTimeout(r, 50));
  const snap = await crash.snapshot();
  assert.deepEqual([snap.status, snap.error], ["failed", "Le serveur de dev s'est arrêté (code 1)."]);
  assert.match(snap.log, /boom/);
});

test("rien à lancer : start refusé proprement", async () => {
  const dev = createDevServer({ projectDir: await project({ "README.md": "x" }), ports: range() });
  await assert.rejects(dev.start(), (e) => e.status === 409);
});

test("framableHeaders : X-Frame-Options retiré, frame-ancestors limité aux pages locales, le reste intact", () => {
  const out = framableHeaders({
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    "set-cookie": ["a=1", "b=2"],
    "content-type": "text/html",
  });
  assert.deepEqual(Object.keys(out), ["content-security-policy", "set-cookie", "content-type"]);
  assert.equal(out["content-security-policy"], "default-src 'self'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*; base-uri 'self'");
  assert.deepEqual(out["set-cookie"], ["a=1", "b=2"]);
  assert.deepEqual(framableHeaders({ "content-security-policy": "default-src 'self'" }), { "content-security-policy": "default-src 'self'" });
});

test("frameProxy : relaie pages et WebSocket vers le serveur de dev, sans en-têtes anti-cadre ; refuse un autre hôte", async () => {
  const app = createServer((req, res) => {
    res.writeHead(200, { "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'", "X-Host": req.headers.host });
    res.end(`page ${req.url}`);
  });
  app.on("upgrade", (_, socket) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.on("data", (d) => socket.write(`echo:${d}`));
  });
  await new Promise((ok) => app.listen(0, "127.0.0.1", ok));
  const proxy = frameProxy(app.address().port);
  await new Promise((ok) => proxy.server.listen(0, "127.0.0.1", ok));
  const port = proxy.server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/agenda?jour=1`);
    assert.equal(await res.text(), "page /agenda?jour=1");
    assert.equal(res.headers.get("x-frame-options"), null);
    assert.match(res.headers.get("content-security-policy"), /^frame-ancestors 'self' http:\/\/127\.0\.0\.1:\*/);
    assert.equal(res.headers.get("x-host"), `127.0.0.1:${port}`); // Host conservé : actions serveur et redirections
    const evil = await new Promise((ok) => request({ port, host: "127.0.0.1", headers: { host: "evil.test" } }, (r) => ok(r.statusCode)).end());
    assert.equal(evil, 403);
    // WebSocket (rechargement à chaud) : poignée de main puis échanges relayés.
    const reply = await new Promise((ok, ko) => {
      const socket = connect(port, "127.0.0.1", () => socket.write(`GET /_next/hmr HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`));
      let data = "";
      socket.on("data", (d) => {
        data += d;
        if (data.includes("\r\n\r\n") && !data.includes("echo:")) socket.write("ping");
        if (data.includes("echo:ping")) (socket.destroy(), ok(data));
      });
      socket.on("error", ko);
    });
    assert.match(reply, /^HTTP\/1\.1 101/);
  } finally {
    proxy.close();
    app.closeAllConnections();
    app.close();
  }
});
