#!/usr/bin/env bash
# branch-guard.sh — bloque les commit/push directs sur main et develop.
#
# Plugin Ottho Code App — hook PreToolUse matcher Bash.
# Lit le payload JSON depuis stdin, extrait la commande, bloque si :
#   - git commit ... alors que la branche du repo CIBLE est main ou develop
#   - git push ... avec un refspec main ou develop
#
# Le repo cible est résolu depuis la commande elle-même (`cd X && git ...`,
# `git -C X ...`), pas seulement depuis CLAUDE_PROJECT_DIR — sinon le hook
# bloque à tort des commits faits dans un AUTRE repo que le projet courant
# (ex. un clone dans /tmp) dès que le projet est sur main/develop.
# La garde ne s'applique qu'aux commandes git visant le repo du projet.
#
# Portabilité : bash 3.2 (macOS) — toute la logique vit dans python3,
# qui est déjà requis par ce script pour parser le JSON.
#
# Exit code 2 = bloque la commande. stderr = message à l'utilisateur.

set -uo pipefail

BRANCH_GUARD_PAYLOAD=$(cat) python3 - <<'PYEOF'
import json, os, re, shlex, subprocess, sys

payload = os.environ.get("BRANCH_GUARD_PAYLOAD", "")
try:
    data = json.loads(payload)
    cmd = data.get("tool_input", {}).get("command", "")
except Exception:
    cmd = ""

if not cmd.strip():
    sys.exit(0)

PROTECTED = {"main", "develop"}
SEPARATORS = {"&&", "||", ";", "|", "&"}

project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
project_real = os.path.realpath(project_dir)


def expand(path, base):
    p = os.path.expanduser(path)
    if not os.path.isabs(p):
        p = os.path.join(base, p)
    return os.path.normpath(p)


def in_project(d):
    real = os.path.realpath(d)
    return real == project_real or real.startswith(project_real + os.sep)


def current_branch(d):
    try:
        r = subprocess.run(
            ["git", "-C", d, "branch", "--show-current"],
            capture_output=True, text=True, timeout=5,
        )
        return r.stdout.strip()
    except Exception:
        return ""


try:
    tokens = shlex.split(cmd, posix=True)
except ValueError:
    tokens = cmd.split()

# Parcours best-effort (pas un vrai parseur shell) : suit les `cd` pour
# connaître le répertoire de chaque commande git, gère `git -C <dir>`.
cwd = project_dir
commits = []  # répertoires cibles des `git commit`
pushes = []   # (répertoire, arguments) des `git push`
i, n = 0, len(tokens)
while i < n:
    t = tokens[i]
    if t == "cd" and i + 1 < n and tokens[i + 1] not in SEPARATORS:
        cwd = expand(tokens[i + 1], cwd)
        i += 2
        continue
    if t == "git":
        gdir = cwd
        j = i + 1
        while j < n and tokens[j] not in SEPARATORS:
            tok = tokens[j]
            if tok == "-C" and j + 1 < n:
                gdir = expand(tokens[j + 1], cwd)
                j += 2
                continue
            if tok.startswith("-"):
                j += 1
                continue
            break
        if j < n and tokens[j] not in SEPARATORS:
            sub = tokens[j]
            args = []
            k = j + 1
            while k < n and tokens[k] not in SEPARATORS:
                args.append(tokens[k])
                k += 1
            if sub == "commit":
                commits.append(gdir)
            elif sub == "push":
                pushes.append((gdir, args))
            i = k
            continue
        i = j
        continue
    i += 1

# Bloc 1 : git commit sur main/develop — repo du projet courant uniquement.
for d in commits:
    if not in_project(d):
        continue
    branch = current_branch(d)
    if branch in PROTECTED:
        sys.stderr.write('🛡️  branch-guard : commit direct interdit sur "%s".\n' % branch)
        sys.stderr.write("Méthode Ottho : créer une branche feature/US-XX-slug, fix/*, refactor/*, ou chore/*.\n")
        sys.stderr.write("Exemple : git checkout -b feature/US-01-login\n")
        sys.exit(2)

# Bloc 2 : git push avec refspec main/develop — repo du projet courant uniquement.
# Détection volontairement identique aux regex historiques du hook (mêmes limites),
# appliquée par occurrence de `git push` pour ignorer le texte des messages de commit.
PUSH_RE_1 = re.compile(r"\bgit\s+push\b\s+\S+\s+(main|develop)(\s|$)")
PUSH_RE_2 = re.compile(r"\bgit\s+push\b\s+(main|develop)(\s|$)")
for d, args in pushes:
    if not in_project(d):
        continue
    push_cmd = "git push " + " ".join(args)
    if PUSH_RE_1.search(push_cmd) or PUSH_RE_2.search(push_cmd):
        sys.stderr.write("🛡️  branch-guard : push direct vers main/develop interdit.\n")
        sys.stderr.write("Méthode Ottho : push sur ta branche feature/* puis ouvrir une PR vers develop.\n")
        sys.exit(2)

sys.exit(0)
PYEOF
exit $?
