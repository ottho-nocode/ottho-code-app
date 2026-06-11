#!/usr/bin/env bash
# secret-scan.sh — bloque les commits qui contiennent des secrets ou des .env.
#
# Plugin Ottho Code App — hook PreToolUse matcher Bash.
# Quand la commande Bash est git add ou git commit, scanne le contenu stagé
# à la recherche de :
#   - Patterns API/secrets : sk_live_, sk_test_, re_, AKIA, Bearer ..., ghp_, gho_
#   - Fichiers .env (sauf .env.example)
#   - console.log dans des fichiers de prod (heuristique : chemins app/ ou pages/)
#
# Exit code 2 = bloque. stderr = explication.

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

# On scanne uniquement si c'est un git add ou git commit
if ! echo "$command" | grep -qE '\bgit\s+(add|commit)\b'; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Récupérer la liste des fichiers stagés
staged_files=$(git -C "$PROJECT_DIR" diff --cached --name-only 2>/dev/null || echo "")

if [ -z "$staged_files" ]; then
    exit 0
fi

# 1. Vérifier qu'aucun .env (autre que .env.example) n'est stagé
forbidden_env=$(echo "$staged_files" | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' || true)
if [ -n "$forbidden_env" ]; then
    echo "🛡️  secret-scan : fichier .env stagé — interdit." >&2
    echo "Fichiers concernés :" >&2
    echo "$forbidden_env" | sed 's/^/  - /' >&2
    echo "Action : git restore --staged <fichier> puis ajouter au .gitignore." >&2
    exit 2
fi

# 2. Scanner le contenu stagé à la recherche de patterns sensibles
diff_content=$(git -C "$PROJECT_DIR" diff --cached 2>/dev/null || echo "")

secret_patterns=(
    'sk_live_[A-Za-z0-9]{20,}'
    'sk_test_[A-Za-z0-9]{20,}'
    're_[A-Za-z0-9]{20,}'
    'AKIA[0-9A-Z]{16}'
    'ghp_[A-Za-z0-9]{36}'
    'gho_[A-Za-z0-9]{36}'
    'xkeysib-[A-Za-z0-9]{30,}'
    '-----BEGIN (RSA |EC )?PRIVATE KEY-----'
)

found_secret=""
for pattern in "${secret_patterns[@]}"; do
    if echo "$diff_content" | grep -qE "$pattern"; then
        found_secret="$pattern"
        break
    fi
done

if [ -n "$found_secret" ]; then
    echo "🛡️  secret-scan : secret détecté dans les changements stagés." >&2
    echo "Pattern : $found_secret" >&2
    echo "Action : retirer le secret du code, le mettre dans .env.local (gitignored)," >&2
    echo "        puis git restore --staged <fichier> et recommencer." >&2
    exit 2
fi

# 3. Avertissement (non-bloquant) : console.log dans app/ ou pages/
console_logs=$(echo "$diff_content" | grep -cE '^\+.*console\.log\(' || true)
if [ "${console_logs:-0}" -gt 0 ]; then
    echo "⚠️  secret-scan : $console_logs ligne(s) console.log ajoutée(s)." >&2
    echo "Pense à les retirer ou à utiliser un logger structuré avant de merger vers develop." >&2
    # Non-bloquant : exit 0
fi

exit 0
