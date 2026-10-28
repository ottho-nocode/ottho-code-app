// Lecture du journal du pipeline (.claude/pipeline-events.jsonl, écrit par le plugin
// ottho-code-app) : dernière exécution de chaque agent, attente de la session, prochaine étape.
// Fonctions pures, sans `$` : testables seules.
import type { AgentRun, AgentsSnapshot, Waiting } from '../../types'

// Ordre du pipeline Ottho (agents du plugin).
export const PIPELINE = [
  'brainstorming',
  'spec-writer',
  'designer',
  'architect',
  'developer',
  'code-reviewer',
  'tester',
  'devops',
  'doc-writer',
] as const

// Sans signe de vie depuis 30 min : session fermée en cours de route.
export const STALE_MS = 30 * 60_000
// Au-delà, une attente de la session est périmée (session fermée sans réponse) : même règle que le Builder.
export const ASK_MAX_MS = 12 * 3600_000
export const WAIT_MAX_MS = 30 * 60_000

export type PipelineEvent = {
  type?: string
  ts?: string
  id?: string
  agentId?: string
  agent?: string
  source?: string
  us?: string | null
  tool?: string
  detail?: string
  next?: string | null
  verdict?: string | null
  questions?: unknown[]
  message?: string
}

// Une ligne illisible est ignorée (journal en cours d'écriture, ancienne version).
export function parseEvents(text: string): PipelineEvent[] {
  const events: PipelineEvent[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const value: unknown = JSON.parse(line)
      if (value && typeof value === 'object') events.push(value as PipelineEvent)
    } catch {
      // ligne coupée : ignorée
    }
  }
  return events
}

const time = (ts: string | undefined) => {
  const t = ts ? Date.parse(ts) : NaN
  return Number.isFinite(t) ? t : 0
}

const VERBS: Record<string, string> = {
  Read: 'lit',
  Write: 'écrit',
  Edit: 'modifie',
  MultiEdit: 'modifie',
  NotebookEdit: 'modifie',
  Bash: 'lance',
  Glob: 'cherche',
  Grep: 'cherche',
  WebFetch: 'consulte',
  WebSearch: 'cherche sur le web',
  Skill: 'suit le skill',
  Artifact: 'publie',
}

// « lit specs/US-02.md », « lance git », « service supabase ».
export function describeActivity(tool: string | undefined, detail: string | undefined): string | null {
  if (!tool) return null
  if (tool.startsWith('mcp__')) return `service ${tool.split('__')[1] ?? ''}`.trim()
  const verb = VERBS[tool] ?? tool
  return detail ? `${verb} ${detail}` : verb
}

export function buildSnapshot(events: PipelineEvent[], now: number): AgentsSnapshot {
  const runs = new Map<string, AgentRun>()
  const byAgentId = new Map<string, AgentRun>()
  let waiting: Waiting | null = null
  let next: string | null = null

  for (const e of events) {
    const at = time(e.ts)
    if (e.source === 'session' || e.source === 'terminal' || e.agent === 'claude') {
      if (e.type === 'ask') waiting = { kind: 'ask', count: Array.isArray(e.questions) ? e.questions.length : 0, since: at }
      else if (e.type === 'wait') waiting = { kind: 'wait', count: 0, since: at, message: e.message ?? null }
      else if (e.type === 'reply' || e.type === 'answered' || e.type === 'resume') waiting = null
      continue
    }
    if (e.type === 'start' && e.id && e.agent) {
      const run: AgentRun = {
        id: e.id,
        agent: e.agent,
        us: e.us ?? null,
        status: 'running',
        startedAt: at,
        endedAt: null,
        lastSeen: at,
        activity: null,
        verdict: null,
        next: null,
      }
      runs.set(e.id, run)
    } else if (e.type === 'launch' && e.id && e.agentId) {
      const run = runs.get(e.id)
      if (run) byAgentId.set(e.agentId, run)
    } else if (e.type === 'activity' && e.agentId) {
      const run = byAgentId.get(e.agentId)
      if (run && run.status === 'running') {
        run.lastSeen = Math.max(run.lastSeen, at)
        run.activity = describeActivity(e.tool, e.detail)
      }
    } else if (e.type === 'end' && e.id) {
      const run = runs.get(e.id)
      if (run) {
        run.status = 'done'
        run.endedAt = at
        run.activity = null
        run.verdict = e.verdict ?? null
        run.next = e.next ?? null
      }
      if (e.next) next = e.next
    }
  }

  // Dernière exécution de chaque agent ; une exécution sans signe de vie récent est interrompue.
  const latest: Record<string, AgentRun> = {}
  for (const run of runs.values()) {
    if (run.status === 'running' && now - run.lastSeen > STALE_MS) run.status = 'interrupted'
    const known = latest[run.agent]
    if (!known || run.startedAt >= known.startedAt) latest[run.agent] = run
  }
  if (waiting && now - waiting.since > (waiting.kind === 'ask' ? ASK_MAX_MS : WAIT_MAX_MS)) waiting = null
  const recent = Object.values(latest).sort((a, b) => b.startedAt - a.startedAt)[0]
  return { latest, waiting, next, us: recent?.us ?? null }
}

// « 3 min », « 2 h 05 », « 1 j ».
export function since(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)} j`
}

// Notification pour un nouvel événement, ou null.
export function toastFor(e: PipelineEvent): string | null {
  const us = e.us ? ` (${e.us})` : ''
  if (e.type === 'start' && e.agent) return `◉ ${e.agent} démarre${us}`
  if (e.type === 'end' && e.agent) {
    const verdict = e.verdict ? ` : ${e.verdict}` : ''
    const next = e.next ? ` → ${e.next}` : ''
    return `✓ ${e.agent} a fini${us}${verdict}${next}`
  }
  if (e.type === 'ask' && (e.source === 'session' || e.agent === 'claude')) {
    const n = Array.isArray(e.questions) ? e.questions.length : 0
    return n > 0 ? `? Claude attend ta réponse (${n} question${n > 1 ? 's' : ''})` : '? Claude attend ta réponse'
  }
  if (e.type === 'wait') return '! Claude attend ton autorisation'
  return null
}
