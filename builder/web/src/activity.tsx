import { useEffect, useState } from "react";
import type { Run, Step } from "./types";

// Libellé français d'une action de sous-agent : pictogramme, verbe, objet.
export function stepLabel(step: Step): { icon: string; verb: string; object: string } {
  const t = step.tool;
  const object = step.detail;
  if (t === "Read") return { icon: "◔", verb: "lit", object };
  if (t === "Write") return { icon: "✎", verb: "écrit", object };
  if (t === "Edit" || t === "MultiEdit" || t === "NotebookEdit") return { icon: "✎", verb: "modifie", object };
  if (t === "Bash") return { icon: "›", verb: "exécute", object };
  if (t === "Glob" || t === "Grep") return { icon: "⌕", verb: "cherche", object };
  if (t === "WebFetch") return { icon: "↗", verb: "consulte", object };
  if (t === "WebSearch") return { icon: "↗", verb: "recherche", object };
  if (t === "Artifact") return { icon: "◆", verb: object === "read" || object === "list" ? "lit le canevas" : "publie sur Claude Design", object: "" };
  if (t === "Skill") return { icon: "✦", verb: "utilise le skill", object };
  if (t.startsWith("mcp__")) return { icon: "⧉", verb: "outil", object };
  return { icon: "·", verb: t, object };
}

export function StepText({ step }: { step: Step }) {
  const { icon, verb, object } = stepLabel(step);
  return (
    <>
      <span className="step__icon" aria-hidden="true">
        {icon}
      </span>{" "}
      {verb}
      {object && (
        <>
          {" "}
          <span className="step__object">{object}</span>
        </>
      )}
    </>
  );
}

const format = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

// Temps écoulé depuis le début d'une exécution, mis à jour chaque seconde.
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="elapsed">{format(now - Date.parse(since))}</span>;
}

// Heure courante, rafraîchie régulièrement (repérer un agent silencieux).
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Agent en cours sans aucune action depuis 8 min : il attend peut-être une autorisation
// dans le terminal Claude, ou sa session a été fermée (terminal quitté).
export const SILENT_MS = 8 * 60_000;
export function silentMinutes(run: Run, now: number): number | null {
  if (run.state !== "running") return null;
  const quiet = now - Date.parse(run.lastSeen ?? run.activity?.ts ?? run.start);
  return quiet >= SILENT_MS ? Math.floor(quiet / 60_000) : null;
}
