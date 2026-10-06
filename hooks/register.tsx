// Point d'entrée des panneaux du plugin dans Claude Code (un seul module de hooks par plugin) :
// « Équipe », lu dans Ottho Builder 2, et « Agents Ottho », lu dans le journal du pipeline.
import type { Register } from 'claude-code'

import { register as agents } from './agents-pane/register'
import { register as equipe } from './equipe/register'

export const register: Register = (on, options) => {
  equipe(on, options)
  agents(on, options)
}
