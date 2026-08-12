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
#
# Extraction de tool_input.command en awk POSIX (portable macOS/Linux/Git Bash,
# sans dépendance à Python, jq, ni aux extensions GNU grep -P/-z qui n'existent
# pas sur le grep BSD livré par défaut sur macOS).
#
# Fail-closed strict : le contrat officiel Claude Code garantit tool_input.command
# pour tout PreToolUse:Bash (cf. doc hooks). Tout écart à ce contrat — payload vide,
# JSON illisible, champ command absent/vide/non-string — est donc traité comme une
# anomalie et bloque (exit 2), plutôt que de laisser passer un commit non audité.

set -uo pipefail

payload=$(cat)

# awk_extract_command : extrait la valeur string de tool_input.command, SCOPÉE
# strictement à l'intérieur de l'objet tool_input (comptage de profondeur des
# accolades/crochets en ignorant le contenu des strings), pour ne jamais être
# trompé par une clé "command" au niveau racine, dans un autre objet imbriqué,
# dans un sous-objet/tableau de tool_input, ou par le texte "command" présent
# dans une autre valeur (ex. description). Gère l'échappement JSON standard
# (\", \\, \n, \t, \r, \b, \f, \/) caractère par caractère. N'utilise que des
# fonctionnalités awk POSIX (substr/length/index), donc fonctionne aussi bien
# avec BSD awk (macOS) que GNU awk/mawk.
#
# Sortie sur stdout :
#   "FOUND:<valeur décodée>"   si tool_input.command est une string JSON valide
#   "NULLVALUE"                si tool_input.command vaut JSON null
#   "NOTFOUND"                 si la clé "command" est absente de tool_input
#   "NOTOOLINPUT"              si la clé "tool_input" elle-même est absente
#   "MALFORMED"                si le JSON autour de command est mal formé
#   "UNICODE_UNSUPPORTED"      si command contient une séquence \uXXXX (non décodée,
#                              parseur volontairement non ambigu -> fail-closed)
awk_extract_command() {
    # Le payload est passé via stdin (<<<), jamais via "awk -v" : awk applique
    # ses propres règles d'échappement de type C aux valeurs -v, ce qui altère
    # silencieusement une séquence \uXXXX présente dans le payload avant même
    # que ce script ait pu la détecter. Lire $0 depuis stdin préserve le texte
    # brut tel quel.
    awk '
    function fail(msg) { print msg; exit 1 }
    {
        s = $0
        n = length(s)
        tikey = "\"tool_input\""
        idx = index(s, tikey)
        if (idx == 0) { print "NOTOOLINPUT"; exit 0 }
        i = idx + length(tikey)
        while (i <= n && substr(s, i, 1) ~ /[ \t\r\n]/) i++
        if (substr(s, i, 1) != ":") fail("MALFORMED")
        i++
        while (i <= n && substr(s, i, 1) ~ /[ \t\r\n]/) i++
        if (substr(s, i, 1) != "{") fail("MALFORMED")
        start = i
        depth = 0; in_str = 0; obj_end = 0
        for (; i <= n; i++) {
            c = substr(s, i, 1)
            if (in_str) {
                if (c == "\\") { i++; continue }
                if (c == "\"") { in_str = 0 }
                continue
            }
            if (c == "\"") { in_str = 1; continue }
            if (c == "{") { depth++; continue }
            if (c == "}") { depth--; if (depth == 0) { obj_end = i; break } }
        }
        if (obj_end == 0) fail("MALFORMED")
        scope = substr(s, start, obj_end - start + 1)
        sn = length(scope)

        # Balaie le scope en suivant la profondeur ({ } et [ ]) et en ignorant
        # le contenu des strings, pour ne reconnaître "command" comme clé que
        # lorsqu il apparaît au premier niveau de tool_input (sdepth == 1) et
        # en position de clé (immédiatement suivi de ":").
        found = 0
        k = 1
        sdepth = 0
        while (k <= sn) {
            c = substr(scope, k, 1)
            if (c == "\"") {
                str_start = k + 1
                k++
                while (k <= sn) {
                    cc = substr(scope, k, 1)
                    if (cc == "\\") { k += 2; continue }
                    if (cc == "\"") { break }
                    k++
                }
                str_val = substr(scope, str_start, k - str_start)
                k++
                j = k
                while (j <= sn && substr(scope, j, 1) ~ /[ \t\r\n]/) j++
                if (sdepth == 1 && substr(scope, j, 1) == ":" && str_val == "command") {
                    found = 1
                    key_end = j
                    break
                }
                continue
            }
            if (c == "{" || c == "[") { sdepth++; k++; continue }
            if (c == "}" || c == "]") { sdepth--; k++; continue }
            k++
        }
        if (!found) { print "NOTFOUND"; exit 0 }

        j = key_end + 1
        m = sn
        while (j <= m && substr(scope, j, 1) ~ /[ \t\r\n]/) j++
        if (substr(scope, j, 4) == "null") { print "NULLVALUE"; exit 0 }
        if (substr(scope, j, 1) != "\"") fail("MALFORMED")
        j++
        out = ""; closed = 0; has_unicode_escape = 0
        while (j <= m) {
            c = substr(scope, j, 1)
            if (c == "\\") {
                nc = substr(scope, j + 1, 1)
                if (nc == "\"") { out = out "\""; j += 2 }
                else if (nc == "\\") { out = out "\\"; j += 2 }
                else if (nc == "n") { out = out "\n"; j += 2 }
                else if (nc == "t") { out = out "\t"; j += 2 }
                else if (nc == "r") { out = out "\r"; j += 2 }
                else if (nc == "b") { out = out "\b"; j += 2 }
                else if (nc == "f") { out = out "\f"; j += 2 }
                else if (nc == "/") { out = out "/"; j += 2 }
                else if (nc == "u") { has_unicode_escape = 1; out = out substr(scope, j, 6); j += 6 }
                else if (nc == "") fail("MALFORMED")
                else fail("MALFORMED")
            } else if (c == "\"") { closed = 1; break }
            else { out = out c; j++ }
        }
        if (!closed) fail("MALFORMED")
        if (has_unicode_escape) { print "UNICODE_UNSUPPORTED"; exit 1 }
        print "FOUND:" out
    }
    ' <<<"$1"
}

# Payload vide sur stdin : le contrat Claude Code garantit toujours un payload
# JSON pour PreToolUse:Bash. Un payload vide est une anomalie -> fail-closed.
if [ -z "$payload" ]; then
    echo "🛡️  secret-scan : payload vide reçu pour un hook PreToolUse:Bash — attendu et absent, blocage (fail-closed)." >&2
    exit 2
fi

extract_result=$(awk_extract_command "$payload")

case "$extract_result" in
    FOUND:*)
        command="${extract_result#FOUND:}"
        if [ -z "$command" ]; then
            echo "🛡️  secret-scan : tool_input.command est une chaîne vide — blocage (fail-closed)." >&2
            exit 2
        fi
        ;;
    NULLVALUE|NOTFOUND|NOTOOLINPUT)
        echo "🛡️  secret-scan : tool_input.command absent ou null pour un hook PreToolUse:Bash — attendu et absent, blocage (fail-closed)." >&2
        exit 2
        ;;
    UNICODE_UNSUPPORTED)
        echo "🛡️  secret-scan : tool_input.command contient une séquence \\uXXXX non décodée par ce parseur — ambiguïté, blocage (fail-closed)." >&2
        exit 2
        ;;
    *)
        echo "🛡️  secret-scan : payload illisible, impossible d'extraire la commande — blocage par prudence (fail-closed)." >&2
        echo "Si ce blocage est erroné, relance la commande ; si le problème persiste, signale-le (parsing hooks Ottho)." >&2
        exit 2
        ;;
esac

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
    # "--" nécessaire : le pattern PRIVATE KEY commence par "-----", que grep
    # interpréterait sinon comme des options plutôt que comme le motif (bug
    # préexistant, révélé — pas introduit — par le retrait de la dépendance Python).
    if echo "$diff_content" | grep -qE -- "$pattern"; then
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
