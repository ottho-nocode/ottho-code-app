import { useState } from "react";
import { Background, BackgroundVariant, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { Screen } from "../types";
import { useFittedViewport } from "../useFittedViewport";
import type { Theme } from "../useTheme";

const TITLE_H = 56; // bandeau de titre au-dessus de chaque écran, en px du canevas

type BoardData = { screen: Screen };

const previewUrl = (path: string) => `/api/design-preview?path=${encodeURIComponent(path)}`;

// Un écran du canevas : aperçu statique (sans script) à sa taille réelle, dans un
// cadre isolé ; xyflow se charge du déplacement et du zoom.
function BoardNode({ data }: NodeProps<Node<BoardData, "board">>) {
  const { screen } = data;
  return (
    <div className="board" style={{ width: screen.w }}>
      <div className="board__title">
        <strong title={screen.title}>{screen.title}</strong>
        <span>
          {screen.w}×{screen.h}
        </span>
      </div>
      <iframe src={previewUrl(screen.path)} title={`Canevas : ${screen.title}`} sandbox="" style={{ width: screen.w, height: screen.h }} />
    </div>
  );
}

const nodeTypes = { board: BoardNode };

type Props = { title: string; screens: Screen[]; links: string[]; focus: string | null; theme: Theme; onClose: () => void };

// Le canevas du designer en grand : même disposition que dans Claude Design.
export function CanvasStage({ title, screens, links, focus: initialFocus, theme, onClose }: Props) {
  const [focus, setFocus] = useState<string | null>(initialFocus);
  const nodes: Node<BoardData, "board">[] = screens.map((s) => ({
    id: s.path,
    type: "board",
    position: { x: s.x ?? 0, y: (s.y ?? 0) - TITLE_H },
    data: { screen: s },
    draggable: false,
    selectable: false,
  }));
  const shown = focus ? screens.filter((s) => s.path === focus) : screens;
  const boxes = shown.map((s) => ({ x: s.x ?? 0, y: (s.y ?? 0) - TITLE_H, w: s.w, h: s.h + TITLE_H }));
  const { boxRef, viewport, setViewport } = useFittedViewport(boxes, `${focus ?? "tout"}|${screens.map((s) => s.path).join(",")}`, {
    padding: "48px",
  });

  return (
    <section className="stage" aria-label={`Canevas ${title}`}>
      <header className="stage__head">
        <div className="stage__title">
          <span className="eyebrow">Canevas</span>
          <h2>{title}</h2>
        </div>
        <nav className="stage__screens" aria-label="Écrans">
          <button type="button" className={focus === null ? "chip is-on" : "chip"} onClick={() => setFocus(null)}>
            Tout voir
          </button>
          {screens.map((s) => (
            <button key={s.path} type="button" className={focus === s.path ? "chip is-on" : "chip"} title={s.title} onClick={() => setFocus(s.path)}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="stage__actions">
          {links[0] && (
            <a className="btn btn--ghost" href={links[0]} target="_blank" rel="noreferrer">
              Ouvrir dans Claude Design ↗
            </a>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Retour au pipeline
          </button>
        </div>
      </header>
      <div className="stage__canvas" ref={boxRef}>
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          colorMode={theme}
          viewport={viewport}
          onViewportChange={setViewport}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.05}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} />
        </ReactFlow>
      </div>
    </section>
  );
}
