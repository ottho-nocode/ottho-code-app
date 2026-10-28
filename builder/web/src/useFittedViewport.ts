import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getViewportForBounds, type Viewport } from "@xyflow/react";

type Padding = Parameters<typeof getViewportForBounds>[5];

export type Box = { x: number; y: number; w: number; h: number };

// Cadrage calculé à partir de boîtes connues (disposition fixe), recalculé quand la
// zone change de taille ou quand layoutKey change. Le fitView de xyflow, lui,
// abandonne sans bruit une demande faite avant que son zoom soit prêt.
export function useFittedViewport(
  boxes: Box[],
  layoutKey: string,
  { padding = "16px" as Padding, maxZoom = 1 }: { padding?: Padding; maxZoom?: number } = {},
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // boxes est recréé à chaque rendu : layoutKey résume ce qui compte pour le cadrage.
  useEffect(() => {
    if (!size.w || !size.h || !boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    setViewport(getViewportForBounds({ x: left, y: top, width: right - left, height: bottom - top }, size.w, size.h, 0.05, maxZoom, padding));
  }, [size.w, size.h, layoutKey]);

  return { boxRef, viewport, setViewport };
}
