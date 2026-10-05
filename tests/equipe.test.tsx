import { describe, expect, test } from 'claude-code/testing'

import { buildView } from '../hooks/equipe/view'
import type { BuilderState } from '../hooks/equipe/view'

const START = '2026-10-05T10:00:00.000Z'
const LAST_STEP = '2026-10-05T10:05:00.000Z'

const STATE: BuilderState = {
  project: { dir: '/proj', name: 'proj' },
  focus: 'US-07',
  features: [
    {
      us: 'US-07',
      title: "Liste d'attente (F2)",
      columns: { spec: 'done', plan: 'done', code: 'done', review: 'done', tests: 'ko', merge: 'todo' },
      next: { agent: 'developer', reason: 'fix' },
      agents: { 'spec-writer': 'done', developer: 'running' },
      toValidate: ['architect'],
    },
  ],
  runs: [
    {
      agent: 'spec-writer',
      us: 'US-07',
      start: '2026-10-05T09:00:00.000Z',
      end: '2026-10-05T09:10:00.000Z',
      verdict: null,
      activity: { tool: 'Write', detail: 'specs/US-07.md', ts: '2026-10-05T09:09:00.000Z' },
      steps: 4,
      trail: [],
      state: 'done',
    },
    {
      agent: 'developer',
      us: 'US-07',
      start: START,
      end: null,
      verdict: null,
      activity: { tool: 'Edit', detail: 'lib/waitlist/matching.ts', ts: LAST_STEP },
      lastSeen: LAST_STEP,
      steps: 3,
      trail: [
        { tool: 'Read', detail: 'reviews/US-07.md', ts: START },
        { tool: 'Edit', detail: 'lib/waitlist/matching.ts', ts: LAST_STEP },
      ],
      state: 'running',
    },
  ],
  questions: [{ id: 'q1', us: 'US-07', askedBy: 'architect', text: 'Faut-il dédoublonner ?', answered: false }],
  session: { ask: null, wait: null },
}

const URL = 'http://127.0.0.1:4317'

describe('buildView', () => {
  test("agent en cours : depuis quand, et ses dernières actions", async () => {
    const view = buildView(STATE, Date.parse('2026-10-05T10:06:00.000Z'), URL)
    const developer = view.agents.find(a => a.name === 'developer')
    expect(developer?.status).toBe('running')
    expect(developer?.statusLabel).toBe('travaille depuis 6 min')
    expect(developer?.trail).toEqual(['lit reviews/US-07.md', 'modifie lib/waitlist/matching.ts'])
    expect(view.agents.find(a => a.name === 'spec-writer')?.statusLabel).toBe('terminé')
    expect(view.agents.find(a => a.name === 'devops')?.status).toBe('idle')
  })

  test('agent silencieux depuis 8 min : signalé, avec le prompt de relance', async () => {
    const view = buildView(STATE, Date.parse('2026-10-05T10:20:00.000Z'), URL)
    expect(view.agents.find(a => a.name === 'developer')?.status).toBe('silent')
  })

  test('validations attendues : question, livrable à valider, prochaine étape', async () => {
    const view = buildView(STATE, Date.parse('2026-10-05T10:06:00.000Z'), URL)
    expect(view.pending.map(p => p.tone)).toEqual(['answer', 'validate', 'launch'])
    expect(view.pending[0]?.text).toBe('US-07 · Faut-il dédoublonner ?')
    expect(view.pending[1]?.prompt).toBe('Je valide le plan de US-07.')
    expect(view.pending[2]?.prompt).toBe(
      "Lance l'agent developer sur US-07 (Liste d'attente (F2)) pour corriger les points du dernier rapport.",
    )
  })

  test('étapes de la feature dans l’ordre de la méthode', async () => {
    const view = buildView(STATE, Date.parse('2026-10-05T10:06:00.000Z'), URL)
    expect(view.stages.map(s => `${s.mark} ${s.label}`)).toEqual([
      '✓ Spec',
      '✓ Plan',
      '✓ Code',
      '✓ Revue',
      '✗ Tests',
      '· Fusion',
    ])
  })
})

test('le panneau s’ouvre seul et se dessine sur desktop et en terminal à partir d’Ottho Builder', async ($, on) => {
  // Ce qui tient lieu de Claude Code sous le panneau : dossier, fichiers, réseau, commandes, panneau.
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('command.register', () => ({ value: { command: 'equipe', agent: '' } }))
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('fs.read', () => ({ value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } }))
  on('http.fetch', ($, e) => {
    if (e.url.startsWith(`${URL}/api/health?project=`)) {
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ app: 'ottho-pipeline', project: '/proj' }) } }
    }
    if (e.url === `${URL}/api/state`) {
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(STATE) } }
    }
    throw new Error('connexion refusée')
  })

  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual(['ottho-equipe'])

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'ottho-code-app',
      surface,
      component: 'Pane',
      requestId: 'ottho-equipe',
      props: { title: 'Équipe', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: 'À toi de jouer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Faut-il dédoublonner/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'developer' })).toBeDefined()
    expect(await ui.find({ key: 'pending-1' })).toBeDefined()
    await ui.unmount()
  }
})

test('sans Ottho Builder pour le projet, le panneau ne s’ouvre pas tout seul', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/autre' }))
  on('command.register', () => ({ value: { command: 'equipe', agent: '' } }))
  on('clock.every', () => ({ value: undefined }))
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('http.fetch', () => {
    throw new Error('connexion refusée')
  })

  await $.session.start({ cwd: '/autre', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual([])
})
