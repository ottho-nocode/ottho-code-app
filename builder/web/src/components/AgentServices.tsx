import { ADD_HINT, VIA, agentServices, targetText } from "../services";
import type { Agent, Service } from "../types";
import { CopyButton } from "./CopyButton";

function CopyCommand({ command }: { command: string }) {
  return (
    <div className="svc-cmd">
      <code>{command}</code>
      <CopyButton text={command} label="Copier" />
    </div>
  );
}

// Services externes de l'agent : branchés ou non, et comment brancher ceux qui manquent.
export function AgentServices({ agent, services }: { agent: Agent; services: Service[] | undefined }) {
  const list = agentServices(agent, services);
  if (list.length === 0) return null;
  const missing = list.some((s) => s.state === "off");
  return (
    <>
      <h3>Services</h3>
      <ul className="svc-list">
        {list.map((s) => {
          const hint = ADD_HINT[s.key];
          return (
            <li key={s.key}>
              <div className="svc-list__head">
                <span className={`svc svc--${s.state}`}>
                  {s.state === "off" ? "○" : s.state === "auth" ? "⚠" : "✓"} {s.label}
                </span>
                <span className="svc-list__via">{s.on ? s.via.map((v) => VIA[v] ?? v).join(", ") : "non branché"}</span>
              </div>
              {s.on && s.targets.length > 0 && (
                <p className="svc-list__note">
                  Base visée : {[...new Set(s.targets.map(targetText))].join(" ; ")}
                  {s.targets.some((t) => !t.project) && " (prod comprise)"}.
                </p>
              )}
              {s.state === "maybe" && <p className="svc-list__note">Connecté au moins une fois depuis claude.ai : vérifie avec /mcp qu'il l'est toujours.</p>}
              {s.state === "auth" && <p className="svc-list__note">Claude Code signale que ce connecteur demande une authentification : tape /mcp dans Claude Code.</p>}
              {!s.on && hint?.command && <CopyCommand command={hint.command} />}
              {!s.on && hint?.note && <p className="svc-list__note">{hint.note}</p>}
            </li>
          );
        })}
      </ul>
      {missing && (
        <p className="svc-list__after">
          La commande se lance dans un terminal, ou dans Claude Code précédée de <code>!</code>. Relance ensuite Claude Code et tape <code>/mcp</code> pour
          t'authentifier. Tant qu'un service manque, l'agent te le signale au lieu de le contourner.
        </p>
      )}
    </>
  );
}
