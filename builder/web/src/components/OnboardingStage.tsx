import { useEffect, useState } from "react";
import { getBrief } from "../api";
import { BRIEF_PROMPT } from "../prompts";
import type { Brief, BriefBlock, BriefValues } from "../types";
import { CopyButton } from "./CopyButton";

type Loaded = { brief: Brief; blocks: BriefBlock[]; posture: string[]; exists: boolean; complete: boolean };

// Rempli : le champ principal du bloc (au moins une persona identifiée), comme le serveur.
const filledOf = (block: BriefBlock, brief: Brief) => {
  const main = block.fields[0].key;
  return block.multiple ? (brief[block.key] as BriefValues[]).some((p) => p[main]) : Boolean((brief[block.key] as BriefValues)[main]);
};

function Fields({ block, values }: { block: BriefBlock; values: BriefValues }) {
  const shown = block.fields.filter((f) => values[f.key]);
  if (!shown.length) return null;
  return (
    <dl className="ob-values">
      {shown.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd>{values[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function BlockCard({ block, index, brief }: { block: BriefBlock; index: number; brief: Brief }) {
  const filled = filledOf(block, brief);
  const items = block.multiple ? (brief[block.key] as BriefValues[]) : [];
  const values = block.multiple ? null : (brief[block.key] as BriefValues);
  return (
    <article className={filled ? "ob-card is-filled" : "ob-card"} aria-label={block.title}>
      <header className="ob-card__head">
        <h3>
          {index}. {block.title}
        </h3>
        <span className={filled ? "ob-card__state is-filled" : "ob-card__state"}>{filled ? "✓ rempli" : "à remplir"}</span>
      </header>
      <p className="ob-card__intro">{block.intro}</p>
      {values && <Fields block={block} values={values} />}
      {items.map((item, i) => (
        <section key={i} className="ob-persona">
          <h4>
            Persona {i + 1}
            {item.identite ? ` : ${item.identite}` : ""}
          </h4>
          <Fields block={{ ...block, fields: block.fields.filter((f) => f.key !== "identite") }} values={item} />
        </section>
      ))}
      <details className="ob-card__rubric">
        <summary>Ce que brainstorming vérifiera</summary>
        <ul>
          {block.rubric.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}

// refreshKey : change à chaque état poussé par le serveur (docs/brief.md écrit par Claude).
type Props = { token: string; refreshKey: string; onClose: () => void };

// Onboarding d'un nouveau projet, en lecture : le canevas en six blocs du module « De l'idée au
// projet validé » (Claude Builder). Claude le remplit avec l'élève dans le terminal et l'écrit
// dans docs/brief.md, d'où partira brainstorming ; l'app montre ce qui est rempli.
export function OnboardingStage({ token, refreshKey, onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getBrief(token).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.message);
      setError(null);
      setLoaded({ brief: r.brief, blocks: r.blocks, posture: r.posture, exists: r.exists, complete: r.complete });
    });
    return () => {
      alive = false;
    };
  }, [token, refreshKey]);

  if (!loaded)
    return (
      <section className="card onboarding" aria-label="Nouveau projet">
        {error ? <p className="q__error">{error}</p> : <p className="muted">Chargement…</p>}
      </section>
    );

  // complete : règle du serveur (un brief écrit à la main avec du contenu compte comme complet) ;
  // filled : blocs remplis du canevas, pour la barre.
  const { brief, blocks, posture, exists, complete } = loaded;
  const filled = blocks.filter((b) => filledOf(b, brief)).length;
  // docs/brief.md écrit sans le canevas (à la main) : rien à afficher bloc par bloc.
  const outside = exists && !brief.name && filled === 0;
  return (
    <section className="card onboarding" aria-label="Nouveau projet">
      <header className="onboarding__head">
        <div>
          <span className="eyebrow">Nouveau projet · De l'idée au projet validé</span>
          <h2>{brief.name || "Rends ton idée tangible"}</h2>
          <p className="muted">
            Le canevas en six blocs de la formation. Claude te pose ses questions dans ton terminal et écrit <code>docs/brief.md</code>, affiché ici ;
            brainstorming en part et ne te repose pas ce qui est rempli.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Fermer l'onboarding" title="Revenir au pipeline">
          ×
        </button>
      </header>

      <div className="onboarding__launch">
        <div className="ob-progress-wrap">
          <span className="ob-progress__label">
            {outside ? "brief écrit hors canevas" : `${filled}/${blocks.length} blocs remplis${brief.name ? "" : " · nom à donner"}`}
          </span>
          {!outside && (
            <div
              className={complete ? "ob-progress is-complete" : "ob-progress"}
              role="progressbar"
              aria-label="Blocs remplis"
              aria-valuemin={0}
              aria-valuemax={blocks.length}
              aria-valuenow={filled}
            >
              <span style={{ width: `${(filled / blocks.length) * 100}%` }} />
            </div>
          )}
        </div>
        {complete ? (
          <p className="ob-launch__text">
            {outside ? "Le brief est écrit : brainstorming en part." : "Les six blocs sont remplis."} Pour le changer, demande-le à Claude dans ton terminal.
          </p>
        ) : (
          <>
            <p className="ob-launch__text">
              {filled ? "Pour compléter le brief" : "Pour commencer"}, colle ce prompt dans ton terminal Claude :
              <span className="ob-launch__prompt">{BRIEF_PROMPT}</span>
            </p>
            <CopyButton text={BRIEF_PROMPT} label="Copier le prompt de cadrage" className="btn btn--primary" />
          </>
        )}
      </div>

      <div className="onboarding__body">
        {outside && (
          <p className="ob-outside">
            <code>docs/brief.md</code> est écrit hors du canevas : lis-le dans « Documents ».
          </p>
        )}
        <div className="ob-grid">
          {blocks.map((b, i) => (
            <BlockCard key={b.key} block={b} index={i + 1} brief={brief} />
          ))}
        </div>
        <div className="ob-posture">
          <h3>La posture</h3>
          <ul>
            {posture.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
