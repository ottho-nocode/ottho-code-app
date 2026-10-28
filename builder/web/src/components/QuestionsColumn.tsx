import { DELIVERABLE_LABEL, labelOf } from "../api";
import type { AppDatabase, Asset, Deliverable, PhaseStage, ProjectPhase, Question, Service } from "../types";
import { AssetsPanel } from "./AssetsPanel";
import { DatabaseInfo } from "./DatabaseInfo";
import { ProjectPhaseStrip } from "./ProjectPhase";
import { DeliverablePanel } from "./DeliverablePanel";
import { QuestionList } from "./QuestionList";

type Props = {
  context: string;
  agent: string | null;
  featureSelected: boolean;
  deliverable: Deliverable | null;
  charte: Deliverable | null;
  assets: Asset[];
  toValidate: Deliverable[];
  questions: Question[];
  showUs: boolean;
  onClose: () => void;
  onOpenCanvas: (focus: string | null) => void;
  // Maquettes du projet (écrans clés), rattachées à la charte.
  onOpenProjectCanvas?: (focus: string | null) => void;
  // Base de l'app et Supabase des agents (vue « À faire »).
  database: AppDatabase | null;
  supabase: Service | undefined;
  onConfigure: () => void;
  // Phase projet (tant que le projet n'a pas de feature).
  phase?: ProjectPhase;
  onStage?: (stage: PhaseStage) => void;
};

// Colonne de gauche, en lecture. Rien ne s'affiche d'office : les pastilles des cartes
// signalent l'agent (« à valider », « N ? ») ; un clic sur la carte affiche ici son livrable
// et ses questions. Réponses et validations se donnent à Claude, dans le terminal.
export function QuestionsColumn({
  context,
  agent,
  featureSelected,
  deliverable,
  charte,
  assets,
  toValidate,
  questions,
  showUs,
  onClose,
  onOpenCanvas,
  onOpenProjectCanvas,
  database,
  supabase,
  onConfigure,
  phase,
  onStage,
}: Props) {
  const pending = questions.filter((q) => !q.answered);

  if (!agent) {
    const askers = [...new Set(pending.map((q) => q.askedBy))];
    const nothing = !pending.length && !toValidate.length;
    return (
      <aside className="card questions-col" aria-label="Livrables et questions">
        <header className="questions-col__head">
          <h2 className="eyebrow">À faire</h2>
          <span className={nothing ? "questions-col__count" : "questions-col__count ask"}>
            {nothing ? "rien en attente" : `${toValidate.length + pending.length} en attente`}
          </span>
        </header>
        <p className="muted questions-col__sub">{context}</p>
        {phase?.next && onStage && <ProjectPhaseStrip phase={phase} onStage={onStage} />}
        {toValidate.map((d) => (
          <p key={`${d.us ?? d.kind}-${d.agent}`} className="questions-col__hint">
            À valider : {labelOf(d)}
            {d.us ? ` de ${d.us}` : ""} (<strong>{d.agent}</strong>).
          </p>
        ))}
        {pending.length > 0 && <p className="questions-col__hint">Questions en attente chez {askers.join(", ")}.</p>}
        <p className="questions-col__hint">
          {nothing
            ? "Quand un agent rend un livrable ou pose une question, une pastille apparaît sur sa carte."
            : "Clique sur un agent qui porte une pastille pour relire son livrable et ses questions ; réponds et valide dans ton terminal Claude."}
        </p>
        <DatabaseInfo database={database} supabase={supabase} onConfigure={onConfigure} />
      </aside>
    );
  }

  const own = questions.filter((q) => q.askedBy === agent);
  const waiting = own.filter((q) => !q.answered).length;
  return (
    <aside className="card questions-col" aria-label="Livrables et questions">
      <header className="questions-col__head">
        <h2>{agent}</h2>
        <button type="button" className="questions-col__close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>
      <p className="muted questions-col__sub">{context}</p>

      {agent === "designer" && (
        <section className="col-section">
          <h3>
            Éléments de marque <small>{assets.length ? `${assets.length} fichier${assets.length > 1 ? "s" : ""}` : "aucun"}</small>
          </h3>
          <AssetsPanel assets={assets} />
        </section>
      )}

      {agent === "designer" && charte && (
        <section className="col-section">
          <h3>Charte graphique</h3>
          <DeliverablePanel key="charte" deliverable={charte} onOpenCanvas={onOpenProjectCanvas} />
        </section>
      )}

      {deliverable ? (
        <section className="col-section">
          <h3>Livrable</h3>
          <DeliverablePanel key={`${deliverable.us}-${deliverable.agent}`} deliverable={deliverable} onOpenCanvas={onOpenCanvas} />
        </section>
      ) : (
        !featureSelected &&
        DELIVERABLE_LABEL[agent] && <p className="questions-col__hint">Choisis une feature pour relire son livrable.</p>
      )}

      <section className="col-section">
        <h3>
          Questions <small>{waiting ? `${waiting} en attente` : own.length ? "tout est répondu" : "aucune"}</small>
        </h3>
        {own.length > 0 ? (
          <>
            <p className="muted questions-col__sub">Claude consigne ta réponse dans le livrable indiqué ; les agents suivants la lisent.</p>
            <QuestionList questions={own} showUs={showUs} />
          </>
        ) : (
          <p className="questions-col__hint">{agent} n'a pas posé de question ici.</p>
        )}
      </section>
    </aside>
  );
}
