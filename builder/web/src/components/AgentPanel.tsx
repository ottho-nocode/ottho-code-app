import ReactMarkdown from "react-markdown";
import { Robot } from "../robots";
import type { Agent, Deliverable, Run, Service } from "../types";
import { AgentServices } from "./AgentServices";
import { RunHistory } from "./RunHistory";

type Props = {
  agent: Agent;
  runs: Run[];
  pending: number;
  toValidate: boolean;
  token: string;
  deliverables: Deliverable[];
  services: Service[] | undefined;
  onOpenFile: (path: string) => void;
  onClose: () => void;
};

// Outils d'écriture ; sans liste d'outils, l'agent hérite de ceux de la session (il peut écrire).
const WRITE_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit)$/;

export function AgentPanel({ agent, runs, pending, toValidate, token, deliverables, services, onOpenFile, onClose }: Props) {
  const writes = agent.tools.length === 0 || agent.tools.some((t) => WRITE_TOOLS.test(t));
  return (
    <aside className="card panel" aria-label={`Fiche de l'agent ${agent.name}`}>
      <header>
        <div className="panel__who">
          <Robot name={agent.name} size={96} full className="robot robot--full" />
          <h2>{agent.name}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche">×</button>
      </header>
      {toValidate && <p className="panel__validate">Son livrable attend ta validation : relis-le dans la colonne de gauche, valide-le dans ton terminal Claude.</p>}
      {pending > 0 && (
        <p className="panel__ask">
          {pending} question{pending > 1 ? "s" : ""} en attente : Claude te {pending > 1 ? "les" : "la"} pose dans ton terminal.
        </p>
      )}
      <p>{agent.description}</p>
      <dl>
        <dt>Modèle</dt>
        <dd>{agent.model}</dd>
        {agent.effort && (
          <>
            <dt>Effort</dt>
            <dd>{agent.effort}</dd>
          </>
        )}
        {agent.maxTurns !== null && (
          <>
            <dt>maxTurns</dt>
            <dd>{agent.maxTurns}</dd>
          </>
        )}
        <dt>Outils</dt>
        <dd>{agent.tools.filter((t) => !t.startsWith("mcp__")).join(", ") || (agent.tools.length ? "services seulement" : "hérités de la session")}</dd>
        <dt>Source</dt>
        <dd>{agent.source}</dd>
      </dl>
      <AgentServices agent={agent} services={services} />
      <h3>Historique</h3>
      <RunHistory runs={runs} token={token} writes={writes} deliverables={deliverables} onOpenFile={onOpenFile} />
      <h3>Prompt système</h3>
      <div className="markdown">
        <ReactMarkdown>{agent.body}</ReactMarkdown>
      </div>
    </aside>
  );
}
