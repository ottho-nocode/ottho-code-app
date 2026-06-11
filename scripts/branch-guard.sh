#!/usr/bin/env bash
# branch-guard.sh — bloque les commit/push directs sur main et develop.
#
# Plugin Ottho Code App — hook PreToolUse matcher Bash.
# Lit le payload JSON depuis stdin, extrait la commande, bloque si :
#   - git commit ... (sur main ou develop)
#   - git push ... main (ou origin main, etc.)
#   - git push ... develop
#
# Exit code 2 = bloque la commande. stderr = message à l'utilisateur.

set -euo pipefail

payload=$(cat)

# Extraire la commande Bash depuis le payload JSON
command=$(printf '%s' "$payload" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
")

# Si pas de commande, laisser passer
if [ -z "$command" ]; then
    exit 0
fi

# Détecter la branche courante
current_branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null || echo "")

# Bloc 1 : git commit sur main ou develop
if echo "$command" | grep -qE '\bgit\s+commit\b'; then
    if [ "$current_branch" = "main" ] || [ "$current_branch" = "develop" ]; then
        echo "🛡️  branch-guard : commit direct interdit sur \"$current_branch\"." >&2
        echo "Méthode Ottho : créer une branche feature/US-XX-slug, fix/*, refactor/*, ou chore/*." >&2
        echo "Exemple : git checkout -b feature/US-01-login" >&2
        exit 2
    fi
fi

# Bloc 2 : git push vers main ou develop directement (depuis une branche autre, ou avec un refspec ciblant main/develop)
if echo "$command" | grep -qE '\bgit\s+push\b.*\b(main|develop)\b'; then
    # Tolérer "git push origin feature/main-page" : on regarde si "main" ou "develop" est un refspec
    if echo "$command" | grep -qE '\bgit\s+push\b\s+\S+\s+(main|develop)(\s|$)' || \
       echo "$command" | grep -qE '\bgit\s+push\b\s+(main|develop)(\s|$)'; then
        echo "🛡️  branch-guard : push direct vers main/develop interdit." >&2
        echo "Méthode Ottho : push sur ta branche feature/* puis ouvrir une PR vers develop." >&2
        exit 2
    fi
fi

exit 0
