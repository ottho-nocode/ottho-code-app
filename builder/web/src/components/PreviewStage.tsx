import { useEffect, useRef, useState } from "react";
import { STALE_SERVER, previewAction } from "../api";
import type { Preview } from "../types";

const STATUS: Record<Preview["status"], string> = { idle: "arrêté", starting: "démarrage…", running: "en ligne", failed: "erreur" };

type Props = {
  preview: Preview | undefined;
  token: string;
  // Change quand un agent modifie le code du projet : le site statique est alors rechargé.
  codeKey: string;
  // Barre latérale à droite, ou en grand à la place du graphe.
  layout: "side" | "full";
  onToggleLayout: () => void;
  onClose: () => void;
};

// Aperçu de l'app que les agents construisent.
export function PreviewStage({ preview, token, codeKey, layout, onToggleLayout, onClose }: Props) {
  const side = layout === "side";
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(codeKey);
  const running = preview?.status === "running" && preview.url;

  // Les serveurs npm ont leur rechargement à chaud ; le site statique, lui, est rechargé ici.
  useEffect(() => {
    if (codeKey === seen.current) return;
    seen.current = codeKey;
    if (preview?.mode !== "static" || !running) return;
    const t = setTimeout(() => setNonce((n) => n + 1), 800);
    return () => clearTimeout(t);
  }, [codeKey, preview?.mode, running]);

  const act = async (action: "start" | "stop") => {
    setBusy(true);
    setError(null);
    const r = await previewAction(token, action);
    setBusy(false);
    if (!r.ok) setError(r.message);
  };

  return (
    <section className={side ? "preview-stage preview-stage--side" : "card preview-stage"} aria-label="Aperçu de l'app">
      <header className="preview-stage__bar">
        <span className={`preview-status is-${preview?.status ?? "idle"}`}>{STATUS[preview?.status ?? "idle"]}</span>
        {running ? (
          <a className="preview-stage__url" href={preview.url!} target="_blank" rel="noreferrer">
            {preview.url}
          </a>
        ) : (
          <span className="preview-stage__url muted">{preview?.mode === "npm" ? preview.command : preview?.mode === "static" ? "site statique (index.html)" : ""}</span>
        )}
        <div className="preview-stage__actions">
          {running && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setNonce((n) => n + 1)} aria-label="Recharger l'aperçu" title="Recharger l'aperçu">
                ↻{!side && " Recharger"}
              </button>
              <a className="btn btn--ghost" href={preview.url!} target="_blank" rel="noreferrer" aria-label="Ouvrir dans un autre onglet" title="Ouvrir dans un autre onglet">
                ↗{!side && " Onglet"}
              </a>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onToggleLayout}
            aria-label={side ? "Ouvrir l'aperçu en grand" : "Réduire l'aperçu à droite"}
            title={side ? "Ouvrir l'aperçu en grand" : "Réduire l'aperçu à droite"}
          >
            {side ? "⤢" : "⤡ Réduire"}
          </button>
          {(preview?.status === "running" || preview?.status === "starting") && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act("stop")} aria-label="Arrêter le serveur de l'aperçu" title="Arrêter le serveur de l'aperçu">
              ■{!side && " Arrêter"}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer l'aperçu">
            ×
          </button>
        </div>
      </header>

      <div className="preview-stage__body">
        {!preview && <p className="preview-empty">{STALE_SERVER}</p>}
        {running && (
          <iframe
            key={nonce}
            className="preview-stage__frame"
            src={preview.frameUrl ?? preview.url!}
            title="Aperçu de l'app du projet"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          />
        )}
        {preview && !running && (
          <div className="preview-empty">
            {preview.mode === "none" ? (
              <p>
                Rien à afficher pour l'instant : le projet n'a ni <code>index.html</code> ni script <code>dev</code> dans <code>package.json</code>. developer les
                créera en codant la première feature.
              </p>
            ) : preview.status === "starting" ? (
              <p>
                Démarrage de <code>{preview.command}</code>…
              </p>
            ) : (
              <>
                {preview.status === "failed" && <p className="q__error">{preview.error}</p>}
                <p>
                  {preview.mode === "static" ? (
                    <>Site statique : le pipeline sert lui-même <code>index.html</code> sur ton ordinateur (127.0.0.1), port 3100 ou le suivant libre.</>
                  ) : (
                    <>
                      Le pipeline lance <code>{preview.command}</code> dans le projet, sur 127.0.0.1, port 3100 ou le suivant libre.
                    </>
                  )}
                </p>
                <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act("start")}>
                  {preview.status === "failed" ? "Relancer l'aperçu" : "Lancer l'aperçu"}
                </button>
              </>
            )}
            {error && <p className="q__error">{error}</p>}
            {preview.log && preview.status !== "idle" && <pre className="preview-log">{preview.log.slice(-2000)}</pre>}
          </div>
        )}
      </div>
    </section>
  );
}
