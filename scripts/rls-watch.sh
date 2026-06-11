#!/usr/bin/env bash
# rls-watch.sh — monitor expérimental qui surveille les migrations Supabase
#                et alerte si une nouvelle table est créée sans RLS.
#
# Plugin Ottho Code App — monitor déclaré dans monitors/monitors.json.
# Reçoit en argument $1 = CLAUDE_PROJECT_DIR. Chaque ligne stdout devient
# une notification visible par Claude.

set -euo pipefail

PROJECT_DIR="${1:-.}"
MIGRATIONS_DIR="$PROJECT_DIR/supabase/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
    # Pas de migrations à surveiller — on attend
    sleep infinity
fi

# État initial : liste des fichiers déjà présents
mapfile -t initial_files < <(ls "$MIGRATIONS_DIR" 2>/dev/null | sort)

while true; do
    sleep 10
    mapfile -t current_files < <(ls "$MIGRATIONS_DIR" 2>/dev/null | sort)

    # Repérer les nouveaux fichiers
    for f in "${current_files[@]}"; do
        if [[ ! " ${initial_files[*]} " =~ " ${f} " ]]; then
            filepath="$MIGRATIONS_DIR/$f"
            if grep -qE 'CREATE TABLE' "$filepath" 2>/dev/null; then
                if ! grep -qE 'ENABLE ROW LEVEL SECURITY' "$filepath" 2>/dev/null; then
                    echo "⚠️  Migration $f crée une table sans 'ENABLE ROW LEVEL SECURITY'. Ajoute RLS avant de merger."
                fi
            fi
        fi
    done

    initial_files=("${current_files[@]}")
done
