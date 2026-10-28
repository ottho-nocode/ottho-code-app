import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getReport } from "../api";
import type { Deliverable, Run } from "../types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const duration = (run: Run) => {
  if (!run.end) return null;
  const s = Math.max(0, Math.round((Date.parse(run.end) - Date.parse(run.start)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
const STATE = { done: "✓ terminé", running: "◉ en cours", interrupted: "⏸ interrompu" } as const;

// Compte rendu d'une exécution, chargé à l'ouverture (il ne voyage pas dans le flux en direct).
// Ouvert d'emblée pour un agent qui n'écrit pas de fichier : son compte rendu est sa production.
function Report({ run, token, initiallyOpen }: { run: Run; token: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [report, setReport] = useState<string | null | undefined>(undefined);
  // Demandé une seule fois, même si l'état en direct renouvelle l'objet run entre-temps.
  const asked = useRef(false);
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    void getReport(token, run).then(setReport);
  }, [open, token, run]);
  return (
    <details className="run__report" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Compte rendu</summary>
      {report === undefined ? (
        <p className="muted">Chargement…</p>
      ) : report ? (
        <div className="markdown">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      ) : (
        <p className="muted">Pas de compte rendu enregistré pour ce passage.</p>
      )}
    </details>
  );
}

// Pourquoi un passage n'affiche aucun fichier.
function noFileNote(run: Run, writes: boolean, hasDeliverable: boolean): string | null {
  if (!writes) {
    return run.hasReport
      ? "N'écrit pas de fichier : ce qu'il produit est dans son compte rendu."
      : "N'écrit pas de fichier, et aucun compte rendu n'a été enregistré pour ce passage.";
  }
  if (run.state === "running") return null;
  if ((run.steps ?? 0) === 0) return hasDeliverable ? null : "Fichiers non suivis : passage antérieur au suivi des actions.";
  return "Aucun fichier écrit pendant ce passage.";
}

type Props = {
  runs: Run[];
  token: string;
  // L'agent a-t-il un outil d'écriture ? (brainstorming : Read et WebFetch seulement)
  writes: boolean;
  // Livrables de cet agent : montrés pour les passages dont les fichiers n'ont pas été suivis.
  deliverables: Deliverable[];
  onOpenFile: (path: string) => void;
};

// Historique d'un agent : un bloc par passage, avec ce qu'il a produit.
export function RunHistory({ runs, token, writes, deliverables, onOpenFile }: Props) {
  if (runs.length === 0) return <p className="muted">Pas encore lancé sur ce projet.</p>;
  return (
    <ol className="history">
      {runs.slice(0, 12).map((run, i) => {
        const files = run.files ?? [];
        const extra = files.length ? [] : deliverables.filter((d) => d.us === run.us).map((d) => d.file);
        const note = files.length ? null : noFileNote(run, writes, extra.length > 0);
        return (
          <li key={`${run.start}-${i}`} className={`run run--${run.state}`}>
            <div className="run__head">
              <strong>{run.us ?? "sans feature"}</strong>
              <span className="run__when">{when(run.start)}</span>
              {duration(run) && <span className="run__when">{duration(run)}</span>}
              <span className={`run__state state-${run.state}`}>{STATE[run.state]}</span>
            </div>
            {(run.verdict || run.next) && (
              <p className="run__meta">
                {run.verdict && <strong>{run.verdict}</strong>}
                {run.verdict && run.next && " · "}
                {run.next && `recommande ${run.next}`}
              </p>
            )}
            {(files.length > 0 || extra.length > 0) && (
              <div className="run__block">
                <span className="run__label">{files.length ? "Fichiers produits" : "Son livrable"}</span>
                <ul className="run__files">
                  {(files.length ? files : extra).map((f) => (
                    <li key={f}>
                      <button type="button" onClick={() => onOpenFile(f)} title={`Lire ${f}`}>
                        {f}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(run.questions?.length ?? 0) > 0 && (
              <div className="run__block">
                <span className="run__label">Questions posées</span>
                <ul className="run__questions">
                  {(run.questions ?? []).map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {note && <p className="run__note">{note}</p>}
            {run.hasReport && <Report run={run} token={token} initiallyOpen={!writes && i === 0} />}
          </li>
        );
      })}
    </ol>
  );
}
