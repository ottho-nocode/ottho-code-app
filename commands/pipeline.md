---
description: Rouvre Ottho Builder 2, la vue du pipeline des agents, dans le navigateur
---

# /pipeline

Ottho Builder 2 est une app locale, en lecture seule : carte des agents, agent actif en direct, avancement de chaque `US-XX`, questions en attente, livrables à valider, éléments de marque. Elle ne s'ouvre jamais d'elle-même : cette commande est son seul lanceur. Une fois lancée, elle reste en vie tant qu'un onglet du navigateur (ou le panneau Équipe de Claude Code) la suit, et s'arrête 30 min après la fermeture du dernier.

## Séquence

1. Lance avec l'outil Bash, au premier plan :

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/visual-engine.mjs" --open --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

   Elle retrouve le Builder du projet, ou le démarre en processus détaché, puis ouvre le navigateur.

2. Redonne à l'utilisateur la ligne affichée :
   - `Ottho Builder 2 : http://127.0.0.1:<port>` : l'adresse de la vue, déjà ouverte dans le navigateur ;
   - `Ottho Builder 2 absent du plugin ottho-code-app : …` : le Builder est livré avec le plugin (dossier `builder/`) mais son fichier manque ; transmets le message et propose de mettre à jour ou de réinstaller le plugin ;
   - `Ottho Builder 2 démarre encore : …` : il finit de démarrer et s'ouvrira de lui-même ; si rien ne vient, lis la fin de `.claude/ottho-builder.log` ;
   - `Ottho Builder 2 n'a pas démarré : …` : lis la fin de `.claude/ottho-builder.log` et explique la cause ;
   - `Ottho Builder 2 : dossier de projet introuvable : <dossier>` : le chemin passé à `--project` n'existe pas ; vérifie-le (faute de frappe, dossier déplacé) avec l'utilisateur, puis relance avec le bon chemin.

## Règles

- Les questions des agents et les validations se font dans ce terminal : l'app les affiche sans rien écrire, sauf son panneau Config (variables enregistrées dans `.env.local`).
- La validation humaine entre les phases reste la décision de l'utilisateur : l'app montre où en est le pipeline, l'utilisateur valide ici, dans le terminal.
- Ne lance pas le Builder autrement (pas de `node …/builder/bin/cli.mjs` en tâche de fond de cette session) : la commande ci-dessus le détache proprement.
