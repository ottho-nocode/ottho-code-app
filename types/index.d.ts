// Contrat de l'état que le panneau « Équipe » (hooks/equipe/register.tsx) garde pour la session.

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

declare module 'claude-code' {
  interface PluginState {
    'ottho-code-app': { equipe: PanelView | null }
  }
}
