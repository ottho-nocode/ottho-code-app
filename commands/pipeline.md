---
description: Ouvre le pipeline visuel des agents (carte, agent actif, avancement des features, questions) dans le navigateur
---

# /pipeline

Ouvre l'app locale `ottho-pipeline` sur ce projet. Elle affiche les agents du plugin et du projet, l'agent en cours, l'avancement de chaque `US-XX` et les questions posées par les agents. Elle ne lance rien ; sa seule écriture est la réponse de l'utilisateur à une question, enregistrée dans le livrable concerné.

## Séquence

1. Lance cette commande avec l'outil Bash **en tâche de fond** (`run_in_background: true`) :

   ```bash
   npx -y ottho-pipeline@1.0.0 --project "${CLAUDE_PROJECT_DIR:-$PWD}"
   ```

2. Dans la sortie, la ligne `ottho-pipeline prêt : http://127.0.0.1:<port>` (ou `déjà ouvert : …`) donne l'adresse : transmets-la à l'utilisateur.
3. Si la sortie contient une erreur (Node absent, aucun port libre), affiche-la telle quelle et arrête-toi.

## Règles

- Ne relance pas l'app si elle tourne déjà dans cette session : redonne l'adresse.
- L'app ne pilote rien. Pour avancer, l'utilisateur copie le prompt du bandeau « Prochaine étape » et le colle ici. La validation humaine entre les phases reste la règle.
