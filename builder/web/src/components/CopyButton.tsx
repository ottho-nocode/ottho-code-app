import { useEffect, useRef, useState } from "react";

// Presse-papiers de secours (API refusée ou absente) : sélection d'un champ caché, puis le
// focus revient où il était (le bouton, en général).
function copyFallback(text: string): boolean {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus();
  }
}

type Props = { text: string; label: string; className?: string; title?: string };

// Copie un texte (prompt à coller dans le terminal Claude, commande) : « Copié » un instant,
// annoncé aux lecteurs d'écran par une zone de statut invisible.
// Copie impossible : on le dit, le texte reste lisible en info-bulle.
export function CopyButton({ text, label, className = "btn btn--ghost", title }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = copyFallback(text);
    }
    setStatus(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 2000);
  };
  const message = status === "copied" ? "Copié" : status === "failed" ? "Copie impossible" : "";
  return (
    <>
      <button type="button" className={className} title={title ?? text} onClick={() => void copy()}>
        {message || label}
      </button>
      <span role="status" className="sr-only">
        {message}
      </span>
    </>
  );
}
