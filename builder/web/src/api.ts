import type { Brief, BriefBlock, ConfigStatus, Question } from "./types";

export type SaveResult = { ok: true } | { ok: false; message: string };

// Page plus récente que le Builder qui tourne (mise à jour sans arrêt du Builder) : route absente.
export const STALE_SERVER =
  "Le Builder qui tourne est plus ancien que la page : ferme ses onglets (il s'arrête seul au bout de 30 min, ou Ctrl+C s'il a été lancé à la main), puis relance Claude Code.";

export const DELIVERABLE_LABEL: Record<string, string> = {
  "spec-writer": "la spec",
  designer: "la maquette",
  architect: "le plan",
};

export const labelOf = (d: { agent: string; kind?: string }) =>
  d.kind ? (KIND_LABEL[d.kind] ?? "le livrable") : (DELIVERABLE_LABEL[d.agent] ?? "le livrable");
const KIND_LABEL: Record<string, string> = { charte: "la charte graphique", prd: "le PRD", architecture: "l'architecture" };

export type LoadedDeliverable = { file: string; content: string };

export async function getDeliverable(us: string | null, agent: string): Promise<{ ok: true; data: LoadedDeliverable } | { ok: false; message: string }> {
  try {
    const query = `${us ? `us=${encodeURIComponent(us)}&` : ""}agent=${encodeURIComponent(agent)}`;
    const res = await fetch(`/api/deliverable?${query}`);
    const data = await res.json();
    return res.ok ? { ok: true, data } : { ok: false, message: data.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable : vérifie qu'elle tourne toujours." };
  }
}

// Historique : compte rendu d'une exécution et lecture d'un fichier produit.
export async function getReport(token: string, run: { agent: string; start: string }): Promise<string | null> {
  const key = encodeURIComponent(`${run.agent}|${run.start}`);
  const res = await fetch(`/api/report?key=${key}&token=${encodeURIComponent(token)}`).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { report: string | null }).report;
}

export type ProjectFile = { path: string; content: string; kind: "markdown" | "text" };

export async function getProjectFile(token: string, path: string): Promise<{ ok: true; file: ProjectFile } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, file: data as ProjectFile } : { ok: false, message: (data as { error?: string }).error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable." };
  }
}

// Aperçu de l'app du projet : lancer ou arrêter son serveur local.
export async function previewAction(token: string, action: "start" | "stop"): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/preview/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ottho-Token": token },
      body: "{}",
    });
    if (res.ok) return { ok: true };
    if (res.status === 404) return { ok: false, message: STALE_SERVER };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: data.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable : vérifie qu'elle tourne toujours." };
  }
}

// Brief du projet (onboarding) : docs/brief.md.
export async function getBrief(
  token: string,
): Promise<{ ok: true; brief: Brief; blocks: BriefBlock[]; posture: string[]; exists: boolean; complete: boolean } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/brief?token=${encodeURIComponent(token)}`);
    if (res.status === 404) return { ok: false, message: STALE_SERVER };
    const data = (await res.json().catch(() => ({}))) as { data?: Brief; blocks?: BriefBlock[]; posture?: string[]; exists?: boolean; complete?: boolean; error?: string };
    if (res.ok && data.data && data.blocks)
      return { ok: true, brief: data.data, blocks: data.blocks, posture: data.posture ?? [], exists: Boolean(data.exists), complete: Boolean(data.complete) };
    // Réponse sans les blocs du canevas : serveur lancé avant la mise à jour de la page.
    if (res.ok) return { ok: false, message: STALE_SERVER };
    return { ok: false, message: data.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable." };
  }
}

// Configuration des services (.env.local).
export async function getConfig(token: string): Promise<{ ok: true; config: ConfigStatus } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/config?token=${encodeURIComponent(token)}`);
    if (res.status === 404) return { ok: false, message: STALE_SERVER };
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, config: data as ConfigStatus } : { ok: false, message: (data as { error?: string }).error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable." };
  }
}

export async function saveConfig(token: string, values: Record<string, string | null>): Promise<{ ok: true; gitignoreUpdated: boolean } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ottho-Token": token },
      body: JSON.stringify({ values }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; gitignoreUpdated?: boolean };
    return res.ok ? { ok: true, gitignoreUpdated: Boolean(data.gitignoreUpdated) } : { ok: false, message: data.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable." };
  }
}

export type ProjectDoc = { path: string; size: number; mtime: string };

// Documents Markdown du projet (bouton « Documents »).
export async function listDocs(token: string): Promise<{ ok: true; docs: ProjectDoc[] } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/docs?token=${encodeURIComponent(token)}`);
    // Page plus récente que le serveur (mise à jour sans relance) : le dire plutôt qu'« Erreur 404 ».
    if (res.status === 404) return { ok: false, message: STALE_SERVER };
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, docs: (data as { docs: ProjectDoc[] }).docs } : { ok: false, message: (data as { error?: string }).error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: "App injoignable." };
  }
}

// Questions visibles pour la feature sélectionnée (toutes si aucune).
export function questionsFor(questions: Question[], us: string | null): Question[] {
  return us ? questions.filter((q) => q.us === us) : questions;
}
