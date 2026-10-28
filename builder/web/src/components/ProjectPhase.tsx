import type { PhaseStage, ProjectPhase } from "../types";

const ICON: Record<PhaseStage["state"], string> = { done: "✓", running: "◉", validate: "!", started: "…", todo: "·" };
const STATE_LABEL: Record<PhaseStage["state"], string> = { done: "fait", running: "en cours", validate: "à valider", started: "commencé", todo: "à faire" };

// Frise de la phase projet (avant la première feature) : Brief → … → 1re feature.
export function ProjectPhaseStrip({ phase, onStage }: { phase: ProjectPhase; onStage: (stage: PhaseStage) => void }) {
  return (
    <section className="col-section phase" aria-label="Phase projet">
      <h3>Phase projet</h3>
      <ol className="phase__list">
        {phase.stages.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className={`phase__step is-${s.state}${phase.next?.key === s.key ? " is-next" : ""}`}
              onClick={() => onStage(s)}
              title={`${s.label} : ${STATE_LABEL[s.state]}${s.agent ? ` (${s.agent})` : ""}`}
            >
              <span className="phase__icon" aria-hidden="true">
                {ICON[s.state]}
              </span>
              <span className="phase__label">{s.label}</span>
              {s.agent && <span className="phase__agent">{s.agent}</span>}
              {s.state !== "todo" && s.state !== "done" && <span className="phase__tag">{STATE_LABEL[s.state]}</span>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
