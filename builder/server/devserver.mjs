// Aperçu de l'app du projet : un serveur local lancé à la demande de l'élève, sur
// 127.0.0.1 seulement, port 3100 (convention Ottho) ou le suivant libre, arrêté avec
// l'app. Deux modes : site statique (index.html à la racine), servi par le pipeline
// lui-même ; projet npm (script « dev »), lancé avec le port et l'hôte imposés.
import { spawn as nodeSpawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { HttpError } from "./files.mjs";
import { shellEnv } from "./shellenv.mjs";

const PORTS = [3100, 3120];
const READY_TIMEOUT = 90_000;
const MAX_LOG = 32 * 1024;
const EXCLUDED = new Set(["node_modules", ".git"]);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};

const exists = (path) => stat(path).then(() => true, () => false);

// Ce que « Lancer l'aperçu » ferait dans ce projet.
export async function detectPreview(projectDir) {
  let pkg = null;
  try {
    pkg = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
  } catch {
    // pas de package.json (ou illisible)
  }
  if (typeof pkg?.scripts?.dev === "string") {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const framework = ["next", "vite", "astro", "nuxt"].find((name) => name in deps) ?? null;
    return { mode: "npm", command: "npm run dev", framework };
  }
  if (await exists(join(projectDir, "index.html"))) return { mode: "static", command: null, framework: null };
  return { mode: "none", command: null, framework: null };
}

// Port et hôte imposés au serveur de dev, selon le framework (PORT et HOST suffisent aux autres).
export function devArgs(framework, port) {
  if (framework === "next") return ["-p", String(port), "-H", "127.0.0.1"];
  if (framework === "vite") return ["--port", String(port), "--strictPort", "--host", "127.0.0.1"];
  if (framework === "astro" || framework === "nuxt") return ["--port", String(port), "--host", "127.0.0.1"];
  return [];
}

// Quelqu'un écoute-t-il déjà ? (plus sûr qu'un essai d'écoute : un serveur sur *:3100 en IPv6
// n'empêche pas toujours d'écouter sur 127.0.0.1:3100, mais on ne veut pas lui voler le port.)
const listening = (port, host = "127.0.0.1") =>
  new Promise((ok) => {
    const socket = connect({ port, host });
    socket.once("connect", () => (socket.destroy(), ok(true)));
    socket.once("error", () => ok(false));
    socket.setTimeout(400, () => (socket.destroy(), ok(false)));
  });

export async function freePort([from, to] = PORTS) {
  for (let port = from; port <= to; port++) if (!(await listening(port))) return port;
  throw new Error(`Aucun port libre entre ${from} et ${to}.`);
}

// Site statique : fichiers du projet, jamais un fichier caché (.env, .git) ni node_modules.
function staticServer(projectDir) {
  const root = resolve(projectDir);
  const server = createServer(async (req, res) => {
    const port = server.address()?.port;
    // Anti « DNS rebinding » : un site tiers ne peut pas lire le projet par ce port.
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? "")) return res.writeHead(403).end();
    if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
    } catch {
      return res.writeHead(400).end();
    }
    const parts = normalize(rel).split(/[\\/]/).filter(Boolean);
    if (parts.some((p) => p === ".." || p.startsWith(".") || EXCLUDED.has(p))) return res.writeHead(404).end("Introuvable");
    let file = resolve(root, ...parts);
    if (file !== root && !file.startsWith(root + sep)) return res.writeHead(404).end("Introuvable");
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file).catch(() => null);
    if (!body) return res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return server;
}

// L'app du projet interdit souvent d'être affichée dans un cadre (X-Frame-Options, directive
// frame-ancestors de sa CSP) : bonne protection une fois en ligne, mais elle bloque l'aperçu
// du pipeline (« 127.0.0.1 n'autorise pas la connexion »). Le relais ci-dessous retire
// X-Frame-Options et n'autorise le cadre que depuis une page locale ; tout le reste passe tel quel.
const LOCAL_FRAMERS = "'self' http://127.0.0.1:* http://localhost:*";

export function framableHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || name.toLowerCase() === "x-frame-options") continue;
    const fix = (v) => v.replace(/frame-ancestors[^;]*/gi, `frame-ancestors ${LOCAL_FRAMERS}`);
    out[name] = name.toLowerCase() === "content-security-policy" ? (Array.isArray(value) ? value.map(fix) : fix(value)) : value;
  }
  return out;
}

// Relais local vers le serveur de dev, pour l'aperçu en cadre. Même hôte (127.0.0.1) et en-tête
// Host conservé : cookies, redirections et actions serveur de l'app marchent comme en direct.
export function frameProxy(targetPort) {
  const sockets = new Set();
  const server = createServer();
  const localHost = (req) => [`127.0.0.1:${server.address()?.port}`, `localhost:${server.address()?.port}`].includes(req.headers.host ?? "");
  server.on("request", (req, res) => {
    // Anti « DNS rebinding », comme le site statique.
    if (!localHost(req)) return res.writeHead(403).end();
    const upstream = httpRequest({ host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, framableHeaders(up.headers));
      up.pipe(res);
    });
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" }).end("Le serveur de dev ne répond pas.");
    });
    req.pipe(upstream);
  });
  // Rechargement à chaud (WebSocket) : la connexion est relayée telle quelle dans les deux sens.
  server.on("upgrade", (req, socket, head) => {
    if (!localHost(req)) return socket.destroy();
    const upstream = connect(targetPort, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    for (const s of [socket, upstream]) {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
      s.on("error", () => (socket.destroy(), upstream.destroy()));
    }
  });
  const close = () => {
    server.closeAllConnections();
    server.close();
    for (const s of sockets) s.destroy();
  };
  return { server, close };
}

function killTree(child) {
  if (process.platform === "win32") {
    nodeSpawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM"); // groupe : npm et le serveur qu'il a lancé
  } catch {
    child.kill("SIGTERM");
  }
}

export function createDevServer({ projectDir, spawn = nodeSpawn, onChange = () => {}, ports = PORTS, readyTimeout = READY_TIMEOUT }) {
  // url : adresse directe (onglet) ; frameUrl : adresse affichée dans l'aperçu (relais pour npm).
  let state = { status: "idle", url: null, frameUrl: null, error: null };
  let log = "";
  let http = null;
  let child = null;
  let frame = null;
  const closeFrame = () => {
    frame?.close();
    frame = null;
  };
  let detected = { mode: "none", command: null, framework: null };
  const set = (patch) => {
    state = { ...state, ...patch };
    onChange();
  };
  const append = (chunk) => {
    log = (log + String(chunk)).slice(-MAX_LOG);
  };

  async function snapshot() {
    if (state.status === "idle" || state.status === "failed") detected = await detectPreview(projectDir);
    return { ...state, mode: detected.mode, command: detected.command, log: log.slice(-4000) };
  }

  async function start() {
    if (state.status === "starting" || state.status === "running") return;
    detected = await detectPreview(projectDir);
    log = "";
    if (detected.mode === "none") throw new HttpError(409, "Rien à lancer : ni index.html ni script « dev » dans package.json.");
    const port = await freePort(ports);
    if (detected.mode === "static") {
      http = staticServer(projectDir);
      await new Promise((ok, ko) => http.once("error", ko).listen(port, "127.0.0.1", ok));
      const url = `http://127.0.0.1:${port}/`;
      set({ status: "running", url, frameUrl: url, error: null });
      return;
    }
    if (!(await exists(join(projectDir, "node_modules")))) {
      set({ status: "failed", url: null, frameUrl: null, error: "Dépendances non installées : lance « npm install » dans le projet (ou demande-le à Claude), puis relance l'aperçu." });
      return;
    }
    const windows = process.platform === "win32";
    const args = ["run", "dev", "--", ...devArgs(detected.framework, port)];
    const current = spawn(windows ? "npm.cmd" : "npm", args, {
      cwd: projectDir,
      env: { ...shellEnv(process.env), PORT: String(port), HOST: "127.0.0.1", BROWSER: "none" },
      detached: !windows,
      shell: windows,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = current;
    set({ status: "starting", url: null, frameUrl: null, error: null });
    let announced = null;
    const onOutput = (chunk) => {
      append(chunk);
      // Un framework qui choisit un autre port l'annonce : « Local: http://localhost:5174 ».
      const m = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/.exec(String(chunk));
      if (m) announced = Number(m[1]);
    };
    current.stdout?.on("data", onOutput);
    current.stderr?.on("data", onOutput);
    current.on("exit", (code) => {
      if (child !== current) return;
      child = null;
      closeFrame();
      if (state.status !== "idle") set({ status: "failed", url: null, frameUrl: null, error: `Le serveur de dev s'est arrêté (code ${code ?? "?"}).` });
    });
    const deadline = Date.now() + readyTimeout;
    (async function waitReady() {
      while (child === current && Date.now() < deadline) {
        for (const p of new Set([port, announced].filter(Boolean))) {
          if (await listening(p)) {
            if (child !== current) return;
            const proxy = frameProxy(p);
            const frameUrl = await new Promise((ok) => {
              proxy.server.once("error", () => ok(null)).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${proxy.server.address().port}/`));
            });
            if (child !== current) return proxy.close();
            const url = `http://127.0.0.1:${p}/`;
            if (frameUrl) frame = proxy;
            else proxy.close(); // relais impossible : aperçu direct (bloqué si l'app l'interdit)
            set({ status: "running", url, frameUrl: frameUrl ?? url });
            return;
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (child === current) {
        killTree(current);
        child = null;
        set({ status: "failed", url: null, frameUrl: null, error: "Le serveur de dev n'a pas répondu à temps." });
      }
    })();
  }

  function stop() {
    closeFrame();
    if (http) {
      http.closeAllConnections();
      http.close();
      http = null;
    }
    if (child) {
      const current = child;
      child = null;
      killTree(current);
    }
    if (state.status !== "idle") set({ status: "idle", url: null, frameUrl: null, error: null });
  }

  return { start, stop, snapshot };
}
