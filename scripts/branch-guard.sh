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
#
# Extraction de tool_input.command en awk POSIX (portable macOS/Linux/Git Bash,
# sans dépendance à Python, jq, ni aux extensions GNU grep -P/-z qui n'existent
# pas sur le grep BSD livré par défaut sur macOS).
#
# Fail-closed strict : le contrat officiel Claude Code garantit tool_input.command
# pour tout PreToolUse:Bash (cf. doc hooks). Tout écart à ce contrat — payload vide,
# JSON illisible, champ command absent/vide/non-string — est donc traité comme une
# anomalie et bloque (exit 2), plutôt que de laisser passer une commande non auditée.

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
    echo "🛡️  branch-guard : payload vide reçu pour un hook PreToolUse:Bash — attendu et absent, blocage (fail-closed)." >&2
    exit 2
fi

extract_result=$(awk_extract_command "$payload")

case "$extract_result" in
    FOUND:*)
        command="${extract_result#FOUND:}"
        if [ -z "$command" ]; then
            echo "🛡️  branch-guard : tool_input.command est une chaîne vide — blocage (fail-closed)." >&2
            exit 2
        fi
        ;;
    NULLVALUE|NOTFOUND|NOTOOLINPUT)
        echo "🛡️  branch-guard : tool_input.command absent ou null pour un hook PreToolUse:Bash — attendu et absent, blocage (fail-closed)." >&2
        exit 2
        ;;
    UNICODE_UNSUPPORTED)
        echo "🛡️  branch-guard : tool_input.command contient une séquence \\uXXXX non décodée par ce parseur — ambiguïté, blocage (fail-closed)." >&2
        exit 2
        ;;
    *)
        echo "🛡️  branch-guard : payload illisible, impossible d'extraire la commande — blocage par prudence (fail-closed)." >&2
        echo "Si ce blocage est erroné, relance la commande ; si le problème persiste, signale-le (parsing hooks Ottho)." >&2
        exit 2
        ;;
esac

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
