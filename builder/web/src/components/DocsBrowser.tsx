import { useEffect, useState } from "react";
import { listDocs, type ProjectDoc } from "../api";

const since = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};
const folderOf = (path: string) => (path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/` : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
// Écrit il y a moins de 10 minutes : sans doute par un agent en cours de route.
const FRESH_MS = 10 * 60_000;

type Props = {
  token: string;
  // Change quand les agents avancent : la liste est alors relue.
  refreshKey: string;
  current: string | null;
  onOpen: (path: string) => void;
  onClose: () => void;
};

// Tous les documents Markdown du projet (colonne de gauche), rangés par dossier.
export function DocsBrowser({ token, refreshKey, current, onOpen, onClose }: Props) {
  const [docs, setDocs] = useState<ProjectDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    let alive = true;
    void listDocs(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setDocs(r.docs);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [token, refreshKey]);

  const needle = filter.trim().toLowerCase();
  const shown = (docs ?? []).filter((d) => !needle || d.path.toLowerCase().includes(needle));
  const groups = new Map<string, ProjectDoc[]>();
  for (const d of shown) groups.set(folderOf(d.path), [...(groups.get(folderOf(d.path)) ?? []), d]);

  return (
    <aside className="card questions-col docs" aria-label="Documents du projet">
      <header className="questions-col__head">
        <div>
          <span className="eyebrow">Documents</span>
          {docs && <span className="docs__count">{docs.length} fichier{docs.length > 1 ? "s" : ""} .md</span>}
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Fermer
        </button>
      </header>
      {(docs?.length ?? 0) > 8 && (
        <input
          className="docs__filter"
          type="search"
          placeholder="Filtrer : spec, US-02, charte…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrer les documents"
        />
      )}
      {error && <p className="q__error">{error}</p>}
      {!docs && !error && <p className="muted">Chargement…</p>}
      {docs && docs.length === 0 && <p className="muted">Aucun document Markdown dans ce projet pour l'instant.</p>}
      {docs && docs.length > 0 && shown.length === 0 && <p className="muted">Aucun document ne correspond à « {filter} ».</p>}
      {[...groups].map(([folder, items]) => (
        <section key={folder || "racine"} className="docs__group">
          <h3 className="docs__folder">{folder || "Racine du projet"}</h3>
          <ul className="docs__list">
            {items.map((d) => (
              <li key={d.path}>
                <button type="button" className={d.path === current ? "docs__item is-current" : "docs__item"} onClick={() => onOpen(d.path)} title={d.path}>
                  <span className="docs__name">{nameOf(d.path)}</span>
                  {Date.now() - Date.parse(d.mtime) < FRESH_MS && <span className="docs__fresh">récent</span>}
                  <time dateTime={d.mtime}>{since(d.mtime)}</time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
