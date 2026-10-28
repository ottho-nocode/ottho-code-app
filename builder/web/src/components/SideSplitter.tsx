import { useRef } from "react";
import type { PanelLimits } from "../useSidePanel";

type Props = {
  // Colonne réglée par cette poignée : celle de gauche, ou celle de droite (aperçu).
  edge: "left" | "right";
  label: string;
  width: number;
  limits: PanelLimits;
  onResize: (width: number) => void;
  onCollapse: () => void;
  collapseLabel: string;
};

// Poignée entre une colonne latérale et la scène : glisser pour redimensionner,
// double-clic pour revenir à la largeur par défaut, flèches au clavier.
export function SideSplitter({ edge, label, width, limits, onResize, onCollapse, collapseLabel }: Props) {
  const start = useRef<{ x: number; width: number } | null>(null);
  // À droite, la colonne grandit quand on tire vers la gauche.
  const sign = edge === "left" ? 1 : -1;
  const end = () => {
    start.current = null;
    document.body.classList.remove("is-resizing");
  };
  return (
    <div
      className={`splitter splitter--${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max()}
      tabIndex={0}
      title="Glisser pour redimensionner, double-clic pour la largeur par défaut"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        document.body.classList.add("is-resizing");
      }}
      onPointerMove={(e) => {
        if (start.current) onResize(start.current.width + sign * (e.clientX - start.current.x));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        end();
      }}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) onResize(limits.initial());
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 24;
        if (e.key === "ArrowLeft") onResize(width - sign * step);
        else if (e.key === "ArrowRight") onResize(width + sign * step);
        else if (e.key === "Home") onResize(limits.min);
        else if (e.key === "End") onResize(limits.max());
        else return;
        e.preventDefault();
      }}
    >
      <button type="button" className="splitter__collapse" onClick={onCollapse} aria-label={collapseLabel} title={collapseLabel}>
        {edge === "left" ? "‹" : "›"}
      </button>
    </div>
  );
}

// Colonne de gauche fermée : une fine barre qui la rouvre et signale ce qui attend.
export function SideRail({ waiting, onOpen }: { waiting: number; onOpen: () => void }) {
  return (
    <button type="button" className="side-rail" onClick={onOpen} aria-label={`Ouvrir la colonne de gauche${waiting ? ` (${waiting} en attente)` : ""}`} title="Ouvrir la colonne">
      <span className="side-rail__arrow" aria-hidden="true">
        ›
      </span>
      {waiting > 0 && <span className="side-rail__badge">{waiting}</span>}
      <span className="side-rail__label">À faire</span>
    </button>
  );
}
