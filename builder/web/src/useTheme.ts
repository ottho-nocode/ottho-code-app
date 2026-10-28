import { useCallback, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "ottho-pipeline-theme";

// Thème de l'interface : posé par index.html avant le rendu, basculé ici et mémorisé
// dans le navigateur (préférence de confort, rien d'autre n'en dépend).
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // stockage indisponible (navigation privée) : le choix vaut pour la session
      }
      return next;
    });
  }, []);
  return { theme, toggle };
}
