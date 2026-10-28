import type { CellStatus, Column, Feature } from "../types";

const COLS: [Column, string][] = [
  ["spec", "Spec"],
  ["plan", "Plan"],
  ["code", "Code"],
  ["review", "Review"],
  ["tests", "Tests"],
  ["merge", "Merge"],
];
const SYMBOL: Record<CellStatus, string> = { done: "✓", running: "◉", todo: "·", ko: "✗", na: "n/a" };
const LABEL: Record<CellStatus, string> = { done: "fait", running: "en cours", todo: "à faire", ko: "à corriger", na: "indisponible" };

type Props = {
  features: Feature[];
  pendingByUs: Map<string, number>;
  selected: string | null;
  onSelect: (us: string) => void;
};

export function FeaturesTable({ features, pendingByUs, selected, onSelect }: Props) {
  return (
    <section className="card" aria-label="Avancement des features">
      <h2>Features</h2>
      {features.length === 0 ? (
        <p className="muted">
          Aucune feature pour l'instant. Sur un nouveau projet, commence par le cadrage (phase projet, colonne de gauche), puis{" "}
          <code>/ottho-code-app:new-feature</code>.
        </p>
      ) : (
        <table className="features">
          <thead>
            <tr>
              <th>US</th>
              {COLS.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th>Questions</th>
              <th>Suite</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.us} className={f.us === selected ? "selected" : undefined}>
                <td>
                  <button type="button" onClick={() => onSelect(f.us)} title={f.title}>
                    {f.us}
                  </button>{" "}
                  <span className="muted">{f.title}</span>
                </td>
                {COLS.map(([col, label]) => (
                  <td key={col} className={`cell-${f.columns[col]}`} aria-label={`${label} : ${LABEL[f.columns[col]]}`}>
                    {SYMBOL[f.columns[col]]}
                  </td>
                ))}
                <td className={pendingByUs.get(f.us) ? "cell-ask" : "cell-todo"} aria-label={`Questions en attente : ${pendingByUs.get(f.us) ?? 0}`}>
                  {pendingByUs.get(f.us) ? `${pendingByUs.get(f.us)} ?` : "·"}
                </td>
                <td>
                  {!f.next
                    ? "fini"
                    : f.next.reason === "running"
                      ? `${f.next.agent} en cours`
                      : f.next.reason === "validate"
                        ? `valider (${f.next.agent})`
                        : f.next.agent}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
