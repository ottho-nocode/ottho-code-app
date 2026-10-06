// Contrat de l'état que les panneaux du plugin gardent pour la session : « Équipe »
// (hooks/equipe/register.tsx) et « Agents Ottho » (hooks/agents-pane/register.tsx).

export type AgentStatus = 'running' | 'silent' | 'done' | 'interrupted' | 'idle'

export type AgentCard = {
  name: string
  role: string
  accent: string
  status: AgentStatus
  statusLabel: string
  current: string | null
  trail: string[]
  passes: number
}

export type Pending = {
  agent: string | null
  text: string
  prompt: string | null
  tone: 'answer' | 'validate' | 'launch' | 'info' | 'warn'
}

export type Stage = { label: string; mark: string; status: string }

export type PanelView = {
  isOnline: boolean
  project: string
  focus: string | null
  title: string | null
  stages: Stage[]
  pending: Pending[]
  agents: AgentCard[]
  builderUrl: string | null
  checkedAt: string
}

// « Agents Ottho » : dernière exécution de chaque agent lue dans le journal du pipeline.
export type AgentRun = {
  id: string
  agent: string
  us: string | null
  status: 'running' | 'done' | 'interrupted'
  startedAt: number
  endedAt: number | null
  lastSeen: number
  activity: string | null
  verdict: string | null
  next: string | null
}

export type Waiting = {
  kind: 'ask' | 'wait'
  count: number
  since: number
  message?: string | null
}

export type AgentsSnapshot = {
  latest: Record<string, AgentRun>
  waiting: Waiting | null
  next: string | null
  us: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'ottho-code-app': { equipe: PanelView | null; agents: AgentsSnapshot | null; agentsNow: number }
  }
}
