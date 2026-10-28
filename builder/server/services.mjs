// Services externes (MCP) branchés pour le projet et ceux que chaque agent sait utiliser.
// On ne lit que des NOMS de serveurs, jamais leur configuration (elle peut contenir des clés) ;
// seule exception : le projet visé par Supabase et son mode lecture seule (supabaseScope).
// Sources : .mcp.json du projet (moins ceux que l'utilisateur a refusés), ~/.claude.json
// (serveurs de l'utilisateur, serveurs locaux du projet), connecteurs claude.ai déjà connectés
// (« déjà » : on ne sait pas s'ils le sont encore ; ceux que Claude Code signale à authentifier
// portent needsAuth).
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const LABEL = {
  supabase: "Supabase", stripe: "Stripe", github: "GitHub", vercel: "Vercel", notion: "Notion", figma: "Figma",
  context7: "Context7", brevo: "Brevo", resend: "Resend", pencil: "Pencil", playwright: "Playwright",
};

const labelOf = (key) => LABEL[key] ?? key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const keyOf = (name) => name.trim().toLowerCase().replace(/[\s-]+/g, "_");

// « mcp__claude_ai_Supabase__list_tables » → « supabase » ; null pour un outil natif.
export function serviceOfTool(tool) {
  const server = /^mcp__(.+?)(?:__.*)?$/.exec(tool)?.[1];
  if (!server) return null;
  if (server.startsWith("claude_ai_")) return keyOf(server.slice("claude_ai_".length));
  const plugin = /^plugin_[^_]+_(.+)$/.exec(server);
  return keyOf(plugin ? plugin[1] : server);
}

export const servicesOfTools = (tools) => [...new Set(tools.map(serviceOfTool).filter(Boolean))];

// ~/.claude.json peut peser lourd et change souvent : relu seulement si modifié.
const cache = new Map();
async function readJson(path) {
  try {
    const { mtimeMs } = await stat(path);
    const hit = cache.get(path);
    if (hit?.mtimeMs === mtimeMs) return hit.data;
    const data = JSON.parse(await readFile(path, "utf8"));
    cache.set(path, { mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

// Projet Supabase visé par un serveur MCP, et s'il est en lecture seule : seulement ces deux
// réglages (la référence d'un projet n'est pas un secret), jamais l'environnement ni les en-têtes.
export function supabaseScope(config) {
  const scope = { project: null, readOnly: false };
  if (typeof config?.url === "string") {
    try {
      const url = new URL(config.url);
      scope.project = url.searchParams.get("project_ref") || null;
      scope.readOnly = url.searchParams.get("read_only") === "true";
    } catch {
      // adresse illisible : cible inconnue
    }
  }
  const args = Array.isArray(config?.args) ? config.args.map(String) : [];
  args.forEach((arg, i) => {
    const m = /^--project-ref(?:=(.+))?$/.exec(arg);
    if (m) scope.project = m[1] ?? args[i + 1] ?? null;
    if (arg === "--read-only") scope.readOnly = true;
  });
  if (scope.project && !/^[a-z0-9]{10,40}$/.test(scope.project)) scope.project = null;
  return scope;
}

export async function detectServices({ projectDir, claudeConfigPath = join(homedir(), ".claude.json") }) {
  const found = new Map();
  const add = (name, via, config) => {
    const key = keyOf(name);
    if (!key) return;
    const entry = found.get(key) ?? { key, label: labelOf(key), via: [] };
    if (!entry.via.includes(via)) entry.via.push(via);
    // Supabase : quel projet chaque source laisse atteindre (un connecteur claude.ai : tout le compte).
    if (key === "supabase") entry.targets = [...(entry.targets ?? []), { via, ...(config ? supabaseScope(config) : { project: null, readOnly: false }) }];
    found.set(key, entry);
  };
  const serversOf = (servers) => (servers && typeof servers === "object" && !Array.isArray(servers) ? Object.entries(servers) : []);
  const config = (await readJson(claudeConfigPath)) ?? {};
  const local = config.projects?.[resolve(projectDir)] ?? {};
  const refused = new Set(Array.isArray(local.disabledMcpjsonServers) ? local.disabledMcpjsonServers : []);

  for (const [name, conf] of serversOf((await readJson(join(projectDir, ".mcp.json")))?.mcpServers)) if (!refused.has(name)) add(name, "projet", conf);
  for (const [name, conf] of serversOf(local.mcpServers)) add(name, "local", conf);
  for (const [name, conf] of serversOf(config.mcpServers)) add(name, "utilisateur", conf);
  const needsAuth = new Set(Array.isArray(config.mcpNeedsAuthNoticed) ? config.mcpNeedsAuthNoticed : []);
  for (const name of Array.isArray(config.claudeAiMcpEverConnected) ? config.claudeAiMcpEverConnected : []) {
    if (typeof name !== "string" || !name.startsWith("claude.ai ")) continue;
    add(name.slice("claude.ai ".length), "connecteur claude.ai");
    // Claude Code a signalé que ce connecteur demande une authentification.
    if (needsAuth.has(name)) found.get(keyOf(name.slice("claude.ai ".length))).needsAuth = true;
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}
