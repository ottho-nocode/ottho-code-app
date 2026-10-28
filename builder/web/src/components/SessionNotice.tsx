import { FOLLOW_RECO_PROMPT } from "../prompts";
import type { SessionStatus } from "../types";
import { CopyButton } from "./CopyButton";

type Props = { session: SessionStatus | undefined };

// Notifications de la session principale (Claude Code, dans le terminal de l'utilisateur),
// au-dessus de la prochaine étape : ses questions, ou une autorisation qu'elle attend. On y
// répond dans ce terminal ; l'app ne fait que le signaler.
export function SessionNotice({ session }: Props) {
  const ask = session?.ask ?? null;
  const wait = session?.wait ?? null;
  // Questions : posées dans le sélecteur (wait « questions ») ou en fin de message (ask).
  // picker : questions du sélecteur (le choix « Suivre tes recos » y est ajouté par le plugin).
  const questions = wait?.kind === "questions" ? { list: wait.questions ?? [], picker: true } : ask ? { list: ask.questions, picker: false } : null;
  const permission = wait && wait.kind !== "questions" ? wait : null;
  if (!questions && !permission) return null;
  return (
    <>
      {permission && (
        <div className="notif notif--wait" role="status" aria-label="Claude attend ton autorisation">
          <span className="notif__glyph" aria-hidden="true">
            ⏸
          </span>
          <div className="notif__text">
            <strong className="eyebrow">Claude attend ton autorisation dans ton terminal Claude</strong> {permission.message}
          </div>
        </div>
      )}
      {questions && questions.list.length > 0 && (
        <div className="notif notif--ask" role="status" aria-label="Claude attend ta réponse">
          <span className="notif__glyph" aria-hidden="true">
            ?
          </span>
          <div className="notif__text">
            <strong className="eyebrow">Claude attend ta réponse dans ton terminal Claude</strong>
            <ol className="notif__questions">
              {questions.list.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
            <p className="notif__hint">
              {questions.picker
                ? "Dans le sélecteur, le choix « Suivre tes recos » laisse l'IA trancher."
                : "Pour laisser l'IA trancher, copie ce prompt et colle-le dans ton terminal Claude."}
            </p>
          </div>
          {!questions.picker && (
            <div className="banner__actions">
              <CopyButton text={FOLLOW_RECO_PROMPT} label="Copier « Suivre tes recos »" title="Prompt à coller dans ton terminal Claude : l'IA tranche selon ses recommandations" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
