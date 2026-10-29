// Serveur local de l'app : état JSON, flux SSE, fichiers du build. Écoute sur
// 127.0.0.1 et refuse tout Host qui n'est pas local (anti DNS rebinding). L'app lit le
// projet ; réponses, brief, validations et fichiers de marque passent par le CLI. Seules
// écritures : .env.local (POST /api/config) et le lancement ou l'arrêt de l'aperçu
// (POST /api/preview/start, /api/preview/stop). Protégées par Origin + jeton de lancement.
// Les hooks du plugin inscrivent leur session Claude Code (GET /api/health?session=) et la
// retirent à sa fermeture (POST /api/session-end, refusé à toute page) : l'app s'arrête avec la
// dernière.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { loadAgents } from "./agents.mjs";
import { deriveFeatures, readSnapshot } from "./features.mjs";
import { eventsPath, pairRuns, parseEvents, sessionStatus } from "./events.mjs";
import { signature } from "./signature.mjs";
import { detectServices } from "./services.mjs";
import { createDevServer } from "./devserver.mjs";
import { detectAppDatabase } from "./database.mjs";
import { configStatus, writeEnv } from "./envfile.mjs";
import { readBrief } from "./brief.mjs";
import { projectPhase } from "./project.mjs";
import { collectQuestions } from "./questions.mjs";
import { IMAGE_RE, PREVIEW_RE, collectDeliverables, readDeliverable } from "./deliverables.mjs";
import { staticPreview } from "./preview.mjs";
import { collectAssets } from "./assets.mjs";
import { listProjectDocs, readProjectFile } from "./viewer.mjs";
import { HttpError } from "./files.mjs";

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

// Fichier de maquette sous design/ uniquement (le chemin doit y rester une fois résolu).
async function designRead(projectDir, rel, pattern) {
  if (typeof rel !== "string" || !rel.startsWith("design/") || !pattern.test(rel)) return null;
  const root = resolve(projectDir, "design");
  const file = resolve(projectDir, rel);
  if (!file.startsWith(root + sep)) return null;
  const body = await readFile(file).catch(() => null);
  return body ? { body, file } : null;
}

// Image de maquette (exports Pencil) : servie avec une CSP qui interdit tout script
// (un SVG ne peut rien exécuter).
async function designFile(projectDir, rel) {
  const found = await designRead(projectDir, rel, IMAGE_RE);
  return found ? { body: found.body, type: IMAGE_TYPES[extname(found.file).toLowerCase()] } : null;
}

// Écran de canevas en aperçu statique : scripts retirés à la transformation, et la
// CSP n'autorise aucun script (seulement styles en ligne et Google Fonts).
const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data:";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

export async function buildState({ projectDir, pluginDir, claudeConfigPath }) {
  const [agents, snap, text, found, assets, services, database, brief] = await Promise.all([
    loadAgents({ projectDir, pluginDir }),
    readSnapshot(projectDir),
    readFile(eventsPath(projectDir), "utf8").catch(() => ""),
    collectDeliverables(projectDir),
    collectAssets(projectDir),
    detectServices({ projectDir, claudeConfigPath }),
    detectAppDatabase(projectDir),
    readBrief(projectDir),
  ]);
  const { events, corrupt } = parseEvents(text);
  const runs = pairRuns(events.slice(-1000));
  // Questions et autorisation en attente dans la session principale (terminal central).
  const session = sessionStatus(events.slice(-1000));
  const { features, focus, deliverables } = deriveFeatures(snap, runs, found);
  // Réponses données dans le sélecteur du terminal : les questions correspondantes sont répondues.
  const terminalAnswers = events.filter((e) => e.type === "answered").flatMap((e) => (Array.isArray(e.pairs) ? e.pairs : []));
  const lastReplyAt = events.findLast((e) => e.type === "reply" || e.type === "answered")?.ts ?? null;
  const questions = await collectQuestions({ projectDir, runs, terminalAnswers, lastReplyAt });
  // Phase projet (avant la première feature) : Brief → Vision → PRD → Architecture → Infra.
  const phase = await projectPhase({ projectDir, snap, runs, deliverables, brief });
  return {
    project: { dir: projectDir, name: basename(projectDir) },
    git: snap.git !== null,
    // Branche courante du projet et nombre de fichiers non commités (barre du haut).
    branch: snap.git ? { name: snap.git.current || null, dirty: snap.git.dirty ?? 0 } : null,
    pluginFound: Boolean(pluginDir),
    agents,
    features,
    focus,
    // Le compte rendu reste côté serveur (chargé à la demande) : le flux reste léger.
    runs: runs
      .slice(-200)
      .reverse()
      .map(({ report, ...run }) => ({ ...run, hasReport: Boolean(report) })),
    questions,
    deliverables,
    assets,
    // Services externes branchés (noms seulement) : croisés avec agent.services dans l'interface.
    services,
    session,
    brief: { exists: brief.exists, complete: brief.complete },
    phase,
    // Base de données de l'app (adresse seulement), lue dans ses .env.
    database,
    corrupt,
    generatedAt: new Date().toISOString(),
  };
}

const SMALL_BODY = 16 * 1024;
// Identifiant de session Claude Code (un UUID) transmis par les hooks.
const SESSION_RE = /^[A-Za-z0-9_-]{1,128}$/;
const isSession = (s) => typeof s === "string" && SESSION_RE.test(s);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readRaw(req, limit) {
  return new Promise((ok, ko) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on("end", () => (size > limit ? ko(new HttpError(413, "Corps trop gros.")) : ok(Buffer.concat(chunks))));
    req.on("error", ko);
  });
}

async function readJson(req, limit) {
  const raw = (await readRaw(req, limit)).toString("utf8");
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    throw new HttpError(400, "Corps invalide.");
  }
}

export function resolveStatic(distDir, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const root = resolve(distDir);
  const file = resolve(root, rel);
  return file.startsWith(root + sep) ? file : null;
}

export function startApp({
  projectDir,
  pluginDir,
  distDir,
  port,
  host = "127.0.0.1",
  pollMs = 1000,
  claudeConfigPath = undefined,
  // Tests : plage de ports et lancement de « npm run dev » remplaçables.
  previewPorts = undefined,
  previewSpawn = undefined,
  // Arrêt automatique (--idle-exit) : aucun onglet branché (client SSE) depuis idleExitMs.
  idleExitMs = null,
  idleCheckMs = 30_000,
  onIdleExit = () => {},
  // Arrêt avec Claude Code : sessions ouvertes sur ce projet (sessions : celle qui a lancé l'app).
  // Quand la dernière se ferme, arrêt après sessionGraceMs, sauf si une autre s'inscrit entre-temps
  // (un /clear ferme la session puis en ouvre une nouvelle aussitôt).
  sessions: initialSessions = [],
  sessionGraceMs = 10_000,
  onSessionsEnd = () => {},
}) {
  const clients = new Set();
  // Onglets branchés ou en cours de branchement (état en calcul) ; dernier instant où il
  // y en avait un (au départ : le lancement).
  let connecting = 0;
  const active = () => clients.size + connecting > 0;
  let lastActive = Date.now();
  const sessions = new Set(initialSessions.filter(isSession));
  let sessionsEnd = null;
  // Arrêt du serveur, défini une fois qu'il écoute.
  let stop = () => {};
  // Aperçu de l'app du projet : lancé seulement quand l'élève clique « Lancer l'aperçu ».
  const preview = createDevServer({
    projectDir,
    ports: previewPorts,
    ...(previewSpawn ? { spawn: previewSpawn } : {}),
    onChange: () => void push().catch(() => {}),
  });
  // Jeton de lancement : la page le reçoit dans l'état, un site tiers ne peut ni
  // le lire ni envoyer l'en-tête sans pré-vol CORS (refusé).
  const token = randomBytes(24).toString("hex");
  let lastSig = null;
  let payload = null;
  let pending = null;

  async function doRefresh() {
    const sig = await signature(projectDir);
    if (sig === lastSig && payload) return false;
    lastSig = sig;
    payload = JSON.stringify({
      ...(await buildState({ projectDir, pluginDir, claudeConfigPath })),
      writeToken: token,
      preview: await preview.snapshot(),
    });
    return true;
  }
  // Un seul recalcul à la fois (poll et requêtes peuvent se croiser).
  const refresh = () => (pending ??= doRefresh().finally(() => (pending = null)));
  const broadcast = () => {
    for (const c of clients) c.write(`data: ${payload}\n\n`);
  };
  // Changement hors fichiers (aperçu qui démarre, s'arrête, plante) : recalcul et diffusion.
  const push = async () => {
    await pending;
    lastSig = null;
    await refresh();
    broadcast();
  };

  // Écritures : même contrôle pour toutes (Origin, jeton, corps JSON), puis recalcul et diffusion.
  const WRITES = {
    "/api/config": {
      limit: 64 * 1024,
      async run(body) {
        if (!body || typeof body.values !== "object" || Array.isArray(body.values)) throw new HttpError(400, "Valeurs attendues.");
        return await writeEnv(projectDir, body.values);
      },
    },
    "/api/preview/start": {
      limit: SMALL_BODY,
      async run() {
        await preview.start();
      },
    },
    "/api/preview/stop": {
      limit: SMALL_BODY,
      async run() {
        preview.stop();
      },
    },
  };

  async function handleWrite(req, res, actual, write) {
    const origins = [`http://127.0.0.1:${actual}`, `http://localhost:${actual}`];
    if (
      !origins.includes(req.headers.origin ?? "") ||
      req.headers["x-ottho-token"] !== token ||
      !(req.headers["content-type"] ?? "").startsWith("application/json")
    ) {
      sendJson(res, 403, { error: "Requête refusée." });
      return;
    }
    let result;
    try {
      result = await write.run(await readJson(req, write.limit));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
      return;
    }
    // Un recalcul lancé avant l'écriture ne doit pas masquer son effet.
    await pending;
    lastSig = null;
    await refresh();
    broadcast();
    sendJson(res, 200, { ok: true, ...(result ?? {}) });
  }

  const addSession = (session) => {
    if (!isSession(session)) return;
    sessions.add(session);
    clearTimeout(sessionsEnd);
    sessionsEnd = null;
  };

  // Fermeture d'une session Claude Code (hook SessionEnd). Jamais une page : un navigateur envoie
  // toujours l'en-tête Origin avec un POST. Seule une session inscrite compte, et son identifiant
  // n'est connu que des hooks : un site tiers ne peut pas arrêter l'app.
  async function handleSessionEnd(req, res) {
    if (req.headers.origin !== undefined || !(req.headers["content-type"] ?? "").startsWith("application/json")) {
      sendJson(res, 403, { error: "Requête refusée." });
      return;
    }
    let body;
    try {
      body = await readJson(req, SMALL_BODY);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const ended = body?.project === projectDir && isSession(body.session) && sessions.delete(body.session);
    if (ended && sessions.size === 0) {
      clearTimeout(sessionsEnd);
      sessionsEnd = setTimeout(() => {
        sessionsEnd = null;
        if (sessions.size) return;
        // Même si la fermeture échoue, le processus ne reste pas en vie sans serveur.
        try {
          stop();
        } finally {
          onSessionsEnd();
        }
      }, sessionGraceMs);
    }
    sendJson(res, 200, { ok: true, ended, stopping: sessionsEnd !== null });
  }

  const server = createServer(async (req, res) => {
    try {
      const actual = server.address().port;
      if (![`127.0.0.1:${actual}`, `localhost:${actual}`].includes(req.headers.host ?? "")) {
        res.writeHead(403).end();
        return;
      }
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/api/session-end") {
        if (req.method === "POST") await handleSessionEnd(req, res);
        else res.writeHead(405).end();
        return;
      }
      if (req.method === "POST" && WRITES[path]) {
        await handleWrite(req, res, actual, WRITES[path]);
        return;
      }
      if (req.method !== "GET") {
        // Route d'écriture appelée avec une autre méthode : 405 ; route inconnue : 404.
        res.writeHead(WRITES[path] ? 405 : 404).end();
        return;
      }
      if (path === "/api/health") {
        // Hook du plugin qui cherche le Builder de son projet : l'adresse qu'il annonce reste
        // valable (un simple sondage des ports, sans le projet, ne retient pas l'app). Avec
        // session : la session Claude Code est inscrite (l'app s'arrêtera avec elle).
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        if (params.get("project") === projectDir) {
          lastActive = Date.now();
          addSession(params.get("session"));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, app: "ottho-pipeline", project: projectDir }));
        return;
      }
      if (path === "/api/report" || path === "/api/file" || path === "/api/docs" || path === "/api/config" || path === "/api/brief") {
        // Historique et documents : compte rendu d'une exécution, liste des .md, lecture d'un fichier (jeton exigé).
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        if (params.get("token") !== token) {
          res.writeHead(403).end();
          return;
        }
        try {
          if (path === "/api/file") {
            sendJson(res, 200, await readProjectFile(projectDir, params.get("path")));
          } else if (path === "/api/docs") {
            sendJson(res, 200, { docs: await listProjectDocs(projectDir) });
          } else if (path === "/api/brief") {
            sendJson(res, 200, await readBrief(projectDir));
          } else if (path === "/api/config") {
            // Services de l'app et variables définies dans .env.local : jamais la valeur d'un secret.
            sendJson(res, 200, await configStatus(projectDir));
          } else {
            const [agent, start] = String(params.get("key") ?? "").split("|");
            const text = await readFile(eventsPath(projectDir), "utf8").catch(() => "");
            const run = pairRuns(parseEvents(text).events).find((r) => r.agent === agent && r.start === start);
            if (!run) throw new HttpError(404, "Exécution introuvable.");
            sendJson(res, 200, { report: run.report });
          }
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          sendJson(res, err.status, { error: err.message });
        }
        return;
      }
      if (path === "/api/design-preview") {
        const found = await designRead(projectDir, new URL(req.url ?? "/", "http://local").searchParams.get("path"), PREVIEW_RE);
        if (!found) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": PREVIEW_CSP,
          "X-Content-Type-Options": "nosniff",
        });
        res.end(staticPreview(found.body.toString("utf8")));
        return;
      }
      if (path === "/api/design-file") {
        const found = await designFile(projectDir, new URL(req.url ?? "/", "http://local").searchParams.get("path"));
        if (!found) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": found.type,
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(found.body);
        return;
      }
      if (path === "/api/deliverable") {
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        try {
          sendJson(res, 200, await readDeliverable({ projectDir, us: params.get("us"), agent: params.get("agent") }));
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          sendJson(res, err.status, { error: err.message });
        }
        return;
      }
      if (path === "/api/state") {
        await refresh();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(payload);
        return;
      }
      if (path === "/api/stream") {
        // Onglet qui se branche : compté actif pendant le calcul de l'état. Fermeture
        // écoutée dès maintenant : un onglet refermé pendant ce calcul n'est jamais ajouté.
        connecting++;
        let gone = false;
        req.on("close", () => {
          gone = true;
          clients.delete(res);
          lastActive = Date.now();
        });
        try {
          await refresh();
          if (gone) return;
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
          res.write(`data: ${payload}\n\n`);
          clients.add(res);
        } finally {
          connecting--;
        }
        return;
      }
      const file = resolveStatic(distDir, req.url ?? "/");
      const body = file ? await readFile(file).catch(() => null) : null;
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err?.message ?? err));
    }
  });

  return new Promise((ok, ko) => {
    server.once("error", ko);
    server.listen(port, host, () => {
      const poll = setInterval(async () => {
        // Aucun onglet : rien à diffuser, rien n'est relu (git compris). Un onglet qui se
        // branche, et /api/state, recalculent l'état eux-mêmes.
        if (!clients.size) return;
        try {
          if (await refresh()) broadcast();
        } catch {
          // état illisible un instant (écriture en cours) : prochain tour
        }
      }, pollMs);
      const ping = setInterval(() => {
        for (const c of clients) c.write(": ping\n\n");
      }, 25_000);
      const idle = idleExitMs
        ? setInterval(() => {
            if (active()) lastActive = Date.now();
            else if (Date.now() - lastActive >= idleExitMs) {
              // Même si la fermeture échoue, le processus ne reste pas en vie sans serveur.
              try {
                close();
              } finally {
                onIdleExit();
              }
            }
          }, idleCheckMs)
        : null;
      const close = () => {
        clearInterval(poll);
        clearInterval(ping);
        clearInterval(idle);
        clearTimeout(sessionsEnd);
        preview.stop();
        for (const c of clients) c.end();
        server.closeAllConnections();
        server.close();
      };
      stop = close;
      ok({ server, port: server.address().port, close });
    });
  });
}
