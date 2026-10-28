import type { Question } from "../types";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

type ListProps = { questions: Question[]; showUs?: boolean };

// Questions des agents, en lecture : on y répond dans le terminal Claude (Claude les pose et
// consigne les réponses dans les livrables). Répondues : leur réponse, et où elle a été donnée.
export function QuestionList({ questions, showUs = false }: ListProps) {
  const pending = questions.filter((q) => !q.answered);
  const answered = questions.filter((q) => q.answered);
  return (
    <ul className="questions">
      {pending.map((q) => (
        <li key={q.id} className="q" data-question={q.id}>
          <p className="q__text">{q.text}</p>
          <p className="q__src">
            {showUs && `${q.us ?? "Projet"} · `}
            {q.origin === "direct" ? `Posée par ${q.askedBy}${q.askedAt ? ` à ${hhmm(q.askedAt)}` : ""}` : `Section « Questions ouvertes » de ${q.target.file}`}
          </p>
          <p className="q__todo">À répondre dans ton terminal Claude : il te la pose.</p>
        </li>
      ))}
      {answered.map((q) => (
        <li key={q.id} className="a" data-question={q.id}>
          <span className="a__ok" aria-label="répondue">✓</span> {showUs && <span className="muted">{q.us ?? "Projet"} · </span>}
          {q.text}
          <div className="a__answer">
            {q.answer || (q.answeredIn === "terminal" ? "Répondue dans le terminal." : "Répondue.")}
            {q.answeredAt && ` · ${q.answeredAt}`}
            {q.answer && q.answeredIn === "terminal" && " · répondu dans le terminal"}
          </div>
        </li>
      ))}
    </ul>
  );
}
