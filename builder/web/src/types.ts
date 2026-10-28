export type Phase = "specify" | "plan" | "implement" | "validate" | "transverse";
export type AgentStatus = "idle" | "running" | "done" | "interrupted";
export type CellStatus = "done" | "running" | "todo" | "ko" | "na";
export type Column = "spec" | "plan" | "code" | "review" | "tests" | "merge";

export type Agent = {
  id: string;
  name: string;
  source: "plugin" | "projet";
  description: string;
  model: string;
  effort: string | null;
  maxTurns: number | null;
  tools: string[];
  // Services externes (MCP) que l'agent sait appeler, ex. ["supabase", "stripe"].
  services?: string[];
  phase: Phase;
  body: string;
};

// Service externe branché pour le projet, et par où (projet, local, utilisateur, connecteur claude.ai).
export type SupabaseTarget = { via: string; project: string | null; readOnly: boolean };
export type Service = { key: string; label: string; via: string[]; needsAuth?: boolean; targets?: SupabaseTarget[] };
// Base de données de l'app du projet, lue dans ses .env (adresse seulement).
export type AppDatabase = { kind: string; project: string | null; host: string; source: string };

// Aperçu de l'app du projet (serveur local lancé par le pipeline).
export type Preview = {
  status: "idle" | "starting" | "running" | "failed";
  mode: "static" | "npm" | "none";
  command: string | null;
  url: string | null;
  // Adresse affichée dans le cadre de l'aperçu : relais local qui retire les protections
  // anti-cadre de l'app (absente d'un serveur plus ancien : url).
  frameUrl?: string | null;
  error: string | null;
  log: string;
};

// Configuration des services de l'app (.env.local) : jamais la valeur d'un secret.
export type ConfigField = { name: string; label: string; secret: boolean; required: boolean; set: boolean; value?: string };
export type ConfigService = { key: string; label: string; fields: ConfigField[] };
export type ConfigStatus = { file: string; prefix: string; services: ConfigService[]; other: string[] };

// Brief du projet (onboarding), écrit dans docs/brief.md par Claude (commande brief du CLI) :
// canevas en six blocs du module « De l'idée au projet validé ». Les blocs (champs, consignes,
// critères) viennent du serveur.
export type BriefField = { key: string; label: string; type: "text" | "textarea" | "number"; help?: string };
export type BriefBlock = { key: string; title: string; intro: string; multiple?: boolean; fields: BriefField[]; rubric: string[] };
export type BriefValues = Record<string, string>;
export type Brief = { name: string; [block: string]: string | BriefValues | BriefValues[] };

// Phase projet, avant la première feature.
export type PhaseKey = "brief" | "vision" | "prd" | "design" | "architecture" | "infra" | "features";
export type PhaseStage = { key: PhaseKey; label: string; agent: string | null; state: "todo" | "started" | "running" | "validate" | "done" };
export type ProjectPhase = { stages: PhaseStage[]; next: { key: PhaseKey; agent: string | null; state: PhaseStage["state"] } | null };

export type SessionStatus = {
  ask: { ts: string; session: string | null; questions: string[] } | null;
  wait: { ts: string; session: string | null; message: string; kind?: "questions"; questions?: string[] } | null;
};

export type Feature = {
  us: string;
  title: string;
  columns: Record<Column, CellStatus>;
  next: { agent: string; reason: "todo" | "running" | "fix" | "validate" } | null;
  agents: Record<string, Exclude<AgentStatus, "idle">>;
  toValidate: string[];
};

export type Asset = { path: string; name: string; kind: "image" | "font" | "document"; size: number };

export type Screen = { path: string; title: string; x: number | null; y: number | null; w: number; h: number };

export type Deliverable = {
  us: string | null;
  agent: string;
  kind?: "charte" | "prd" | "architecture";
  file: string;
  validated: boolean;
  validatedAt: string | null;
  blocking: boolean;
  mockups?: { links: string[]; linkKinds?: string[]; screens: Screen[]; images: string[]; pen: string[] };
};

export type Run = {
  id: string | null;
  agentId: string | null;
  agent: string;
  source: string;
  us: string | null;
  branch: string | null;
  start: string;
  end: string | null;
  next: string | null;
  verdict: string | null;
  questions: string[];
  activity: Step | null;
  // Dernier signe de vie : lancement, puis chaque action.
  lastSeen?: string;
  steps: number;
  trail: Step[];
  files: string[];
  hasReport: boolean;
  state: "running" | "done" | "interrupted";
};

export type Step = { tool: string; detail: string; ts: string };

export type Question = {
  id: string;
  origin: "livrable" | "direct";
  us: string | null;
  askedBy: string;
  text: string;
  answered: boolean;
  answer: string | null;
  answeredAt: string | null;
  // Répondue dans le sélecteur du terminal (pas encore consignée dans le livrable).
  answeredIn?: "terminal";
  askedAt: string | null;
  line: number | null;
  // Livrable où Claude consigne la réponse.
  target: { file: string };
};

export type State = {
  project: { dir: string; name: string };
  git: boolean;
  pluginFound: boolean;
  agents: Agent[];
  features: Feature[];
  focus: string | null;
  runs: Run[];
  questions: Question[];
  deliverables: Deliverable[];
  assets: Asset[];
  services?: Service[];
  brief?: { exists: boolean; complete: boolean };
  phase?: ProjectPhase;
  // Branche Git courante du projet et fichiers non commités.
  branch?: { name: string | null; dirty: number } | null;
  // Ce que la session principale (Claude Code, dans le terminal) attend : réponse à ses questions, autorisation.
  session?: SessionStatus;
  database?: AppDatabase | null;
  preview?: Preview;
  writeToken: string;
  corrupt: number;
  generatedAt: string;
};
