import { useEffect, useState } from "react";
import type { State } from "./types";

// EventSource se reconnecte seul après une coupure ; on n'affiche que l'état du lien.
export function useLiveState() {
  const [state, setState] = useState<State | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      setState(JSON.parse(e.data) as State);
      setOnline(true);
    };
    es.onerror = () => setOnline(false);
    return () => es.close();
  }, []);
  return { state, online };
}
