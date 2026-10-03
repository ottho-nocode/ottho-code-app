---
description: Rouvre Ottho Builder 2, la vue du pipeline des agents, dans le navigateur
---

# /pipeline

Ottho Builder 2 est une app locale, en lecture seule : carte des agents, agent actif en direct, avancement de chaque `US-XX`, questions en attente, livrables à valider, éléments de marque. Elle s'ouvre d'elle-même au démarrage de Claude Code dans un projet Ottho (hook `SessionStart` du plugin) et s'arrête seule 30 min après la fermeture de son dernier onglet ; la session suivante la relance.

## Séquence

1. Lance avec l'outil Bash, au premier plan, la commande « pour rouvrir la vue » donnée par le hook de démarrage dans le contexte de la session :

   ```bash
   node "<dossier du plugin>/scripts/visual-engine.mjs" --open --project "<dossier du projet>"
   ```

   Si le contexte ne la donne pas (dossier qui n'était pas encore un projet Ottho au démarrage de la session), lance :

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/visual-engine.mjs" --open --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

   Elle retrouve le Builder du projet, ou le démarre en processus détaché (il survit à la session), puis ouvre le navigateur.

2. Redonne à l'utilisateur la ligne affichée :
   - `Ottho Builder 2 : http://127.0.0.1:<port>` : l'adresse de la vue, déjà ouverte dans le navigateur ;
   - `Ottho Builder 2 introuvable : …` : le Builder n'est pas installé, transmets la commande d'installation telle quelle ;
   - `Ottho Builder 2 n'a pas démarré : …` : lis la fin de `.claude/ottho-builder.log` et explique la cause.

## Règles

- Les questions des agents et les validations se font dans ce terminal : l'app les affiche sans rien écrire, sauf son panneau Config (variables enregistrées dans `.env.local`).
- La validation humaine entre les phases reste la décision de l'utilisateur : l'app montre où en est le pipeline, l'utilisateur valide ici, dans le terminal.
- Ne lance pas le Builder autrement (pas de `npx ottho-pipeline` en tâche de fond de cette session) : la commande ci-dessus le détache proprement.
