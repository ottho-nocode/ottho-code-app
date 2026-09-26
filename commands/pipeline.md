---
description: Rouvre le pipeline visuel des agents dans le navigateur, ou explique comment le lancer
---

# /pipeline

Le pipeline (`ottho-pipeline`) est une app locale : carte des agents, agent actif en direct, avancement de chaque `US-XX`, questions, validations, éléments de marque, et un terminal Claude Code intégré. Comme Claude Code peut tourner **dans** le pipeline, le pipeline ne doit dépendre d'aucune session Claude Code : il se lance dans un terminal ordinaire et y reste (Ctrl+C pour l'arrêter).

## Séquence

1. Cherche une instance déjà ouverte pour ce projet, avec l'outil Bash (au premier plan) :

   ```bash
   npx -y ottho-pipeline@1.0.0 --reopen --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

2. Si la sortie contient `ottho-pipeline déjà ouvert : http://127.0.0.1:<port>`, le navigateur s'est ouvert : redonne l'adresse à l'utilisateur.
3. Sinon, **ne lance pas l'app toi-même** (une tâche de fond de cette session s'arrêterait avec elle). Explique à l'utilisateur d'ouvrir un terminal ordinaire (Terminal sur macOS, PowerShell sur Windows) et d'y taper :

   ```bash
   cd "<dossier du projet>" && npx ottho-pipeline
   ```

   Le pipeline s'ouvre dans le navigateur ; le bouton « Terminal » y lance Claude Code dans le projet. Pour l'arrêter : Ctrl+C dans ce terminal.

## Règles

- Ne lance jamais le pipeline en tâche de fond depuis Claude Code.
- La validation humaine entre les phases reste la règle : le pipeline aide à répondre, valider et envoyer le prompt suivant, l'utilisateur décide.
