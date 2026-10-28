import { DELIVERABLE_LABEL } from "../api";
import { Elapsed, StepText, silentMinutes, useNow } from "../activity";
import { Robot } from "../robots";
import type { Feature, ProjectPhase, Run } from "../types";
import { BRIEF_PROMPT } from "../prompts";
import { CopyButton } from "./CopyButton";

export function promptFor(feature: Feature): string | null {
  const n = feature.next;
  if (!n || n.reason === "running") return null;
  const label = `${feature.us}${feature.title ? ` (${feature.title})` : ""}`;
  if (n.agent === "doc-writer") return `Lance l'agent doc-writer sur ${label}, puis /ottho-code-app:ship-feature.`;
  if (n.reason === "fix") return `Lance l'agent developer sur ${label} pour corriger les points du dernier rapport.`;
  // /new-feature attend « GO PLAN » puis « GO IMPLEMENT » ; la suite du texte suffit à une session neuve.
  // Les réponses de l'utilisateur (consignées par Claude) sont dans les livrables : à transmettre, pas à supposer.
  if (n.agent === "architect") return `GO PLAN : lance l'agent architect sur ${label}, avec mes réponses consignées dans la section « Questions ouvertes » de la spec.`;
  if (n.agent === "developer") return `GO IMPLEMENT : lance l'agent developer sur ${label}, avec mes réponses consignées dans les « Questions ouvertes » de la spec et du plan.`;
  return `Lance l'agent ${n.agent} sur ${label}.`;
}

type Props = {
  feature: Feature | null;
  hasFeatures: boolean;
  pending: number;
  charteToValidate: boolean;
  // Exécution en cours de l'agent affiché (activité en direct).
  activeRun?: Run | null;
  // Phase projet (projet sans feature) : brief, cadrage, PRD, architecture, infra.
  phase?: ProjectPhase;
  // Canevas du brief affiché dans la scène : il porte déjà le prompt de cadrage.
  onboardingOpen?: boolean;
  onOpenBrief?: () => void;
  onSelectAgent?: (name: string) => void;
};

// Prompt à coller dans le terminal Claude pour chaque étape du bootstrap (skill project-bootstrap).
// La validation se donne dans le terminal et se lit dans l'Historique du livrable : l'app ne valide rien.
const PROJECT_PROMPT: Record<string, string> = {
  vision: "/ottho-code-app:init-agency-project",
  prd: "Continue le bootstrap du projet : spec-writer rédige le PRD (docs/PRD.md) à partir de la vision, de docs/brief.md et de mes réponses (docs/questions/).",
  design: "Le PRD est validé (Historique de docs/PRD.md) : lance l'étape suivante du bootstrap, designer (charte graphique, demandée d'abord, puis maquettes des écrans clés), avec mes réponses consignées dans les « Questions ouvertes » du PRD.",
  architecture: "La charte graphique est validée (Historique de design/charte.md) : lance l'étape suivante du bootstrap, architect, en lui transmettant le PRD, la charte, les maquettes et mes réponses consignées dans les « Questions ouvertes » (elles priment sur toute hypothèse).",
  infra: "L'architecture est validée (Historique de docs/architecture.md) : lance l'étape suivante du bootstrap, devops, en tenant compte de mes réponses consignées dans les « Questions ouvertes » du PRD et de docs/architecture.md.",
  features: "Le projet est prêt : lance la première feature du MVP décrit dans docs/PRD.md avec /ottho-code-app:new-feature.",
};
const PROJECT_TEXT: Record<string, string> = {
  vision:
    "brief prêt : lance le cadrage du projet avec brainstorming, puis spec-writer (PRD), designer (charte et écrans clés, pendant ta relecture du PRD), architect (architecture) et devops (infra). Tu valides chaque étape dans ton terminal.",
  prd: "spec-writer rédige le PRD du projet.",
  design: "le PRD est validé : designer demande ta charte graphique, puis dessine les écrans clés du parcours principal.",
  architecture: "la charte est validée : architect définit la stack, le schéma de données et les conventions.",
  infra: "l'architecture est validée : devops met en place Git, Supabase (dev et prod), Vercel et l'intégration continue.",
  features: "le projet est prêt : lance sa première feature.",
};

// Prompt copié : bouton principal (les prompts se collent dans le terminal Claude).
const copyPrompt = (prompt: string, label = "Copier le prompt pour Claude") => (
  <CopyButton text={prompt} label={label} className="btn btn--primary" title={`À coller dans ton terminal Claude : ${prompt}`} />
);

function ProjectBanner({ phase, onboardingOpen, onOpenBrief, onSelectAgent }: Pick<Props, "onboardingOpen" | "onOpenBrief" | "onSelectAgent"> & { phase: ProjectPhase }) {
  const next = phase.next!;
  if (next.key === "brief") {
    return (
      <div className="banner">
        <div className="banner__text">
          <strong className="eyebrow">Nouveau projet</strong>
          {next.state === "started"
            ? "le brief est commencé : complète ses six blocs avec Claude, dans ton terminal."
            : "décris ton projet à Claude, dans ton terminal : ce brief est le point de départ des agents."}
        </div>
        {!onboardingOpen && (
          <div className="banner__actions">
            <button type="button" className="btn btn--ghost" onClick={onOpenBrief}>
              Voir le brief
            </button>
            {copyPrompt(BRIEF_PROMPT, "Copier le prompt de cadrage")}
          </div>
        )}
      </div>
    );
  }
  if (next.state === "running") {
    return (
      <div className="banner running">
        {next.agent && <Robot name={next.agent} size={44} className="robot banner__robot" />}
        <div className="banner__text">
          ◉ <strong>{next.agent}</strong> travaille sur le cadrage du projet. La suite s'affichera ici quand il aura fini.
        </div>
      </div>
    );
  }
  if (next.state === "validate") {
    const label = next.key === "prd" ? "le PRD" : next.key === "design" ? "la charte graphique" : "l'architecture";
    // Pendant la relecture du PRD, le designer peut déjà demander (ou proposer) charte et maquettes.
    const designTodo = next.key === "prd" && phase.stages.find((s) => s.key === "design")?.state === "todo";
    const designNow =
      "Lance le designer au niveau projet sans attendre la validation du PRD : il me demande (ou me propose) la charte graphique et mes maquettes existantes ; il ne dessine qu'après validation du PRD et de la charte.";
    return (
      <div className="banner validate">
        {next.agent && <Robot name={next.agent} size={44} className="robot banner__robot" />}
        <div className="banner__text">
          <strong className="eyebrow">Prochaine étape</strong> valide {label} de <code>{next.agent}</code> : relis-le ici, puis dis à Claude, dans ton terminal,
          que tu le valides (ou ce qu'il faut changer).
        </div>
        <div className="banner__actions">
          <button type="button" className="btn btn--primary" onClick={() => next.agent && onSelectAgent?.(next.agent)}>
            Relire {label}
          </button>
          {designTodo && <CopyButton text={designNow} label="Copier le prompt du designer" title={`À coller dans ton terminal Claude : ${designNow}`} />}
        </div>
      </div>
    );
  }
  const prompt = PROJECT_PROMPT[next.key];
  return (
    <div className="banner">
      {next.agent && <Robot name={next.key === "vision" ? "brainstorming" : next.agent} size={44} className="robot banner__robot" />}
      <div className="banner__text">
        <strong className="eyebrow">Prochaine étape</strong>
        {PROJECT_TEXT[next.key]}
      </div>
      <div className="banner__actions">{copyPrompt(prompt)}</div>
    </div>
  );
}

export function NextStepBanner({ feature, hasFeatures, pending, charteToValidate, activeRun, phase, onboardingOpen, onOpenBrief, onSelectAgent }: Props) {
  const now = useNow();
  if (!hasFeatures && phase?.next)
    return <ProjectBanner phase={phase} onboardingOpen={onboardingOpen} onOpenBrief={onOpenBrief} onSelectAgent={onSelectAgent} />;
  if (!hasFeatures) {
    return (
      <div className="banner muted">
        <div>
          Aucune feature pour l'instant : lance <code>/ottho-code-app:new-feature</code> dans Claude Code.
        </div>
      </div>
    );
  }
  if (!feature) return <div className="banner muted">Choisis une feature pour voir la prochaine étape.</div>;
  if (!feature.next) return <div className="banner done">✓ {feature.us} est terminée : spec, plan, code, review, tests et merge sont faits.</div>;
  const warn = (
    <>
      {charteToValidate && (
        <div className="banner__warn validate">La charte graphique attend ta validation : clique sur designer.</div>
      )}
      {pending > 0 && (
        <div className="banner__warn">
          ⚠ {pending} question{pending > 1 ? "s" : ""} en attente pour {feature.us} : Claude te les pose dans ton terminal.
        </div>
      )}
    </>
  );
  if (feature.next.reason === "validate") {
    const label = DELIVERABLE_LABEL[feature.next.agent] ?? "le livrable";
    return (
      <div className="banner validate">
        <Robot name={feature.next.agent} size={44} className="robot banner__robot" />
        <div className="banner__text">
          <strong className="eyebrow">Prochaine étape</strong> {feature.us} {feature.title} : valide {label} de <code>{feature.next.agent}</code>. Clique sur
          sa carte pour la relire, puis valide-la dans ton terminal Claude.
          {warn}
        </div>
      </div>
    );
  }
  if (feature.next.reason === "running") {
    const agent = feature.next.agent;
    const silent = activeRun ? silentMinutes(activeRun, now) : null;
    if (silent !== null) {
      const relaunch = `Lance l'agent ${agent} sur ${feature.us}${feature.title ? ` (${feature.title})` : ""} : son passage précédent a été interrompu.`;
      return (
        <div className="banner silent">
          <Robot name={agent} size={44} className="robot banner__robot" />
          <div className="banner__text">
            ⚠ <strong>{agent}</strong> ne donne plus signe de vie depuis {silent} min
            {activeRun?.activity && (
              <span className="banner__step">
                {" "}
                (dernière action : <StepText step={activeRun.activity} />)
              </span>
            )}
            . Il attend peut-être ton autorisation dans ton terminal Claude, ou sa session a été fermée : dans ce cas, relance-le.
            {warn}
          </div>
          <div className="banner__actions">{copyPrompt(relaunch, "Copier le prompt de relance")}</div>
        </div>
      );
    }
    const after = DELIVERABLE_LABEL[agent]
      ? ` Quand il aura fini, tu reliras ${DELIVERABLE_LABEL[agent]} ici.`
      : " La suite s'affichera ici quand il aura fini.";
    return (
      <div className="banner running">
        <Robot name={feature.next.agent} size={44} className="robot banner__robot" />
        <div className="banner__text">
          ◉ <strong>{feature.next.agent}</strong> travaille sur {feature.us}
          {activeRun ? (
            <>
              {" "}
              depuis <Elapsed since={activeRun.start} />
              {activeRun.activity && (
                <span className="banner__step">
                  {" "}
                  · <StepText step={activeRun.activity} />
                </span>
              )}
            </>
          ) : null}
          .{after}
          {warn}
        </div>
      </div>
    );
  }
  const prompt = promptFor(feature)!;
  return (
    <div className="banner">
      <Robot name={feature.next.agent} size={44} className="robot banner__robot" />
      <div className="banner__text">
        <strong className="eyebrow">Prochaine étape</strong> {feature.us} {feature.title} : lance <code>{feature.next.agent}</code>
        {warn}
      </div>
      <div className="banner__actions">{copyPrompt(prompt)}</div>
    </div>
  );
}
