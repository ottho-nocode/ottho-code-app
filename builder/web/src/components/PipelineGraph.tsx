import { Background, BackgroundVariant, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Elapsed, StepText, silentMinutes, useNow } from "../activity";
import { Robot, hasRobot } from "../robots";
import { agentServices, type AgentService } from "../services";
import type { Agent, AgentStatus, Feature, Phase, Run, Service } from "../types";
import { useFittedViewport } from "../useFittedViewport";
import type { Theme } from "../useTheme";

const PHASES: Phase[] = ["specify", "plan", "implement", "validate"];
const PHASE_LABEL: Record<Phase, string> = {
  specify: "Specify",
  plan: "Plan",
  implement: "Implement",
  validate: "Validate",
  transverse: "Transverses",
};
// Ordre du cycle SDD : sert à ranger les colonnes et à tracer les passages de main.
const CHAIN = ["brainstorming", "spec-writer", "designer", "architect", "developer", "code-reviewer", "tester"];
const PHASE_INDEX: Record<Phase, string> = { specify: "01", plan: "02", implement: "03", validate: "04", transverse: "∞" };
const COL_W = 292;
const ROW_H = 146;
// Encombrement maximal d'une carte (outils sur 2 lignes) et d'un titre de phase :
// sert à cadrer le graphe sans attendre les mesures de xyflow.
const NODE_BOX = { agent: { w: 252, h: ROW_H }, label: { w: 140, h: 24 } };

type AgentData = {
  agent: Agent;
  status: AgentStatus;
  selected: boolean;
  pending: number;
  toValidate: boolean;
  live: Run | null;
  // Minutes sans aucune action (agent en cours), null s'il donne signe de vie.
  silent: number | null;
  services: AgentService[];
};
type LabelData = { label: string; index: string };

// « Read · Write + Figma, Pencil » : les outils MCP sont regroupés par serveur,
// sinon leurs noms (mcp__claude_ai_Figma__get_design_context…) débordent de la carte.
export function toolSummary(tools: string[]): string {
  if (!tools.length) return "outils hérités";
  const native = tools.filter((t) => !t.startsWith("mcp__"));
  const servers = [
    ...new Set(
      tools
        .filter((t) => t.startsWith("mcp__"))
        .map((t) => t.split("__")[1] ?? "")
        .filter(Boolean)
        .map((s) => s.replace(/^claude_ai_/, "").replace(/^plugin_[^_]+_/, ""))
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
    ),
  ];
  const parts = [native.join(" · "), servers.join(", ")].filter(Boolean);
  return parts.join(" + ");
}

function AgentNode({ data }: NodeProps<Node<AgentData, "agent">>) {
  const { agent, status, selected, pending, toValidate, live, silent, services } = data;
  // Les services externes ont leur propre ligne : ici, seulement les outils natifs.
  const native = agent.tools.filter((t) => !t.startsWith("mcp__"));
  const on = services.filter((s) => s.on);
  const off = services.filter((s) => !s.on);
  const servicesTitle = [
    on.length ? `Branchés : ${on.map((s) => s.label + (s.state === "maybe" ? " (connecteur claude.ai, à vérifier)" : s.state === "auth" ? " (à authentifier)" : "")).join(", ")}.` : "",
    off.length ? `Non branchés : ${off.map((s) => s.label).join(", ")}.` : "",
    "Détails dans la fiche de l'agent.",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={`agent-node status-${status}${selected ? " selected" : ""}${hasRobot(agent.name) ? " has-robot" : ""}`}
      data-agent={agent.name}
      data-status={status}
      data-questions={pending}
      data-validate={toValidate ? "1" : "0"}
    >
      {toValidate && <span className="vbadge">à valider</span>}
      {pending > 0 && (
        <span className="qbadge" title={`${pending} question${pending > 1 ? "s" : ""} en attente`}>
          {pending} ?
        </span>
      )}
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Robot name={agent.name} size={56} className="robot agent-node__robot" />
      <div className="agent-node__body">
        <div className="agent-node__head">
          <span className="agent-node__name">{agent.name}</span>
          {status === "done" && (
            <span className="agent-node__state" aria-label="terminé">
              ✓
            </span>
          )}
          {status === "running" && (
            <span className="agent-node__state" aria-label="en cours">
              {live && <Elapsed since={live.start} />} ◉
            </span>
          )}
        </div>
        <div className="agent-node__meta">
          <span className={`tag model-${agent.model}`}>{agent.model}</span>
          <span className="tag">{agent.source}</span>
        </div>
        {status === "running" && live && silent !== null ? (
          <div className="agent-node__activity is-silent" title="Il attend peut-être une autorisation dans ton terminal Claude, ou sa session a été fermée.">
            ⚠ aucune action depuis {silent} min
          </div>
        ) : status === "running" && live ? (
          <div className="agent-node__activity" title={live.activity ? `${live.activity.tool} ${live.activity.detail}` : undefined}>
            {live.activity ? <StepText step={live.activity} /> : "démarre…"}
          </div>
        ) : (
          <div className="agent-node__tools" title={agent.tools.join(", ")}>
            {native.length || !agent.tools.length ? toolSummary(native) : "services seulement"}
          </div>
        )}
        {services.length > 0 && (
          <div className="agent-node__services" title={servicesTitle}>
            {on.map((s) => (
              <span key={s.key} className={`svc svc--${s.state}`}>
                {s.state === "auth" ? "⚠" : "✓"} {s.label}
              </span>
            ))}
            {off.length > 0 && (
              <span className="svc svc--off">
                {on.length ? `+${off.length}` : `${off.length} service${off.length > 1 ? "s" : ""} non branché${off.length > 1 ? "s" : ""}`}
              </span>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}

function LabelNode({ data }: NodeProps<Node<LabelData, "label">>) {
  return (
    <div className="phase-label">
      <span className="phase-label__index">{data.index}</span>
      {data.label}
    </div>
  );
}

const nodeTypes = { agent: AgentNode, label: LabelNode };

const chainIndex = (name: string) => {
  const i = CHAIN.indexOf(name);
  return i === -1 ? CHAIN.length : i;
};
const byCycle = (a: Agent, b: Agent) => chainIndex(a.name) - chainIndex(b.name) || a.name.localeCompare(b.name);

export function statusFor(agent: Agent, feature: Feature | null, runs: Run[]): AgentStatus {
  if (feature) return feature.agents[agent.name] ?? "idle";
  return runs.some((r) => r.agent === agent.name && r.state === "running") ? "running" : "idle";
}

type Props = {
  agents: Agent[];
  feature: Feature | null;
  runs: Run[];
  pendingByAgent: Map<string, number>;
  toValidate: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: Theme;
  // Services externes branchés pour le projet.
  services?: Service[];
};

export function PipelineGraph({ agents, feature, runs, pendingByAgent, toValidate, selectedId, onSelect, theme, services }: Props) {
  const now = useNow();
  const nodes: Node[] = [];
  const agentNode = (agent: Agent, x: number, y: number): Node<AgentData, "agent"> => {
    // Exécution en cours de cet agent (la plus récente : runs est du plus récent au plus ancien).
    const live = runs.find((r) => r.agent === agent.name && r.state === "running" && (!feature || r.us === feature.us)) ?? null;
    return {
      id: agent.id,
      type: "agent",
      position: { x, y },
      data: {
        agent,
        status: statusFor(agent, feature, runs),
        selected: agent.id === selectedId,
        pending: pendingByAgent.get(agent.name) ?? 0,
        toValidate: toValidate.has(agent.name),
        live,
        silent: live ? silentMinutes(live, now) : null,
        services: agentServices(agent, services),
      },
    };
  };

  const inPhase = (phase: Phase) => agents.filter((a) => a.phase === phase).sort(byCycle);
  const rows = Math.max(1, ...PHASES.map((p) => inPhase(p).length));
  PHASES.forEach((phase, col) => {
    nodes.push({
      id: `label-${phase}`,
      type: "label",
      position: { x: col * COL_W, y: 0 },
      data: { label: PHASE_LABEL[phase], index: PHASE_INDEX[phase] },
      selectable: false,
    });
    inPhase(phase).forEach((a, row) => nodes.push(agentNode(a, col * COL_W, 36 + row * ROW_H)));
  });
  const transverse = inPhase("transverse");
  if (transverse.length) {
    const y = 36 + rows * ROW_H + 28;
    nodes.push({
      id: "label-transverse",
      type: "label",
      position: { x: 0, y },
      data: { label: PHASE_LABEL.transverse, index: PHASE_INDEX.transverse },
      selectable: false,
    });
    transverse.forEach((a, i) => nodes.push(agentNode(a, i * COL_W, y + 36)));
  }

  const byName = new Map<string, Agent>();
  for (const a of agents) if (!byName.has(a.name)) byName.set(a.name, a);
  const chain = CHAIN.map((n) => byName.get(n)).filter((a): a is Agent => Boolean(a));
  // Même colonne : du bas de l'un au haut de l'autre ; sinon de droite à gauche.
  const edges: Edge[] = chain.slice(1).map((to, i) => {
    const vertical = chain[i].phase === to.phase;
    return {
      id: `${chain[i].id}->${to.id}`,
      source: chain[i].id,
      target: to.id,
      sourceHandle: vertical ? "bottom" : "right",
      targetHandle: vertical ? "top" : "left",
      animated: statusFor(to, feature, runs) === "running",
    };
  });

  const layoutKey = nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).join("|");
  const boxes = nodes.map((n) => ({ x: n.position.x, y: n.position.y, ...(n.type === "agent" ? NODE_BOX.agent : NODE_BOX.label) }));
  const { boxRef, viewport, setViewport } = useFittedViewport(boxes, layoutKey, { padding: "28px" });
  // La scène s'éclaire quand un agent travaille.
  const live = nodes.some((n) => n.type === "agent" && (n.data as AgentData).status === "running");

  return (
    <div className={live ? "flow is-live" : "flow"} ref={boxRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        viewport={viewport}
        onViewportChange={setViewport}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.4}
        onNodeClick={(_, node) => {
          if (node.type === "agent") onSelect(node.id);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
      </ReactFlow>
    </div>
  );
}
