import { useCallback, useEffect, useState } from "react";

// La scène (graphe, journal) garde toujours au moins cette largeur.
export const MAIN_MIN = 560;

export type PanelOptions = { key: string; min: number; ratio: number; open: boolean };
export type PanelLimits = { min: number; max: () => number; initial: () => number };

export function panelLimits({ min, ratio }: Pick<PanelOptions, "min" | "ratio">): PanelLimits {
  const max = () => Math.max(min, Math.min(900, window.innerWidth - MAIN_MIN));
  return { min, max, initial: () => Math.round(Math.min(max(), Math.max(min, window.innerWidth * ratio))) };
}

type Saved = { width: number; open: boolean };

// Colonne latérale réglable et repliable. Préférence de confort mémorisée dans le
// navigateur, rien d'autre n'en dépend.
export function usePanel(options: PanelOptions) {
  const { key } = options;
  const limits = panelLimits(options);
  const clamp = (w: number) => Math.round(Math.min(limits.max(), Math.max(limits.min, w)));
  const [panel, setPanel] = useState<Saved>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<Saved> | null;
      if (saved && typeof saved.width === "number") return { width: clamp(saved.width), open: typeof saved.open === "boolean" ? saved.open : options.open };
    } catch {
      // stockage indisponible ou illisible : valeurs par défaut
    }
    return { width: limits.initial(), open: options.open };
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(panel));
    } catch {
      // navigation privée : le réglage vaut pour la session
    }
  }, [key, panel]);
  // Fenêtre réduite : la colonne se resserre pour laisser sa place à la scène.
  useEffect(() => {
    const onResize = () => setPanel((p) => (p.width > limits.max() ? { ...p, width: clamp(p.width) } : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const setWidth = useCallback((w: number) => setPanel((p) => ({ ...p, width: clamp(w) })), []);
  const setOpen = useCallback((open: boolean) => setPanel((p) => (p.open === open ? p : { ...p, open })), []);
  return { width: panel.width, open: panel.open, setWidth, setOpen, limits };
}

// Colonne de gauche : livrables, questions, documents.
export const LEFT_PANEL: PanelOptions = { key: "ottho-pipeline-side", min: 280, ratio: 0.3, open: true };
// Colonne de droite : aperçu de l'app du projet.
export const RIGHT_PANEL: PanelOptions = { key: "ottho-pipeline-preview", min: 320, ratio: 0.36, open: false };
