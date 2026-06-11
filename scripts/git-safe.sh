#!/usr/bin/env bash
# git-safe.sh — bloque les commandes Git destructrices sans confirmation explicite.
#
# Plugin Ottho Code App — hook PreToolUse matcher Bash.
# Bloque :
#   - git reset --hard
#   - git push --force / git push -f
#   - git checkout -- (qui écrase les changements non commités)
#   - git clean -f / -d
#   - git branch -D (suppression forcée)
#   - git rebase -i (interactif, dangereux en non-TTY)
#
# Exit code 2 = bloque. stderr = explication + alternative.

set -euo pipefail

payload=$(cat)

command=$(printf '%s' "$payload" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
")

if [ -z "$command" ]; then
    exit 0
fi

# git reset --hard
if echo "$command" | grep -qE '\bgit\s+reset\s+(--hard|--mixed\s+--hard)\b'; then
    echo "🛡️  git-safe : git reset --hard est destructeur." >&2
    echo "Alternative : git stash, ou git reset --soft pour préserver les changements." >&2
    echo "Si tu es certain : demande à l'utilisateur de confirmer en exécutant la commande lui-même." >&2
    exit 2
fi

# git push --force ou -f (mais pas --force-with-lease qui est plus safe)
if echo "$command" | grep -qE '\bgit\s+push\b.*\s(--force(\s|$)|-f(\s|$))' && \
   ! echo "$command" | grep -qE '\b--force-with-lease\b'; then
    echo "🛡️  git-safe : git push --force est destructeur (écrase l'historique distant)." >&2
    echo "Alternative : --force-with-lease, ou créer un nouveau commit qui annule (git revert)." >&2
    exit 2
fi

# git checkout -- (écrase les changements non commités d'un fichier)
if echo "$command" | grep -qE '\bgit\s+checkout\s+--\s+'; then
    echo "🛡️  git-safe : git checkout -- écrase les changements non commités." >&2
    echo "Alternative : git restore <file> (plus explicite), ou git stash si tu veux les garder." >&2
    exit 2
fi

# git clean -f ou -d (supprime fichiers non trackés)
if echo "$command" | grep -qE '\bgit\s+clean\s+(-[a-zA-Z]*f|-[a-zA-Z]*d)'; then
    echo "🛡️  git-safe : git clean -f/-d supprime des fichiers non trackés sans retour possible." >&2
    echo "Alternative : git clean -n d'abord (dry-run) pour voir ce qui serait supprimé." >&2
    exit 2
fi

# git branch -D (suppression forcée d'une branche)
if echo "$command" | grep -qE '\bgit\s+branch\s+-D\b'; then
    echo "🛡️  git-safe : git branch -D supprime une branche même si elle n'est pas mergée." >&2
    echo "Alternative : git branch -d (refuse si non-mergée), ou s'assurer que la branche est mergée d'abord." >&2
    exit 2
fi

# git rebase -i (interactif, casse en non-TTY)
if echo "$command" | grep -qE '\bgit\s+rebase\s+-i\b'; then
    echo "🛡️  git-safe : git rebase -i nécessite un terminal interactif et casse en automation." >&2
    echo "Alternative : rebase non-interactif (git rebase <base>), ou laisser l'utilisateur le faire à la main." >&2
    exit 2
fi

exit 0
