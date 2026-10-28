import type { Agent, Service, SupabaseTarget } from "./types";

// D'où vient un service branché.
export const VIA: Record<string, string> = {
  projet: ".mcp.json du projet",
  local: "réglage de ce projet (claude mcp add)",
  utilisateur: "réglage global de Claude Code",
  "connecteur claude.ai": "connecteur claude.ai",
};

export const supabaseDashboard = (ref: string) => `https://supabase.com/dashboard/project/${ref}`;

// « projet abcd…, lecture seule » ou « tous les projets de ton compte ».
export const targetText = (t: SupabaseTarget) =>
  t.project ? `projet ${t.project}${t.readOnly ? ", lecture seule" : ""}` : "tous les projets de ton compte Supabase";

// Comment brancher un service qui manque (même contenu que le README du plugin).
// Commande à lancer dans un terminal (ou précédée de « ! » dans Claude Code).
export const ADD_HINT: Record<string, { command?: string; note?: string }> = {
  supabase: {
    command: 'claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=REF_DU_PROJET_DE_DEV"',
    note: "Remplace REF_DU_PROJET_DE_DEV par la référence du projet de dev (Supabase, Project Settings) : les agents n'atteindront jamais la prod.",
  },
  stripe: { command: "claude mcp add --transport http stripe https://mcp.stripe.com", note: "Connecte un compte de test (sandbox Stripe), jamais le compte réel." },
  vercel: { command: "claude mcp add --transport http vercel https://mcp.vercel.com" },
  notion: { command: "claude mcp add --transport http notion https://mcp.notion.com/mcp" },
  figma: { command: "claude mcp add --transport http figma https://mcp.figma.com/mcp" },
  context7: { command: "claude mcp add --transport http context7 https://mcp.context7.com/mcp" },
  github: { note: "Demande une clé (jeton GitHub) : suis la section « Les 9 MCP recommandés » du README du plugin, clé en variable d'environnement, jamais en clair." },
  brevo: { note: "Demande une clé API : suis la section « Les 9 MCP recommandés » du README du plugin, clé en variable d'environnement, jamais en clair." },
  resend: { note: "Demande une clé API : suis la section « Les 9 MCP recommandés » du README du plugin, clé en variable d'environnement, jamais en clair." },
  pencil: { note: "Fourni par l'application Pencil (pencil.dev) : ouvre-la sur ton ordinateur." },
};

const LABEL: Record<string, string> = {
  supabase: "Supabase", stripe: "Stripe", github: "GitHub", vercel: "Vercel", notion: "Notion", figma: "Figma",
  context7: "Context7", brevo: "Brevo", resend: "Resend", pencil: "Pencil",
};
export const serviceLabel = (key: string) => LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

// on : déclaré dans une configuration (projet, local, utilisateur) ; maybe : connecteur claude.ai
// connecté au moins une fois ; auth : connecteur que Claude Code signale à authentifier ; off : absent.
export type ServiceState = "on" | "maybe" | "auth" | "off";
export type AgentService = { key: string; label: string; state: ServiceState; on: boolean; via: string[]; targets: SupabaseTarget[] };

const stateOf = (s: Service | undefined): ServiceState => {
  if (!s) return "off";
  if (s.via.some((v) => v !== "connecteur claude.ai")) return "on";
  return s.needsAuth ? "auth" : "maybe";
};
const ORDER: Record<ServiceState, number> = { on: 0, maybe: 1, auth: 2, off: 3 };

// Services de l'agent, branchés d'abord.
export function agentServices(agent: Agent, project: Service[] | undefined): AgentService[] {
  const byKey = new Map((project ?? []).map((s) => [s.key, s]));
  return (agent.services ?? [])
    .map((key) => {
      const s = byKey.get(key);
      const state = stateOf(s);
      return { key, label: s?.label ?? serviceLabel(key), state, on: state !== "off", via: s?.via ?? [], targets: s?.targets ?? [] };
    })
    .sort((a, b) => ORDER[a.state] - ORDER[b.state]);
}
