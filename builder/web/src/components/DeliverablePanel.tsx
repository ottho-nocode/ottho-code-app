import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getDeliverable, labelOf } from "../api";
import { validatePrompt } from "../prompts";
import type { Deliverable, Screen } from "../types";
import { CopyButton } from "./CopyButton";

const THUMB_W = 170;
const THUMB_H = 200;

// Vignette d'un écran de canevas : l'aperçu statique (sans script) est rendu à sa
// taille réelle dans un cadre isolé, puis réduit ; un clic l'ouvre sur la scène.
function ScreenThumb({ screen, onOpen }: { screen: Screen; onOpen: () => void }) {
  const scale = Math.min(THUMB_W / screen.w, THUMB_H / screen.h);
  const src = `/api/design-preview?path=${encodeURIComponent(screen.path)}`;
  return (
    <button type="button" className="screen" onClick={onOpen} title={`Voir l'écran « ${screen.title} » en grand`}>
      <div className="screen__frame" style={{ width: screen.w * scale, height: screen.h * scale }}>
        <iframe
          src={src}
          title={`Écran ${screen.title}`}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          style={{ width: screen.w, height: screen.h, transform: `scale(${scale})` }}
        />
      </div>
      <span className="screen__title">{screen.title}</span>
    </button>
  );
}

// Livrable d'un agent, en lecture : on le relit ici ; on le valide (ou on demande une
// modification) en le disant à Claude dans le terminal, qui note la validation dans
// l'« Historique » du fichier, lu par l'app.
type Props = { deliverable: Deliverable; onOpenCanvas?: (focus: string | null) => void };

export function DeliverablePanel({ deliverable, onOpenCanvas }: Props) {
  const { us, agent, file, validated, validatedAt, blocking } = deliverable;
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!validated);

  // Lu à l'ouverture, puis à chaque état poussé par le serveur (fichier modifié, ou chaque
  // minute) : il recrée l'objet deliverable.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void getDeliverable(us, agent).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setContent(r.data.content);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [open, us, agent, deliverable]);

  const label = labelOf(deliverable);
  const status = validated ? `✓ Validé le ${validatedAt ?? "?"}` : blocking ? "À valider : dis-le à Claude dans ton terminal" : "Non validé (ne bloque plus la suite)";
  const mockups = deliverable.mockups;
  const charte = deliverable.kind === "charte";
  const hasMockups = Boolean(mockups && (mockups.links.length || mockups.screens.length || mockups.images.length || mockups.pen.length));
  return (
    <div className="deliv" data-deliverable={file}>
      <p className={validated ? "deliv__status ok" : blocking ? "deliv__status todo" : "deliv__status"}>
        {status} · <span className="deliv__file">{file}</span>
      </p>
      {!validated && (
        <div className="deliv__validate">
          <span className="q__hint">Relu ? Colle ce prompt dans ton terminal Claude, ou dis-lui ce qu'il faut changer.</span>
          <CopyButton text={validatePrompt(label, file)} label="Copier « Je valide »" className="btn btn--primary" />
        </div>
      )}
      {mockups && (
        <div className="mockups" aria-label="Maquettes">
          {mockups.links.map((url, i) => {
            const kind = mockups.linkKinds?.[i];
            const label = !charte
              ? "Ouvrir le canevas dans Claude Design ↗"
              : kind === "maquettes"
                ? "Ouvrir les maquettes dans Claude Design ↗"
                : kind === "design system"
                  ? "Ouvrir le design system dans Claude Design ↗"
                  : "Ouvrir dans Claude Design ↗";
            return (
              <a key={url} className="mockups__link" href={url} target="_blank" rel="noreferrer">
                {label}
              </a>
            );
          })}
          {mockups.screens.length > 0 && onOpenCanvas && (
            <>
              <button type="button" className="btn btn--stage" onClick={() => onOpenCanvas(null)}>
                Voir le canevas en grand ({mockups.screens.length} écran{mockups.screens.length > 1 ? "s" : ""})
              </button>
              <div className="screens">
                {mockups.screens.map((s) => (
                  <ScreenThumb key={s.path} screen={s} onOpen={() => onOpenCanvas(s.path)} />
                ))}
              </div>
            </>
          )}
          {mockups.images.length > 0 && (
            <div className="mockups__grid">
              {mockups.images.map((img) => {
                const src = `/api/design-file?path=${encodeURIComponent(img)}`;
                return (
                  <a key={img} href={src} target="_blank" rel="noreferrer" title={img}>
                    <img src={src} alt={`Maquette ${img.split("/").pop()}`} loading="lazy" />
                  </a>
                );
              })}
            </div>
          )}
          {mockups.pen.map((pen) => (
            <p key={pen} className="q__hint">
              Maquette Pencil : <span className="deliv__file">{pen}</span> (à ouvrir dans Pencil).
            </p>
          ))}
          {!hasMockups && !charte && <p className="q__hint">Pas de maquette visuelle : le designer a rendu un wireframe texte.</p>}
        </div>
      )}
      <button type="button" className="deliv__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? `Masquer ${label}` : `Relire ${label}`}
      </button>
      {open && (
        <>
          {error && <p className="q__error">{error}</p>}
          {content === null && !error && <p className="muted">Chargement…</p>}
          {content !== null && (
            <div className="markdown deliv__body" aria-label={`Contenu de ${file}`}>
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </>
      )}
    </div>
  );
}
