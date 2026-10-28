// Robots des agents (pixel art Ottho, page du webinar « conférence builders »).
// Têtes pour les cartes, le journal et le bandeau ; robot entier pour la fiche.
// security-auditor n'a pas de robot sur la page : c'est code-reviewer (la loupe) passé au rouge.
import type { CSSProperties } from "react";

const HEADS = import.meta.glob<string>("./assets/robots/heads/*.png", { eager: true, import: "default" });
const FULL = import.meta.glob<string>("./assets/robots/full/*.png", { eager: true, import: "default" });

// Couleur de chaque robot, reprise de la page (fond de sa vignette).
const ACCENT: Record<string, string> = {
  brainstorming: "#facc15",
  "spec-writer": "#fb923c",
  designer: "#f472b6",
  architect: "#60a5fa",
  developer: "#4ade80",
  "code-reviewer": "#22d3ee",
  tester: "#34d399",
  devops: "#fb923c",
  "doc-writer": "#fbbf24",
  "security-auditor": "#f87171",
};

const src = (name: string, full: boolean) =>
  (full ? FULL : HEADS)[`./assets/robots/${full ? "full" : "heads"}/${name}.png`] ?? null;

// Agent sans robot (autre plugin, agent du projet) : rien, la carte garde sa mise en page.
export function Robot({ name, size, full = false, className = "robot" }: { name: string; size: number; full?: boolean; className?: string }) {
  const url = src(name, full);
  if (!url) return null;
  return (
    <span className={className} style={{ "--robot": ACCENT[name] ?? "var(--act-1)", "--robot-size": `${size}px` } as CSSProperties} aria-hidden="true">
      <img src={url} alt="" draggable={false} />
    </span>
  );
}

export const hasRobot = (name: string) => src(name, false) !== null;
