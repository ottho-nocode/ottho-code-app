import { StepText } from "../activity";
import { Robot } from "../robots";
import type { Run } from "../types";

const ICON = { running: "◉", done: "✓", interrupted: "⏸" } as const;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function Journal({ runs, onSelectAgent }: { runs: Run[]; onSelectAgent: (name: string) => void }) {
  return (
    <section className="card" aria-label="Journal des agents">
      <h2>Journal</h2>
      {runs.length === 0 ? (
        <p className="muted">Lance un agent dans Claude Code, il s'allumera ici.</p>
      ) : (
        <ol className="journal">
          {runs.map((r, i) => (
            <li key={r.id ?? `${r.agent}-${r.start}-${i}`}>
              <button type="button" onClick={() => onSelectAgent(r.agent)}>
                <time dateTime={r.end ?? r.start}>{hhmm(r.end ?? r.start)}</time>
                <span className={`state-${r.state}`}>{ICON[r.state]}</span> <Robot name={r.agent} size={20} className="robot robot--inline" />
                {r.agent}
                {r.state === "running" && " démarre"}
                {r.state === "interrupted" && " interrompu"}
                {r.us && ` (${r.us})`}
                {r.verdict && <strong> {r.verdict}</strong>}
                {r.next && ` → ${r.next}`}
                {r.questions?.length > 0 && (
                  <span className="journal__ask"> · {r.questions.length} question{r.questions.length > 1 ? "s" : ""}</span>
                )}
              </button>
              {r.state === "running" && (r.trail?.length ?? 0) > 0 && (
                <ul className="journal__trail" aria-label={`Dernières actions de ${r.agent}`}>
                  {r.trail
                    .slice(-4)
                    .reverse()
                    .map((step, j) => (
                      <li key={`${step.ts}-${j}`}>
                        <time dateTime={step.ts}>{hhmm(step.ts)}</time>
                        <StepText step={step} />
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
