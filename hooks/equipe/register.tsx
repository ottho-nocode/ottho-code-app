// Panneau « Équipe » dans Claude Code : tête de chaque agent, son déroulé et les validations
// attendues, lus dans Ottho Builder 2 (/api/state du Builder de ce projet). Même lecture seule que
// le Builder : le seul geste proposé écrit un message dans la zone de saisie, sans l'envoyer.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentStatus, PanelView, Pending } from '../../types'
import { HEADS } from './heads'
import { AGENTS, buildView, headSvg, offlineView } from './view'
import type { BuilderState } from './view'

const PANE = 'ottho-equipe'
const TITLE = 'Équipe'
// Mêmes ports que scripts/visual-engine.mjs (PORTS).
const FIRST_PORT = 4317
const LAST_PORT = 4326
const POLL_MS = 4000
// Sans Builder (projet non Ottho, Builder arrêté) : une recherche toutes les 5 mises à jour.
const PROBE_EVERY = 5

const view = atom({ plugin: 'ottho-code-app', key: 'equipe' } as const, null)

let builderUrl: string | null = null
let hasOpened = false
let tick = 0

const STATUS_MARK: Record<AgentStatus, string> = {
  running: '◉',
  silent: '⚠',
  done: '✓',
  interrupted: '⚠',
  idle: '·',
}

const STATUS_COLOR: Record<AgentStatus, string | undefined> = {
  running: '#4ade80',
  silent: '#f87171',
  done: undefined,
  interrupted: '#fbbf24',
  idle: undefined,
}

const TONE_COLOR: Record<Pending['tone'], string> = {
  answer: '#facc15',
  validate: '#fb923c',
  launch: '#60a5fa',
  info: '#4ade80',
  warn: '#f87171',
}

const STAGE_COLOR: Record<string, string | undefined> = {
  done: '#4ade80',
  running: '#facc15',
  ko: '#f87171',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'equipe',
      description: "Affiche l'équipe d'agents : têtes, déroulé et validations attendues",
    })

    const cwd = await $.session.cwd()
    const project = cwd.split('/').pop() ?? cwd

    // Builder de ce projet : premier port qui répond pour lui. L'appel avec ?project= le garde
    // en vie (il s'arrête seul quand plus personne ne le regarde), comme un onglet ouvert.
    const findBuilder = async (): Promise<string | null> => {
      for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
        const url = `http://127.0.0.1:${port}`
        try {
          const res = await $.http.fetch(`${url}/api/health?project=${encodeURIComponent(cwd)}`)
          if (!res.ok) continue
          const health = JSON.parse(res.text) as { app?: string; project?: string }
          if (health.app === 'ottho-pipeline' && health.project === cwd) return url
        } catch {
          // Port fermé : au suivant.
        }
      }
      return null
    }

    const refresh = async () => {
      const now = Date.now()
      if (!builderUrl) {
        if (tick++ % PROBE_EVERY !== 0) return
        builderUrl = await findBuilder()
      } else {
        // Signe de vie pour le Builder, comme la recherche ci-dessus.
        await $.http.fetch(`${builderUrl}/api/health?project=${encodeURIComponent(cwd)}`).catch(() => null)
      }

      let fresh: PanelView
      if (!builderUrl) {
        fresh = offlineView(project, now)
      } else {
        try {
          const res = await $.http.fetch(`${builderUrl}/api/state`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          fresh = buildView(JSON.parse(res.text) as BuilderState, now, builderUrl)
        } catch {
          builderUrl = null
          tick = 1
          fresh = offlineView(project, now)
        }
      }
      await update($, view, () => fresh)

      // Ouvert de lui-même une seule fois, et seulement là où un Builder suit le projet.
      if (fresh.isOnline && !hasOpened) {
        hasOpened = true
        void $.ui.open({ id: PANE, title: TITLE })
      }
    }

    await refresh()
    $.clock.every(POLL_MS, () => {
      void refresh()
    })

    return next(e)
  })

  on('command.run', { command: 'equipe' }, async $ => {
    hasOpened = true
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: "Panneau de l'équipe d'agents ouvert." }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Text, Button } = $.ui.resolve(e)

    const head = (name: string, accent: string, status: AgentStatus, size: number) => {
      if (e.surface === 'terminal') {
        const { Image } = $.ui.resolve(e)
        const base64 = HEADS[name]
        if (!base64) return <Text color={accent}>■</Text>
        const columns = size >= 40 ? 5 : 3
        return <Image source={{ png: base64 }} columns={columns} rows={Math.ceil(columns / 2)} alt={name.slice(0, 2)} />
      }
      const { Svg } = $.ui.resolve(e)
      return <Svg source={headSvg(HEADS[name], accent, status, size)} alt={name} width={size} height={size} />
    }

    if (!v) return <Text dimColor>Chargement de l'équipe…</Text>

    if (!v.isOnline) {
      return (
        <Box flexDirection="column" gap={1} paddingX={1}>
          <Text bold>Équipe d'agents</Text>
          <Text dimColor wrap="wrap">
            Ottho Builder ne répond pas pour ce projet. Il se lance avec Claude Code dans un projet Ottho ; /pipeline le
            démarre. Le panneau se met à jour dès qu'il est là.
          </Text>
        </Box>
      )
    }

    const accentOf = (name: string) => AGENTS.find(a => a.name === name)?.accent ?? '#a1a1aa'
    const statusOf = (name: string) => v.agents.find(a => a.name === name)?.status ?? 'idle'

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Équipe d'agents</Text>
          <Text dimColor wrap="truncate-end">
            {v.project}
            {v.focus ? ` · ${v.focus}${v.title ? ` ${v.title}` : ''}` : ''}
          </Text>
        </Box>

        {v.stages.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            {v.stages.map(stage => (
              <Text color={STAGE_COLOR[stage.status]} dimColor={stage.status === 'todo'}>
                {stage.mark} {stage.label}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column" gap={1}>
          <Text bold>À toi de jouer</Text>
          {v.pending.length === 0 && <Text dimColor>Rien n'attend ta réponse ni ta validation.</Text>}
          {v.pending.map((item, index) => (
            <Box flexDirection="row" gap={1} borderStyle="round" borderColor={TONE_COLOR[item.tone]} paddingX={1}>
              {item.agent ? head(item.agent, accentOf(item.agent), statusOf(item.agent), 32) : null}
              <Box flexDirection="column" flexShrink={1} gap={1}>
                <Text wrap="wrap">{item.text}</Text>
                {item.prompt !== null && (
                  <Button
                    key={`pending-${index}`}
                    label="Préparer le message"
                    variant="primary"
                    onPress={() => {
                      if (item.prompt !== null) void $.prompt.fill({ text: item.prompt })
                    }}
                  />
                )}
              </Box>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" gap={1}>
          <Text bold>L'équipe</Text>
          {v.agents.map(agent => {
            const isActive = agent.status === 'running' || agent.status === 'silent'
            return (
              <Box flexDirection="row" gap={1}>
                {head(agent.name, agent.accent, agent.status, 40)}
                <Box flexDirection="column" flexShrink={1}>
                  <Box flexDirection="row" columnGap={1}>
                    <Text bold dimColor={agent.status === 'idle'}>
                      {agent.name}
                    </Text>
                    <Text dimColor>{agent.role}</Text>
                  </Box>
                  {agent.status !== 'idle' && (
                    <Text color={STATUS_COLOR[agent.status]} wrap="truncate-end">
                      {STATUS_MARK[agent.status]} {agent.statusLabel}
                      {agent.passes > 1 ? ` · ${agent.passes} passages` : ''}
                    </Text>
                  )}
                  {isActive
                    ? agent.trail.map(step => (
                        <Text dimColor wrap="truncate-end">
                          {'  '}› {step}
                        </Text>
                      ))
                    : agent.current && (
                        <Text dimColor wrap="truncate-end">
                          dernière action : {agent.current}
                        </Text>
                      )}
                </Box>
              </Box>
            )
          })}
        </Box>

        {v.builderUrl && (
          <Text dimColor wrap="truncate-end">
            Vue complète : {v.builderUrl}
          </Text>
        )}
      </Box>
    )
  })
}
