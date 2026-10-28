// Panneau « Agents Ottho » dans Claude Code : le pipeline vu depuis le journal du plugin
// (.claude/pipeline-events.jsonl, écrit par scripts/pipeline-event.mjs), sans Ottho Builder 2.
// Commande /ottho-agents, ouverture seule dans un projet Ottho quand le terminal est assez large,
// et notifications quand un agent démarre, finit, ou quand Claude attend ta réponse.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, AgentsSnapshot } from '../../types'
import { PIPELINE, buildSnapshot, parseEvents, since, toastFor } from './model'

const PANE = 'ottho-agents'
const TITLE = 'Agents Ottho'
const LOG = '.claude/pipeline-events.jsonl'
// Projet Ottho : mêmes marqueurs que scripts/visual-engine.mjs (le journal n'en est pas un :
// le plugin l'écrit dans tout projet).
const MARKERS = ['docs/brief.md', 'docs/PRD.md', 'design/charte.md']
const SPEC_RE = /^US-\d+.*\.md$/

const snapshot = atom({ plugin: 'ottho-code-app', key: 'agents' } as const, null)
const clock = atom({ plugin: 'ottho-code-app', key: 'agentsNow' } as const, 0)

// Repère du dernier état lu : taille et date du journal, nombre d'événements déjà vus.
let seen = { size: -1, mtimeMs: -1, count: -1 }
let pending = false

async function refresh($: EngineInterface) {
  if (pending) return
  pending = true
  try {
    const stat = await $.fs.stat(LOG).catch(() => null)
    if (!stat || stat.kind !== 'file') return
    if (stat.size === seen.size && stat.mtimeMs === seen.mtimeMs) return
    const events = parseEvents(await $.fs.read(LOG))
    const now = await $.clock.now()
    // Premier passage : pas de notification pour l'historique.
    if (seen.count >= 0 && events.length > seen.count) {
      for (const e of events.slice(seen.count)) {
        const text = toastFor(e)
        if (text) $.ui.toast(text, { timeoutMs: 6000 })
      }
    }
    seen = { size: stat.size, mtimeMs: stat.mtimeMs, count: events.length }
    const next: AgentsSnapshot = buildSnapshot(events, now)
    await update($, snapshot, () => next)
    await update($, clock, () => now)
  } finally {
    pending = false
  }
}

async function isOtthoProject($: EngineInterface) {
  for (const marker of MARKERS) if (await $.fs.exists(marker)) return true
  const specs = await $.fs.list('specs').catch(() => [])
  return specs.some(entry => entry.kind === 'file' && SPEC_RE.test(entry.name))
}

// Relecture peu après un événement (le plugin écrit le journal autour de l'appel).
function soon($: EngineInterface, ms = 400) {
  $.clock.after(ms, () => void refresh($).catch(() => {}))
}

export const register: Register = on => {
  // Session avec un écran seulement (pas de panneau ni de notification sous claude -p).
  on('session.start', { isInteractive: true }, async ($, e, next) => {
    await $.command.register({
      name: 'ottho-agents',
      description: 'Affiche les agents du pipeline Ottho dans un panneau',
    })
    await refresh($).catch(() => {})
    // Filet : le journal peut aussi changer depuis une autre session.
    $.clock.every(3000, () => void refresh($).catch(() => {}))
    // Horloge des durées affichées (« depuis 3 min »).
    $.clock.every(15_000, () => {
      void $.clock
        .now()
        .then(now => update($, clock, () => now))
        .catch(() => {})
    })
    if (await isOtthoProject($)) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'ottho-agents' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Panneau des agents Ottho ouvert.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    soon($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    // Activité d'un sous-agent, fin d'un agent, question posée : le journal a bougé.
    if (e.agentId || e.tool === 'Agent' || String(e.tool) === 'Task' || e.tool === 'AskUserQuestion') soon($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    soon($, 600)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const now = await read($, clock)

    if (!snap) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Aucun journal du pipeline dans ce projet.</Text>
          <Text dimColor>Les agents apparaissent ici dès qu'ils travaillent.</Text>
        </Box>
      )
    }

    const line = (run: AgentRun | undefined) => {
      if (!run) return { mark: '·', color: undefined, text: 'au repos', dim: true }
      const us = run.us ? `${run.us} · ` : ''
      if (run.status === 'running')
        return { mark: '◉', color: 'cyan', text: `${us}${since(now - run.startedAt)}${run.activity ? ` · ${run.activity}` : ''}`, dim: false }
      if (run.status === 'interrupted')
        return { mark: '!', color: 'yellow', text: `${us}interrompu, sans nouvelles depuis ${since(now - run.lastSeen)}`, dim: false }
      const verdict = run.verdict ? ` · ${run.verdict}` : ''
      return { mark: '✓', color: 'green', text: `${us}il y a ${since(now - (run.endedAt ?? run.startedAt))}${verdict}`, dim: true }
    }

    const waiting = snap.waiting
    return (
      <Box flexDirection="column">
        <Text bold>Pipeline{snap.us ? ` · ${snap.us}` : ''}</Text>
        {PIPELINE.map((agent, i) => {
          const view = line(snap.latest[agent])
          return (
            <Box key={agent} flexDirection="row">
              <Text color={view.color} dimColor={view.dim && !view.color}>{view.mark} </Text>
              <Text bold={view.mark === '◉'}>{`${i + 1} ${agent}`.padEnd(16)}</Text>
              <Text dimColor={view.dim} wrap="truncate-end">{view.text}</Text>
            </Box>
          )
        })}
        {waiting && (
          <Text color="yellow">
            {waiting.kind === 'ask'
              ? `? Claude attend ta réponse${waiting.count ? ` (${waiting.count} question${waiting.count > 1 ? 's' : ''})` : ''} dans le terminal`
              : '! Claude attend ton autorisation dans le terminal'}
          </Text>
        )}
        {snap.next && (
          <Text wrap="wrap">
            <Text dimColor>Prochaine étape : </Text>
            {snap.next}
          </Text>
        )}
      </Box>
    )
  })
}
