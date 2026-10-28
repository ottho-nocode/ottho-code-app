import { useEffect, useRef, useState } from "react";
import { questionsFor } from "./api";
import { AgentPanel } from "./components/AgentPanel";
import { CanvasStage } from "./components/CanvasStage";
import { FeaturesTable } from "./components/FeaturesTable";
import { Journal } from "./components/Journal";
import { NextStepBanner } from "./components/NextStepBanner";
import { OnboardingStage } from "./components/OnboardingStage";
import { PipelineGraph } from "./components/PipelineGraph";
import { PreviewStage } from "./components/PreviewStage";
import { ConfigPanel } from "./components/ConfigPanel";
import { DocsBrowser } from "./components/DocsBrowser";
import { FileViewer } from "./components/FileViewer";
import { QuestionsColumn } from "./components/QuestionsColumn";
import { SessionNotice } from "./components/SessionNotice";
import { SideRail, SideSplitter } from "./components/SideSplitter";
import { useLiveState } from "./useLiveState";
import { usePersisted } from "./usePersisted";
import { LEFT_PANEL, MAIN_MIN, RIGHT_PANEL, usePanel } from "./useSidePanel";
import { useTheme } from "./useTheme";

const countBy = <T,>(items: T[], key: (item: T) => string | null) => {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
};

export function App() {
  const { state, online } = useLiveState();
  const { theme, toggle } = useTheme();
  // Colonne de gauche : largeur réglable, repliable (la scène prend alors toute la largeur).
  const side = usePanel(LEFT_PANEL);
  // Aperçu de l'app du projet : barre latérale à droite (réglable), ou en grand à la place du graphe.
  const right = usePanel(RIGHT_PANEL);
  const [previewFull, setPreviewFull] = useState(false);
  // Sections du bas de la scène : chacune se cache et se réaffiche depuis la barre du haut.
  const [sections, setSections] = usePersisted("ottho-pipeline-sections", { journal: true, features: true });
  const toggleSection = (name: "journal" | "features") => setSections((s) => ({ ...s, [name]: !s[name] }));
  // undefined = pas encore initialisé : on prend alors la feature « focus » du serveur.
  const [selectedUs, setSelectedUs] = useState<string | null | undefined>(undefined);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  // Scène du canevas du designer (feature, écran mis en avant), à la place du graphe.
  // us null : maquettes du projet (écrans clés, rattachées à la charte du designer).
  const [stage, setStage] = useState<{ us: string | null; focus: string | null } | null>(null);
  // Fichier produit par un agent, lu dans la colonne de gauche.
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  // Liste de tous les documents Markdown du projet, à la place des questions.
  const [docsOpen, setDocsOpen] = useState(false);
  // Configuration des services de l'app (.env.local), à la place des questions.
  const [configOpen, setConfigOpen] = useState(false);
  // Onboarding d'un nouveau projet (brief), à la place du graphe.
  const [onboarding, setOnboarding] = useState(false);
  const onboardingChecked = useRef(false);

  useEffect(() => {
    if (state && selectedUs === undefined) setSelectedUs(state.focus);
  }, [state, selectedUs]);

  // Titre de l'onglet : le nom de l'outil et le projet ouvert.
  useEffect(() => {
    document.title = state ? `Ottho Builder 2 · ${state.project.name}` : "Ottho Builder 2";
  }, [state?.project.name]);

  // Projet neuf (ni brief, ni PRD, ni feature) : l'onboarding s'ouvre de lui-même, une fois.
  useEffect(() => {
    if (!state || onboardingChecked.current) return;
    onboardingChecked.current = true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(`ottho-pipeline-onboarding:${state.project.dir}`) === "fermé";
    } catch {
      // stockage indisponible
    }
    if (!dismissed && state.phase?.next?.key === "brief" && !state.brief?.exists && state.features.length === 0) setOnboarding(true);
  }, [state]);

  if (!state) return <main className="loading">Connexion au projet…</main>;

  const feature = state.features.find((f) => f.us === selectedUs) ?? null;
  const known = new Set(state.agents.map((a) => a.name));
  const runs = state.runs.filter((r) => known.has(r.agent)); // on masque Explore, general-purpose…
  const selectedAgent = state.agents.find((a) => a.id === selectedAgentId) ?? null;
  const visible = questionsFor(state.questions, feature?.us ?? null);
  const pending = visible.filter((q) => !q.answered);
  const pendingByAgent = countBy(pending, (q) => q.askedBy);
  const pendingByUs = countBy(state.questions.filter((q) => !q.answered), (q) => q.us);
  const toValidate = state.deliverables.filter((d) => d.blocking && (!feature || d.us === feature.us || d.us === null));
  const charte = state.deliverables.find((d) => d.kind === "charte") ?? null;
  const toValidateAgents = new Set(toValidate.map((d) => d.agent));
  // Livrable de l'agent choisi : celui de la feature ; sans feature, son livrable de niveau projet (PRD, architecture).
  const selectedDeliverable = !selectedAgent
    ? null
    : feature
      ? (state.deliverables.find((d) => d.us === feature.us && d.agent === selectedAgent.name) ?? null)
      : (state.deliverables.find((d) => d.us === null && d.agent === selectedAgent.name && d.kind !== "charte") ?? null);
  const stageDeliverable = !stage
    ? undefined
    : stage.us === null
      ? state.deliverables.find((d) => d.kind === "charte")
      : state.deliverables.find((d) => d.us === stage.us && d.agent === "designer");
  const stageScreens = stageDeliverable?.mockups?.screens ?? [];
  const agentWorking = runs.some((r) => r.state === "running");
  // Dernière écriture de code par un agent (hors Markdown) : recharge l'aperçu d'un site statique.
  const codeKey =
    runs
      .flatMap((r) => r.trail ?? [])
      .filter((s) => /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(s.tool) && !/\.mdx?$/i.test(s.detail))
      .map((s) => s.ts)
      .sort()
      .at(-1) ?? "";
  const previewLive = state.preview?.status === "running";
  const previewBig = right.open && previewFull;
  const previewSide = right.open && !previewFull;
  const showStage = previewBig || onboarding || Boolean(stage && stageScreens.length);
  const closeOnboarding = () => {
    setOnboarding(false);
    try {
      localStorage.setItem(`ottho-pipeline-onboarding:${state.project.dir}`, "fermé");
    } catch {
      // stockage indisponible
    }
  };
  // Clic sur une étape de la phase projet : le brief rouvre l'onboarding, les autres l'agent.
  const openStage = (s: { key: string; agent: string | null }) => {
    if (s.key === "brief") return setOnboarding(true);
    const agent = state.agents.find((a) => a.name === s.agent);
    if (agent) selectAgent(agent.id);
  };
  const showBottom = sections.journal || sections.features;
  // La scène garde toujours MAIN_MIN. Élargir l'aperçu resserre la colonne de gauche
  // (jusqu'à son minimum) ; la colonne de gauche, elle, s'arrête à l'aperçu.
  const fit = (w: number, min: number, room: number) => Math.round(Math.max(min, Math.min(w, room)));
  const rightWidth = fit(right.width, RIGHT_PANEL.min, window.innerWidth - MAIN_MIN - (side.open ? LEFT_PANEL.min + 10 : 44) - 10);
  const leftWidth = fit(side.width, LEFT_PANEL.min, window.innerWidth - MAIN_MIN - (previewSide ? rightWidth + 10 : 0) - 10);
  const columns = [side.open ? `${leftWidth}px 10px` : "44px", "minmax(0, 1fr)", previewSide ? `10px ${rightWidth}px` : ""].join(" ").trim();
  const closePreview = () => {
    right.setOpen(false);
    setPreviewFull(false);
  };
  // Choisir un agent ramène la colonne de gauche sur son livrable et ses questions.
  const selectAgent = (id: string | null) => {
    setSelectedAgentId(id);
    if (id) side.setOpen(true);
    setDocsOpen(false);
    setConfigOpen(false);
    setViewingFile(null);
  };
  const openConfig = (open: boolean) => {
    if (open) side.setOpen(true);
    setConfigOpen(open);
    setDocsOpen(false);
    setViewingFile(null);
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">
            ottho<span className="brand__sep">/</span>builder 2
          </span>
        </div>
        <h1 className="topbar__project" title={state.project.dir}>
          {state.project.name}
        </h1>
        {state.branch && (
          <span
            className={/^(main|master|develop)$/.test(state.branch.name ?? "") ? "branch-chip is-base" : "branch-chip"}
            title={`Branche Git du projet : ${state.branch.name ?? "aucune (HEAD détachée)"}. ${
              state.branch.dirty ? `${state.branch.dirty} fichier${state.branch.dirty > 1 ? "s" : ""} modifié${state.branch.dirty > 1 ? "s" : ""} ou nouveau${state.branch.dirty > 1 ? "x" : ""}, pas encore commité${state.branch.dirty > 1 ? "s" : ""}.` : "Tout est commité."
            }`}
          >
            <span aria-hidden="true">⎇</span>
            <span className="branch-chip__name">{state.branch.name ?? "HEAD détachée"}</span>
            {state.branch.dirty > 0 && <span className="branch-chip__dirty">+{state.branch.dirty}</span>}
          </span>
        )}
        <span className={online ? "live on" : "live off"}>{online ? "en direct" : "hors ligne"}</span>
        <button
          type="button"
          className="tb-toggle"
          aria-pressed={right.open}
          aria-label="Aperçu"
          onClick={() => (right.open ? closePreview() : right.setOpen(true))}
          title={previewLive ? `Aperçu de l'app en ligne : ${state.preview?.url}` : "Voir l'app du projet"}
        >
          <span aria-hidden="true">▶</span>
          <span className="tb-label">Aperçu</span>
          {previewLive && <span className="tb-toggle__dot is-ok" aria-label="aperçu en ligne" />}
        </button>
        <button
          type="button"
          className="tb-toggle"
          aria-expanded={docsOpen}
          onClick={() => {
            if (!docsOpen) side.setOpen(true);
            setDocsOpen(!docsOpen);
            setConfigOpen(false);
            setViewingFile(null);
          }}
          title="Tous les documents Markdown du projet"
          aria-label="Documents"
        >
          <span aria-hidden="true">▤</span>
          <span className="tb-label">Documents</span>
        </button>
        <button
          type="button"
          className="tb-toggle"
          aria-expanded={configOpen}
          aria-label="Configuration"
          onClick={() => openConfig(!configOpen)}
          title="Configurer Supabase, Stripe, les e-mails… (écrit dans .env.local)"
        >
          <span aria-hidden="true">⚙</span>
          <span className="tb-label">Config</span>
        </button>
        <button
          type="button"
          className="tb-toggle"
          aria-pressed={sections.journal}
          aria-label="Journal"
          onClick={() => toggleSection("journal")}
          title={sections.journal ? "Cacher le journal des agents" : "Afficher le journal des agents"}
        >
          <span aria-hidden="true">◷</span>
          <span className="tb-label">Journal</span>
          {!sections.journal && agentWorking && <span className="tb-toggle__dot" aria-label="un agent travaille" />}
        </button>
        <button
          type="button"
          className="tb-toggle"
          aria-pressed={sections.features}
          aria-label="Features"
          onClick={() => toggleSection("features")}
          title={sections.features ? "Cacher l'avancement des features" : "Afficher l'avancement des features"}
        >
          <span aria-hidden="true">▦</span>
          <span className="tb-label">Features</span>
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          <span className="tb-label">{theme === "dark" ? "Clair" : "Sombre"}</span>
        </button>
        <label className="feature-select">
          <span className="eyebrow tb-label">Feature</span>
          <select
            aria-label="Feature"
            value={selectedUs ?? ""}
            onChange={(e) => {
              setSelectedUs(e.target.value || null);
              setStage(null);
            }}
          >
            <option value="">Toutes</option>
            {state.features.map((f) => (
              <option key={f.us} value={f.us}>
                {f.us} {f.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div
        className={`layout${side.open ? "" : " is-collapsed"}${previewSide ? " has-right" : ""}`}
        style={{ gridTemplateColumns: columns }}
      >
        {side.open ? (
          <>
            {viewingFile ? (
              <FileViewer path={viewingFile} token={state.writeToken} onClose={() => setViewingFile(null)} />
            ) : configOpen ? (
              <ConfigPanel token={state.writeToken} onClose={() => setConfigOpen(false)} />
            ) : docsOpen ? (
              // Liste relue à chaque état poussé par le serveur (fichier modifié, nouvelle action).
              <DocsBrowser token={state.writeToken} refreshKey={state.generatedAt} current={null} onOpen={setViewingFile} onClose={() => setDocsOpen(false)} />
            ) : (
              <QuestionsColumn
                context={feature ? `${feature.us} ${feature.title}` : "Toutes les features"}
                agent={selectedAgent?.name ?? null}
                featureSelected={Boolean(feature)}
                deliverable={selectedDeliverable}
                charte={charte}
                assets={state.assets}
                toValidate={toValidate}
                questions={visible}
                showUs={!feature}
                database={state.database ?? null}
                supabase={state.services?.find((s) => s.key === "supabase")}
                onConfigure={() => openConfig(true)}
                phase={state.phase}
                onStage={openStage}
                onClose={() => setSelectedAgentId(null)}
                onOpenCanvas={(focus) => {
                  if (!feature) return;
                  setStage({ us: feature.us, focus });
                  setPreviewFull(false);
                }}
                onOpenProjectCanvas={(focus) => {
                  setStage({ us: null, focus });
                  setPreviewFull(false);
                }}
              />
            )}

            <SideSplitter
              edge="left"
              label="Largeur de la colonne de gauche"
              width={leftWidth}
              limits={side.limits}
              onResize={side.setWidth}
              onCollapse={() => side.setOpen(false)}
              collapseLabel="Fermer la colonne de gauche"
            />
          </>
        ) : (
          <SideRail waiting={pending.length + toValidate.length} onOpen={() => side.setOpen(true)} />
        )}

        <main className={showStage ? "main is-stage" : showBottom ? "main" : "main no-bottom"}>
          {state.agents.length === 0 && (
            <p className="notice">
              Aucun agent trouvé. Installe le plugin : <code>/plugin install ottho-code-app</code>
            </p>
          )}

          <div className="banner-stack">
            <SessionNotice session={state.session} />
            <NextStepBanner
              feature={feature}
              hasFeatures={state.features.length > 0}
              pending={pending.length}
              charteToValidate={Boolean(charte?.blocking)}
              phase={state.phase}
              onboardingOpen={onboarding && !previewBig}
              onOpenBrief={() => setOnboarding(true)}
              onSelectAgent={(name) => openStage({ key: "", agent: name })}
              activeRun={
                feature?.next?.reason === "running"
                  ? (runs.find((r) => r.state === "running" && r.us === feature.us && r.agent === feature.next?.agent) ?? null)
                  : null
              }
            />
          </div>

          {previewBig ? (
            <PreviewStage
              preview={state.preview}
              token={state.writeToken}
              codeKey={codeKey}
              layout="full"
              onToggleLayout={() => setPreviewFull(false)}
              onClose={closePreview}
            />
          ) : onboarding ? (
            <OnboardingStage token={state.writeToken} refreshKey={state.generatedAt} onClose={closeOnboarding} />
          ) : stage && stageScreens.length ? (
            <CanvasStage
              key={`${stage.us ?? "projet"}-${stage.focus ?? "tout"}`}
              title={stage.us === null ? "Maquettes du projet" : feature ? `${feature.us} ${feature.title}` : stage.us}
              screens={stageScreens}
              links={stageDeliverable?.mockups?.links ?? []}
              focus={stage.focus}
              theme={theme}
              onClose={() => setStage(null)}
            />
          ) : (
            <>
              <section className="graph-zone">
                <PipelineGraph
                  agents={state.agents}
                  feature={feature}
                  runs={runs}
                  pendingByAgent={pendingByAgent}
                  toValidate={toValidateAgents}
                  selectedId={selectedAgent?.id ?? null}
                  onSelect={selectAgent}
                  theme={theme}
                  services={state.services}
                />
                {selectedAgent && (
                  <AgentPanel
                    agent={selectedAgent}
                    runs={runs.filter((r) => r.agent === selectedAgent.name)}
                    pending={pendingByAgent.get(selectedAgent.name) ?? 0}
                    toValidate={toValidateAgents.has(selectedAgent.name)}
                    token={state.writeToken}
                    deliverables={state.deliverables.filter((d) => d.agent === selectedAgent.name && d.kind !== "charte")}
                    services={state.services}
                    onOpenFile={(path) => {
                      setViewingFile(path);
                      side.setOpen(true);
                    }}
                    onClose={() => setSelectedAgentId(null)}
                  />
                )}
              </section>

              {showBottom && (
                <section className={sections.journal && sections.features ? "bottom" : "bottom bottom--single"}>
                  {sections.journal && (
                    <Journal runs={runs} onSelectAgent={(name) => selectAgent(state.agents.find((a) => a.name === name)?.id ?? null)} />
                  )}
                  {sections.features && (
                    <FeaturesTable features={state.features} pendingByUs={pendingByUs} selected={selectedUs ?? null} onSelect={setSelectedUs} />
                  )}
                </section>
              )}
            </>
          )}

          {(!state.git || state.corrupt > 0) && (
            <footer className="footer">
              {!state.git && <span>Git absent : colonnes Code et Merge indisponibles.</span>}
              {state.corrupt > 0 && <span>{state.corrupt} ligne(s) du journal illisibles, ignorées.</span>}
            </footer>
          )}
        </main>

        {previewSide && (
          <>
            <SideSplitter
              edge="right"
              label="Largeur de l'aperçu"
              width={rightWidth}
              limits={right.limits}
              onResize={right.setWidth}
              onCollapse={closePreview}
              collapseLabel="Fermer l'aperçu"
            />
            <PreviewStage
              preview={state.preview}
              token={state.writeToken}
              codeKey={codeKey}
              layout="side"
              onToggleLayout={() => setPreviewFull(true)}
              onClose={closePreview}
            />
          </>
        )}
      </div>
    </div>
  );
}
