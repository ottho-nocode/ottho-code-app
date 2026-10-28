// Ce que le panneau affiche, calculé à partir de l'état d'Ottho Builder (/api/state).
// Fonctions pures : aucun accès à `$`, testables seules.

import type { AgentCard, AgentStatus, PanelView, Pending, Stage } from '../../types'

export type { AgentCard, AgentStatus, PanelView, Pending, Stage }

export type Step = { tool: string; detail: string; ts: string }

export type Run = {
  agent: string
  us: string | null
  start: string
  end: string | null
  verdict: string | null
  activity: Step | null
  lastSeen?: string
  steps: number
  trail: Step[]
  state: 'running' | 'done' | 'interrupted'
}

export type Feature = {
  us: string
  title: string
  columns: Record<string, string>
  next: { agent: string; reason: 'todo' | 'running' | 'fix' | 'validate' } | null
  agents: Record<string, 'running' | 'done' | 'interrupted'>
  toValidate: string[]
}

export type Question = {
  id: string
  us: string | null
  askedBy: string
  text: string
  answered: boolean
}

export type BuilderState = {
  project: { dir: string; name: string }
  focus: string | null
  features: Feature[]
  runs: Run[]
  questions: Question[]
  session?: {
    ask: { questions: string[] } | null
    wait: { message: string } | null
  }
}

// Ordre de la méthode et couleur de chaque robot (reprise de la vue web).
export const AGENTS: { name: string; role: string; accent: string }[] = [
  { name: 'brainstorming', role: 'Cadrage', accent: '#facc15' },
  { name: 'spec-writer', role: 'Spec', accent: '#fb923c' },
  { name: 'designer', role: 'Maquettes', accent: '#f472b6' },
  { name: 'architect', role: 'Plan technique', accent: '#60a5fa' },
  { name: 'developer', role: 'Code', accent: '#4ade80' },
  { name: 'code-reviewer', role: 'Revue', accent: '#22d3ee' },
  { name: 'tester', role: 'Tests', accent: '#34d399' },
  { name: 'devops', role: 'Infra', accent: '#fb923c' },
  { name: 'doc-writer', role: 'Doc', accent: '#fbbf24' },
  { name: 'security-auditor', role: 'Sécurité', accent: '#f87171' },
]

const DELIVERABLE_LABEL: Record<string, string> = {
  'spec-writer': 'la spec',
  designer: 'la maquette',
  architect: 'le plan',
}

const STAGES: { key: string; label: string }[] = [
  { key: 'spec', label: 'Spec' },
  { key: 'plan', label: 'Plan' },
  { key: 'code', label: 'Code' },
  { key: 'review', label: 'Revue' },
  { key: 'tests', label: 'Tests' },
  { key: 'merge', label: 'Fusion' },
]

const STAGE_MARK: Record<string, string> = { done: '✓', running: '◉', ko: '✗', todo: '·', na: '–' }

// Agent en cours sans action depuis 8 min : même seuil que la vue web.
export const SILENT_MS = 8 * 60_000

export function stepLabel(step: Step): string {
  const t = step.tool
  const object = step.detail ? ` ${step.detail}` : ''
  if (t === 'Read') return `lit${object}`
  if (t === 'Write') return `écrit${object}`
  if (t === 'Edit' || t === 'MultiEdit' || t === 'NotebookEdit') return `modifie${object}`
  if (t === 'Bash') return `exécute${object}`
  if (t === 'Glob' || t === 'Grep') return `cherche${object}`
  if (t === 'WebFetch') return `consulte${object}`
  if (t === 'WebSearch') return `recherche${object}`
  if (t === 'Artifact') return step.detail === 'read' || step.detail === 'list' ? 'lit le canevas' : 'publie sur Claude Design'
  if (t === 'Skill') return `utilise le skill${object}`
  if (t.startsWith('mcp__')) return `outil${object}`
  return `${t}${object}`
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}

function featureLabel(f: Feature): string {
  return `${f.us}${f.title ? ` (${f.title})` : ''}`
}

// Même texte que le bandeau « Prochaine étape » de la vue web (promptFor).
export function promptFor(f: Feature): string | null {
  const n = f.next
  if (!n || n.reason === 'running') return null
  const label = featureLabel(f)
  if (n.agent === 'doc-writer') return `Lance l'agent doc-writer sur ${label}, puis /ottho-code-app:ship-feature.`
  if (n.reason === 'fix') return `Lance l'agent developer sur ${label} pour corriger les points du dernier rapport.`
  if (n.agent === 'architect') return `GO PLAN : lance l'agent architect sur ${label}, avec mes réponses consignées dans la section « Questions ouvertes » de la spec.`
  if (n.agent === 'developer') return `GO IMPLEMENT : lance l'agent developer sur ${label}, avec mes réponses consignées dans les « Questions ouvertes » de la spec et du plan.`
  return `Lance l'agent ${n.agent} sur ${label}.`
}

function byStart(a: Run, b: Run): number {
  return Date.parse(a.start) - Date.parse(b.start)
}

function agentCard(
  agent: { name: string; role: string; accent: string },
  feature: Feature | null,
  runs: Run[],
  now: number,
): AgentCard {
  const mine = runs.filter(r => r.agent === agent.name).sort(byStart)
  const last = mine[mine.length - 1] ?? null
  const featureStatus = feature?.agents[agent.name]
  let status: AgentStatus = last?.state ?? featureStatus ?? 'idle'
  let statusLabel = 'pas encore intervenu'
  if (status === 'running' && last) {
    const quiet = now - Date.parse(last.lastSeen ?? last.activity?.ts ?? last.start)
    if (quiet >= SILENT_MS) {
      status = 'silent'
      statusLabel = `sans nouvelles depuis ${duration(quiet)}`
    } else {
      statusLabel = `travaille depuis ${duration(now - Date.parse(last.start))}`
    }
  } else if (status === 'done') {
    statusLabel = last?.verdict ? `terminé · ${last.verdict}` : 'terminé'
  } else if (status === 'interrupted') {
    statusLabel = 'interrompu'
  }
  const current = last?.activity ? stepLabel(last.activity) : null
  const trail = (last?.trail ?? []).slice(-4).map(stepLabel)

  return {
    name: agent.name,
    role: agent.role,
    accent: agent.accent,
    status,
    statusLabel,
    current,
    trail,
    passes: mine.length,
  }
}

function pendingFor(state: BuilderState, feature: Feature | null, cards: AgentCard[]): Pending[] {
  const out: Pending[] = []
  const ask = state.session?.ask
  if (ask && ask.questions.length > 0) {
    out.push({ agent: null, tone: 'answer', prompt: null, text: `Claude attend ta réponse : ${ask.questions.join(' / ')}` })
  }
  const wait = state.session?.wait
  if (wait) out.push({ agent: null, tone: 'answer', prompt: null, text: wait.message })

  const open = state.questions
    .filter(q => !q.answered)
    .sort((a, b) => Number(b.us === state.focus) - Number(a.us === state.focus))
  for (const q of open) {
    out.push({ agent: q.askedBy, tone: 'answer', prompt: null, text: `${q.us ? `${q.us} · ` : ''}${q.text}` })
  }

  if (!feature) return out
  for (const agent of feature.toValidate) {
    const what = DELIVERABLE_LABEL[agent] ?? 'le livrable'
    out.push({
      agent,
      tone: 'validate',
      prompt: `Je valide ${what} de ${feature.us}.`,
      text: `Valide ${what} de ${agent} pour ${feature.us}.`,
    })
  }

  const n = feature.next
  if (!n || n.reason === 'validate') return out
  if (n.reason === 'running') {
    const card = cards.find(c => c.name === n.agent)
    if (card?.status === 'silent') {
      out.push({
        agent: n.agent,
        tone: 'warn',
        prompt: `Lance l'agent ${n.agent} sur ${featureLabel(feature)} : son passage précédent a été interrompu.`,
        text: `${n.agent} ${card.statusLabel}. Il attend peut-être une autorisation ici, ou sa session a été fermée.`,
      })
    } else {
      out.push({ agent: n.agent, tone: 'info', prompt: null, text: `${n.agent} travaille sur ${feature.us}. Rien à faire pour l'instant.` })
    }
    return out
  }
  out.push({
    agent: n.agent,
    tone: 'launch',
    prompt: promptFor(feature),
    text: n.reason === 'fix' ? `Prochaine étape : corrections par ${n.agent} sur ${feature.us}.` : `Prochaine étape : lancer ${n.agent} sur ${feature.us}.`,
  })
  return out
}

export function buildView(state: BuilderState, now: number, builderUrl: string): PanelView {
  const feature = state.features.find(f => f.us === state.focus) ?? state.features[state.features.length - 1] ?? null
  const runs = feature ? state.runs.filter(r => r.us === feature.us) : state.runs
  const agents = AGENTS.map(a => agentCard(a, feature, runs, now))

  return {
    isOnline: true,
    project: state.project.name,
    focus: feature?.us ?? null,
    title: feature?.title ?? null,
    stages: feature
      ? STAGES.map(s => {
          const status = feature.columns[s.key] ?? 'todo'
          return { label: s.label, status, mark: STAGE_MARK[status] ?? '·' }
        })
      : [],
    pending: pendingFor(state, feature, agents),
    agents,
    builderUrl,
    checkedAt: new Date(now).toISOString(),
  }
}

export function offlineView(project: string, now: number): PanelView {
  return {
    isOnline: false,
    project,
    focus: null,
    title: null,
    stages: [],
    pending: [],
    agents: AGENTS.map(a => ({ ...a, status: 'idle', statusLabel: '', current: null, trail: [], passes: 0 })),
    builderUrl: null,
    checkedAt: new Date(now).toISOString(),
  }
}

// Tête du robot dans un SVG : le desktop dessine un Svg comme une image, PNG intégré compris.
export function headSvg(base64: string | undefined, accent: string, status: AgentStatus, size: number): string {
  const isActive = status === 'running' || status === 'silent'
  const ring = status === 'silent' ? '#f87171' : accent
  const opacity = status === 'idle' ? 0.4 : 1
  const pad = Math.round(size * 0.1)
  const inner = size - pad * 2
  const picture = base64
    ? `<image href="data:image/png;base64,${base64}" x="${pad}" y="${pad}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated"/>`
    : ''
  const stroke = isActive ? `<rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" rx="${size / 4}" fill="none" stroke="${ring}" stroke-width="3"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g opacity="${opacity}"><rect width="${size}" height="${size}" rx="${size / 4}" fill="${accent}" fill-opacity="0.22"/>${picture}</g>${stroke}</svg>`
}
