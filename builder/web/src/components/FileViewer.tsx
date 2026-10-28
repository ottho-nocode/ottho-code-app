import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getProjectFile, type ProjectFile } from "../api";

// Lecture d'un fichier produit par un agent (colonne de gauche), en lecture seule.
export function FileViewer({ path, token, onClose }: { path: string; token: string; onClose: () => void }) {
  const [file, setFile] = useState<ProjectFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setFile(null);
    setError(null);
    void getProjectFile(token, path).then((r) => {
      if (!alive) return;
      if (r.ok) setFile(r.file);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [path, token]);

  return (
    <aside className="card questions-col viewer" aria-label={`Fichier ${path}`}>
      <header className="questions-col__head">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          ← Retour
        </button>
        <span className="deliv__file">{path}</span>
      </header>
      {error && <p className="q__error">{error}</p>}
      {!file && !error && <p className="muted">Chargement…</p>}
      {file &&
        (file.kind === "markdown" ? (
          <div className="markdown viewer__body">
            <ReactMarkdown>{file.content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="viewer__code">{file.content}</pre>
        ))}
    </aside>
  );
}
