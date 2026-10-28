import { VIA, supabaseDashboard, targetText } from "../services";
import type { AppDatabase, Service } from "../types";

function AppLine({ db }: { db: AppDatabase | null }) {
  if (!db) return <>aucune base détectée (ni SUPABASE_URL ni DATABASE_URL dans les .env du projet)</>;
  if (db.kind === "supabase" && db.project)
    return (
      <>
        Supabase, projet <code>{db.project}</code> <span className="muted">({db.source})</span>{" "}
        <a href={supabaseDashboard(db.project)} target="_blank" rel="noreferrer">
          Ouvrir ↗
        </a>
      </>
    );
  if (db.kind === "sqlite")
    return (
      <>
        SQLite, fichier <code>{db.host}</code> <span className="muted">({db.source})</span>
      </>
    );
  return (
    <>
      {db.kind === "postgres" ? "PostgreSQL" : db.kind} sur <code>{db.host}</code> <span className="muted">({db.source})</span>
    </>
  );
}

// Quelle base l'app utilise, et laquelle les agents peuvent atteindre (Supabase).
export function DatabaseInfo({ database, supabase, onConfigure }: { database: AppDatabase | null; supabase: Service | undefined; onConfigure?: () => void }) {
  const targets = supabase?.targets ?? [];
  const wide = targets.some((t) => !t.project);
  const agentRefs = targets.map((t) => t.project).filter((p): p is string => Boolean(p));
  const mismatch = Boolean(database?.project && agentRefs.length && !agentRefs.includes(database.project));
  return (
    <section className="col-section db" aria-label="Base de données">
      <h3>Base de données</h3>
      <dl className="db__list">
        <dt>App</dt>
        <dd>
          <AppLine db={database} />
          {onConfigure && (
            <>
              {" "}
              <button type="button" className="linklike" onClick={onConfigure}>
                {database ? "Modifier" : "Configurer"} →
              </button>
            </>
          )}
        </dd>
        <dt>Agents</dt>
        <dd>
          {!supabase ? (
            "Supabase n'est pas branché : les agents n'atteignent aucune base."
          ) : (
            <ul className="db__targets">
              {targets.map((t, i) => (
                <li key={`${t.via}-${i}`}>
                  {targetText(t)} <span className="muted">({VIA[t.via] ?? t.via})</span>
                  {t.project && (
                    <>
                      {" "}
                      <a href={supabaseDashboard(t.project)} target="_blank" rel="noreferrer">
                        Ouvrir ↗
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      {wide && (
        <p className="db__warn">
          ⚠ Les agents peuvent atteindre n'importe quel projet de ton compte Supabase, <strong>prod comprise</strong>. Limite-les au projet de dev : ajoute{" "}
          <code>?project_ref={database?.project ?? "REF_DU_PROJET_DE_DEV"}</code> à l'adresse du serveur, ou <code>--project-ref=…</code> à sa commande
          (voir le README du plugin).
        </p>
      )}
      {mismatch && <p className="db__warn">⚠ L'app et les agents ne visent pas le même projet Supabase.</p>}
    </section>
  );
}
