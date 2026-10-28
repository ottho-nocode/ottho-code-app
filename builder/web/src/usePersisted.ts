import { useEffect, useState } from "react";

// État mémorisé dans le navigateur (préférence de confort : sections affichées…).
// Stockage indisponible (navigation privée) : la valeur vaut pour la session.
export function usePersisted<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<T> | null;
      return saved && typeof saved === "object" ? { ...initial, ...saved } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // navigation privée
    }
  }, [key, value]);
  return [value, setValue] as const;
}
