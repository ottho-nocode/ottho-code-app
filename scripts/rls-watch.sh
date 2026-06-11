#!/usr/bin/env bash
# rls-watch.sh — monitor expérimental qui surveille les migrations Supabase
#                et alerte si une nouvelle table est créée sans RLS.
#
# Plugin Ottho Code App — monitor déclaré dans monitors/monitors.json.
# Reçoit en argument $1 = CLAUDE_PROJECT_DIR. Chaque ligne stdout devient
# une notification visible par Claude.
#
# Portabilité : bash 3.2 (macOS) — pas de mapfile, pas de 'sleep infinity'.

set -euo pipefail

PROJECT_DIR="${1:-.}"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

# Pas de dossier migrations : on attend qu'il apparaisse (projet sans Supabase = veille passive)
while [ ! -d "$MIGRATIONS_DIR" ]; do
    sleep 300
done

known="$(ls "$MIGRATIONS_DIR" 2>/dev/null | sort || true)"

while true; do
    sleep 10
    current="$(ls "$MIGRATIONS_DIR" 2>/dev/null | sort || true)"

    # Nouveaux fichiers = présents dans current, absents de known
    new_files="$(comm -13 <(printf '%s\n' "$known") <(printf '%s\n' "$current") 2>/dev/null || true)"

    for f in $new_files; do
        filepath="$MIGRATIONS_DIR/$f"
        if grep -qE 'CREATE TABLE' "$filepath" 2>/dev/null; then
            if ! grep -qE 'ENABLE ROW LEVEL SECURITY' "$filepath" 2>/dev/null; then
                echo "Migration $f crée une table sans 'ENABLE ROW LEVEL SECURITY'. Ajoute RLS avant de merger."
            fi
        fi
    done

    known="$current"
done
