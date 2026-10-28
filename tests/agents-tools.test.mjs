// Cohérence entre ce que les consignes des agents promettent (« le MCP `supabase` »)
// et ce que leur ligne `tools:` autorise vraiment : une liste fermée, où un service
// absent est invisible pour le sous-agent. Voir README, « Les 9 MCP recommandés ».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AGENTS_DIR = new URL("../agents/", import.meta.url).pathname;
const KNOWN = ["github", "vercel", "supabase", "stripe", "brevo", "resend", "notion", "figma", "context7"];
// Même service branché comme connecteur claude.ai : autre préfixe d'outils.
const CONNECTOR = { supabase: "claude_ai_Supabase", stripe: "claude_ai_Stripe", vercel: "claude_ai_Vercel", notion: "claude_ai_Notion", figma: "claude_ai_Figma" };
const SUPABASE_DANGER = ["create_project", "create_branch", "confirm_cost", "pause_project", "restore_project", "delete_branch", "merge_branch", "reset_branch", "rebase_branch"];
const VERCEL_PAID = ["buy_addon", "buy_credits", "buy_credits_endpoint", "buy_domain", "buy_domains", "buy_pro", "buy_single_domain", "create_or_transfer_domain"];
const prefixes = (server) => [`mcp__${server}`, ...(CONNECTOR[server] ? [`mcp__${CONNECTOR[server]}`] : [])];

function load(file) {
  const text = readFileSync(join(AGENTS_DIR, file), "utf8");
  const [, head, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  const list = (key) => (new RegExp(`^${key}:\\s*(.*)$`, "m").exec(head)?.[1] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return { name: file.replace(/\.md$/, ""), tools: list("tools"), disallowed: list("disallowedTools"), body };
}
const agents = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map(load);
const byName = Object.fromEntries(agents.map((a) => [a.name, a]));

// Accès à un service : le serveur entier, ou au moins un de ses outils, sous chacun de ses noms.
const grants = (agent, server) => prefixes(server).every((p) => agent.tools.some((t) => t === p || t.startsWith(`${p}__`)));
const fullServer = (agent, server) => prefixes(server).some((p) => agent.tools.includes(p));

test("chaque service cité dans les consignes d'un agent lui est accordé, sous ses deux noms", () => {
  for (const agent of agents) {
    const cited = new Set();
    for (const line of agent.body.split("\n").filter((l) => /\bMCP\b/.test(l))) {
      for (const [, word] of line.matchAll(/`([a-z0-9]+)`/g)) if (KNOWN.includes(word)) cited.add(word);
    }
    for (const server of cited) assert.ok(grants(agent, server), `${agent.name} cite le MCP ${server} sans y avoir accès`);
  }
});

test("répartition des services : chaque agent a ceux de son métier", () => {
  const expected = {
    developer: ["supabase", "stripe", "context7", "brevo", "resend", "notion"],
    devops: ["github", "vercel", "supabase"],
    architect: ["context7", "supabase"],
    "security-auditor": ["supabase"],
    "spec-writer": ["notion"],
    "doc-writer": ["notion"],
    brainstorming: ["notion"],
    designer: ["figma"],
  };
  for (const [name, servers] of Object.entries(expected)) {
    for (const server of servers) assert.ok(grants(byName[name], server), `${name} devrait avoir ${server}`);
  }
});

test("Supabase entier : actions destructives et payantes retirées, sous les deux noms", () => {
  for (const agent of agents.filter((a) => fullServer(a, "supabase"))) {
    for (const p of prefixes("supabase")) {
      for (const tool of SUPABASE_DANGER) assert.ok(agent.disallowed.includes(`${p}__${tool}`), `${agent.name} : ${p}__${tool} doit être interdit`);
    }
  }
});

test("Vercel entier : achats interdits (domaines, crédits, abonnements)", () => {
  for (const agent of agents.filter((a) => fullServer(a, "vercel"))) {
    for (const p of prefixes("vercel")) {
      for (const tool of VERCEL_PAID) assert.ok(agent.disallowed.includes(`${p}__${tool}`), `${agent.name} : ${p}__${tool} doit être interdit`);
    }
  }
});

test("architect et security-auditor lisent Supabase sans pouvoir l'écrire", () => {
  for (const name of ["architect", "security-auditor"]) {
    const agent = byName[name];
    assert.equal(fullServer(agent, "supabase"), false, `${name} ne doit pas avoir Supabase entier`);
    const supa = agent.tools.filter((t) => prefixes("supabase").some((p) => t.startsWith(`${p}__`)));
    for (const tool of supa) assert.match(tool, /__(list_\w+|get_\w+|search_docs|generate_typescript_types)$/, `${name} : ${tool} n'est pas une lecture`);
  }
});

test("aucun agent ne peut confirmer un coût ni acheter", () => {
  for (const agent of agents) {
    for (const tool of agent.tools) assert.doesNotMatch(tool, /__(confirm_cost|buy_\w+)$/, `${agent.name} : ${tool}`);
  }
});
