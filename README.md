# Ottho Code App — Plugin Claude Code

> Méthode complète d'agence pour livrer des applications web modernes avec Claude Code. SDD à 2 niveaux, 9 agents spécialisés, 9 MCP préconfigurés, hooks de sécurité Git.

---

## Pour qui

Agences et freelances qui construisent des apps web (Next.js + Supabase + Brevo/Resend + Stripe) et veulent industrialiser leur méthode de travail avec Claude Code.

## Ce que vous obtenez en une commande

- **9 agents spécialisés** qui couvrent le cycle de vie d'une feature : Brainstorming, Spec-Writer, Designer, Architect, Developer, Code-Reviewer, Tester, DevOps, Doc-Writer.
- **3 skills** qui orchestrent : `agency-method` (référence), `project-bootstrap` (démarrage projet), `sdd-feature-cycle` (cycle feature).
- **4 slash commands** : `/init-agency-project`, `/new-feature`, `/validate-feature`, `/ship-feature`.
- **9 MCP préconfigurés** : GitHub, Vercel, Supabase, Stripe, Brevo, Resend, Notion, Figma, Context7. (Pencil : fourni par l'app desktop [pencil.dev](https://pencil.dev), pas par le plugin.)
- **3 hooks de sécurité Git** : branch-guard (anti-commit direct main/develop), git-safe (anti-reset --hard / push --force), secret-scan (anti-fuite de clés API).
- **5 templates** : CLAUDE.md, PRD, fiche feature SDD, plan technique, .gitignore.

---

## Installation

### Via marketplace (recommandé une fois publié)

```bash
claude plugin marketplace add ottho-nocode/ottho-code-app
claude plugin install ottho-code-app@ottho-code-app
```

### Via URL directe (dev/test)

```bash
claude --plugin-url https://github.com/ottho-nocode/ottho-code-app
```

### Via dossier local (développement du plugin)

```bash
claude --plugin-dir ./ottho-code-app
```

À l'activation, Claude Code demande 3 credentials **optionnels** (GitHub PAT, Brevo, Resend), stockés dans le keychain système, jamais en clair dans `settings.json`.

**Après l'installation, les MCP ne sont pas tous actifs tout de suite :**

1. `context7` est connecté d'office (aucune clé).
2. `vercel`, `supabase`, `stripe`, `notion`, `figma` attendent une authentification **OAuth** : tape `/mcp` dans Claude Code, sélectionne le serveur, le navigateur s'ouvre, tu autorises. À faire une fois par serveur.
3. `github`, `brevo`, `resend` attendent leur **clé** : renseigne-la à l'activation du plugin, ou plus tard via `/plugin` (configure). Tant que la clé manque, le serveur apparaît "Failed to connect" dans `/mcp` : c'est normal, pas un bug.

---

## Première utilisation

### Démarrer un nouveau projet

```
/init-agency-project
```

Orchestrera : `brainstorming` → `spec-writer` (PRD) → `architect` (stack + CLAUDE.md) → `devops` (CI/CD, Vercel, Supabase).

Validation humaine obligatoire entre chaque agent.

### Démarrer une feature

```
/new-feature "Page de connexion utilisateur"
```

Créera la branche `feature/US-XX-page-de-connexion`, puis enchaînera `spec-writer` → `designer` (si UI) → `architect` (plan technique).

### Valider une feature

```
/validate-feature
```

Lance `code-reviewer` (audit) puis `tester` (tests + coverage).

### Shipper une feature

```
/ship-feature
```

Met à jour la doc, push, ouvre la PR vers `develop`.

---

## Cycle SDD à 2 niveaux

### Niveau Projet (one-shot, au démarrage)

```
brainstorming → spec-writer → architect → devops
   vision/        PRD          stack/      CI/CD/
   personas      global        BDD         infra
```

### Niveau Feature (répété par US)

```
[Specify]   brainstorming (opt) → spec-writer → designer (si UI)
                                ↓ validation humaine
[Plan]      architect (mode feature)
                                ↓ validation humaine
[Implement] developer
                                ↓ validation humaine
[Validate]  code-reviewer → tester
                                ↓
[Post]      doc-writer → /ship-feature → PR vers develop
```

---

## Les 9 agents

| Agent | Modèle | Phase | Rôle court |
|---|---|---|---|
| `brainstorming` | opus | Specify | Idéation, personas, vision |
| `spec-writer` | sonnet | Specify | PRD, fiches feature SDD |
| `designer` | opus | Specify (UI) | Wireframes, maquettes, tokens |
| `architect` | opus | Plan | Stack, BDD, API, ADR |
| `developer` | sonnet | Implement | Code sur branche feature |
| `code-reviewer` | opus | Validate | Audit qualité/sécu/perf (lecture seule) |
| `tester` | sonnet | Validate | Tests unit + intégration + E2E |
| `devops` | sonnet | Bootstrap + après-coup | CI/CD, infra, monitoring |
| `doc-writer` | sonnet | Post-Validate | README, doc API, guides |

**Règle d'or** : chaque agent recommande le suivant. L'orchestration est faite par les slash commands ou par vous. Un agent n'invoque jamais directement un autre agent.

---

## Les 9 MCP préconfigurés

| MCP | Usage | Authentification |
|---|---|---|
| `github` | Issues, PR, commits | PAT via userConfig (`github_token`) |
| `vercel` | Déploiements, preview URLs | OAuth : `/mcp` puis authentifier |
| `supabase` | BDD, migrations, types | OAuth : `/mcp` puis authentifier |
| `stripe` | Paiements, customers, prices | OAuth : `/mcp` puis authentifier |
| `brevo` | Emails transactionnels (défaut) | API key via userConfig |
| `resend` | Emails (alternative à Brevo) | API key via userConfig |
| `notion` | Page projet source de vérité | OAuth : `/mcp` puis authentifier |
| `figma` | Maquettes, design tokens | OAuth : `/mcp` puis authentifier |
| `context7` | Doc technique à jour | aucune, connecté d'office |

Pour les maquettes locales, l'agent `designer` peut aussi utiliser le MCP **Pencil** : il est installé par l'application desktop [pencil.dev](https://pencil.dev), pas par ce plugin.

---

## Hooks de sécurité

Trois scripts (`scripts/*.sh`) attachés à `PreToolUse` matcher `Bash` :

| Hook | Bloque |
|---|---|
| `branch-guard.sh` | `git commit` ou `git push` direct sur `main` ou `develop` |
| `git-safe.sh` | `git reset --hard`, `git push --force` (sauf `--force-with-lease`), `git checkout --`, `git clean -f`, `git branch -D`, `git rebase -i` |
| `secret-scan.sh` | Commits incluant `.env` (sauf `.env.example`) ou patterns de clés (`sk_live_`, `sk_test_`, `re_`, `AKIA`, `ghp_`, etc.) |

Exit code 2 + message stderr → Claude voit le blocage et adapte.

### Désactiver temporairement

```bash
claude plugin disable ottho-code-app
# ... action ponctuelle ...
claude plugin enable ottho-code-app
```

---

## Conventions Git portées par le plugin

- Branches : `main` (prod), `develop` (intégration), `feature/US-XX-slug` (travail), `fix/*`, `refactor/*`, `chore/*`.
- Commits préfixés : `feat(US-XX): ...`, `fix(US-XX): ...`, `test(US-XX): ...`, `docs(US-XX): ...`.
- PR : `feature/*` → `develop`. `develop` → `main` à chaque release.
- Tags : `v1.0.0`, `v1.1.0`, ... (semver) sur `main`.

---

## Templates fournis

Tous dans `templates/`, copiés dans votre projet par les agents/skills :

- `CLAUDE.md.template` — `CLAUDE.md` projet (placeholders à remplir par `architect`).
- `PRD.md.template` — Structure PRD.
- `feature-spec.md.template` — Fiche SDD avec Given-When-Then.
- `plan.md.template` — Plan technique pour `developer`.
- `gitignore.template` — `.gitignore` Next.js + sécurité.

---

## Monitor expérimental (prêt, non-wiré)

`monitors/monitors.json` + `scripts/rls-watch.sh` sont prêts : un monitor `supabase-rls-watch` qui surveille `supabase/migrations/` et alerte si une nouvelle table est créée **sans RLS**.

Pour l'activer, ajouter dans `.claude-plugin/plugin.json` (quand votre version du CLI supporte `experimental` — vérifier avec `claude plugin validate`) :

```json
"experimental": {
  "monitors": "./monitors/monitors.json"
}
```

Le monitor démarre alors automatiquement quand le plugin est enabled (Claude Code v2.1.105+).

---

## Validation du plugin

Avant publication :

```bash
claude plugin validate
```

Le plugin doit passer vert. Vérifie le schéma `plugin.json`, les frontmatters d'agents/skills/commands, et `hooks/hooks.json`.

---

## Désinstallation

```bash
claude plugin uninstall ottho-code-app
```

Ajouter `--keep-data` pour préserver la directory persistante (rare pour ce plugin).

---

## Liens

- **Documentation officielle Claude Code Plugins** : https://code.claude.com/docs/en/plugins-reference
- **Méthode SDD (Spec Kit)** : https://github.com/github/spec-kit
- **Site Ottho** : https://ottho.co

---

## Licence

MIT — cf `LICENSE`.
