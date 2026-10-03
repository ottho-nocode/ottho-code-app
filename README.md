# Ottho Code App — Plugin Claude Code

> Méthode complète d'agence pour livrer des applications web modernes avec Claude Code. SDD à 2 niveaux, 10 agents spécialisés, audit sécurité complet, 9 MCP recommandés (non installés par défaut), hooks de sécurité Git.

---

## Pour qui

Agences et freelances qui construisent des apps web (Next.js + Supabase + Brevo/Resend + Stripe) et veulent industrialiser leur méthode de travail avec Claude Code.

## Ce que vous obtenez en une commande

- **10 agents spécialisés** qui couvrent le cycle de vie d'une feature : Brainstorming, Spec-Writer, Designer, Architect, Developer, Code-Reviewer, Tester, DevOps, Doc-Writer, Security-Auditor.
- **4 skills** qui orchestrent : `agency-method` (référence), `project-bootstrap` (démarrage projet), `sdd-feature-cycle` (cycle feature), `security-checklist` (contrôle avant mise en ligne).
- **6 slash commands** : `/init-agency-project`, `/new-feature`, `/validate-feature`, `/audit-securite`, `/ship-feature`, `/pipeline`.
- **9 MCP recommandés** — non installés par défaut : GitHub, Vercel, Supabase, Stripe, Brevo, Resend, Notion, Figma, Context7. À ajouter par projet, voir [Les 9 MCP recommandés](#les-9-mcp-recommandés-non-installés-par-défaut). (Pencil : fourni par l'app desktop [pencil.dev](https://pencil.dev), pas par le plugin.)
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

**Le plugin n'installe aucun serveur MCP.** Les 9 MCP de la méthode sont recommandés mais s'ajoutent par projet, selon les besoins — voir la section [Les 9 MCP recommandés](#les-9-mcp-recommandés-non-installés-par-défaut).

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

### Auditer la sécurité

```
/audit-securite
```

Lance `security-auditor` sur tout le projet (secrets, RLS + advisors Supabase, code mort) et écrit le rapport classé dans `/reviews/security-audit.md`. À dérouler avant une mise en ligne, avec le skill `security-checklist`.

### Voir le pipeline (Ottho Builder 2)

Ottho Builder 2 s'ouvre tout seul dans le navigateur au démarrage de Claude Code, dans un projet Ottho (brief, PRD, charte ou spec `specs/US-*.md`) ou un dossier vide, jamais dans le dossier personnel (hook `SessionStart`, `scripts/visual-engine.mjs`). Il s'arrête 30 min après la fermeture de son dernier onglet ; la session suivante le relance. Pour le rouvrir :

```
/pipeline
```

C'est une vue **en lecture seule** : carte des agents, agent en cours et ce qu'il fait en direct, avancement de chaque `US-XX`, brief du projet, questions en attente, livrables à valider, éléments de marque (logo, polices…). Tout le reste se fait dans le terminal Claude Code :

- **brief du projet** : Claude pose les six blocs du canevas (ou applique un exemple enregistré) et l'écrit dans `docs/brief.md` avec la commande `brief` du Builder ;
- **questions des agents** : réponse dans le terminal, consignée par Claude dans le livrable (« Questions ouvertes ») ;
- **validations** : « je valide le PRD » dans le terminal ; Claude ajoute `- AAAA-MM-JJ : Validé par l'utilisateur.` à l'« Historique » du livrable, que l'app lit ;
- **fichiers de marque** : glissés dans le terminal, copiés par Claude dans `design/assets/`.

Seul son panneau Config écrit : les variables d'environnement du projet, dans `.env.local`. La vue est alimentée par les hooks du plugin (`scripts/pipeline-event.mjs`), qui écrivent `.claude/pipeline-events.jsonl` (métadonnées seulement, jamais bloquants).

Une fois, `npx ottho-pipeline --install` enregistre Ottho Builder 2 pour le plugin (`~/.ottho-pipeline/engine.json`, lu par le hook) ; tout lancement à la main du Builder (`npx ottho-pipeline`) l'enregistre aussi.

---

## Cycle SDD à 2 niveaux

### Niveau Projet (one-shot, au démarrage)

```
brainstorming → spec-writer → designer → architect → devops
   vision/        PRD          charte/     stack/      CI/CD/
   personas      global        maquettes   BDD         infra
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

## Les 10 agents

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
| `security-auditor` | opus | Avant mise en ligne | Audit sécu transverse : secrets, RLS, code mort (lecture seule) |

**Règle d'or** : chaque agent recommande le suivant. L'orchestration est faite par les slash commands ou par vous. Un agent n'invoque jamais directement un autre agent.

---

## Les 9 MCP recommandés (non installés par défaut)

**Le plugin n'embarque aucun serveur MCP.** Chaque projet ajoute les siens : copie un des blocs ci-dessous dans le `.mcp.json` à la racine du projet, ou ajoute-les un par un avec `claude mcp add`. Avantages : pas de serveurs « Failed to connect » fantômes dans les projets qui n'en ont pas l'usage, et des credentials gérés par projet.

| MCP | Usage | Authentification | Utilisé par |
|---|---|---|---|
| `github` | Issues, PR, commits | PAT GitHub dans le header `Authorization` | devops |
| `vercel` | Déploiements, preview URLs | OAuth : `/mcp` puis authentifier | devops |
| `supabase` | BDD, migrations, types | OAuth : `/mcp` puis authentifier | developer, devops ; architect et security-auditor en lecture |
| `stripe` | Paiements, customers, prices | OAuth : `/mcp` puis authentifier | developer |
| `brevo` | Emails transactionnels (défaut) | API key dans le header `api-key` | developer |
| `resend` | Emails (alternative à Brevo) | API key dans le header `Authorization` | developer |
| `notion` | Page projet source de vérité | OAuth : `/mcp` puis authentifier | brainstorming, spec-writer, developer, doc-writer |
| `figma` | Maquettes, design tokens | OAuth : `/mcp` puis authentifier | designer |
| `context7` | Doc technique à jour | aucune | architect, developer |

### Ce que chaque agent peut faire

Un sous-agent ne voit que les outils de sa ligne `tools:`. Chaque agent reçoit donc les services de son métier (colonne ci-dessus), et rien d'autre. Quelques actions restent **retirées** à tous les agents (`disallowedTools`) et reviennent à l'humain :

- **Supabase** : créer un projet ou une branche, confirmer un coût, fusionner, réinitialiser, mettre en pause ou restaurer ; `developer` ne déploie pas non plus d'edge function. `architect` et `security-auditor` n'ont que des outils de lecture (tables, migrations, conseils de sécurité).
- **Vercel** : acheter un domaine, des crédits ou un abonnement.
- **Stripe** : aucun outil n'est retiré, la protection est le compte branché. Connecte un compte de **test** (sandbox Stripe), jamais le compte réel ; `developer` s'arrête s'il voit `livemode: true`.

### Garde-fous conseillés

- **Supabase relié au projet de dev** : ajoute `?project_ref=<ref du projet de dev>` à l'URL du serveur, pour qu'aucun agent ne puisse atteindre la prod. Sur un projet où personne ne doit écrire en base (audit seul), ajoute aussi `&read_only=true`.
- **Garde les noms du tableau** (`supabase`, `stripe`…) : les outils d'un serveur portent son nom (`mcp__supabase__list_tables`), et les agents les cherchent sous ce nom. Un serveur renommé (`supabase-dev`) est invisible pour eux.
- **Connecteurs claude.ai** : Supabase, Stripe, Vercel, Notion et Figma branchés depuis claude.ai (outils `mcp__claude_ai_Supabase__…`) sont aussi reconnus par les agents, avec les mêmes interdictions.
- Si un agent a besoin d'un service absent, il ne le contourne pas (pas de `curl` avec une clé) : il te le demande dans ses « Questions pour l'utilisateur ».

Serveurs OAuth + Context7 (aucune clé dans le fichier) :

```json
{
  "mcpServers": {
    "vercel":   { "type": "http", "url": "https://mcp.vercel.com" },
    "supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp?project_ref=REF_DU_PROJET_DE_DEV" },
    "stripe":   { "type": "http", "url": "https://mcp.stripe.com" },
    "notion":   { "type": "http", "url": "https://mcp.notion.com/mcp" },
    "figma":    { "type": "http", "url": "https://mcp.figma.com/mcp" },
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp" }
  }
}
```

Serveurs à clé — toujours via variables d'environnement, jamais de clé en clair dans le fichier :

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_PAT}" }
    },
    "brevo": {
      "type": "http",
      "url": "https://mcp.brevo.com",
      "headers": { "api-key": "${BREVO_API_KEY}" }
    },
    "resend": {
      "type": "http",
      "url": "https://mcp.resend.com",
      "headers": { "Authorization": "Bearer ${RESEND_API_KEY}" }
    }
  }
}
```

Les maquettes se font dans **Claude Design** (outil `Artifact` de Claude Code) : l'agent `designer` y publie un canevas et en range une copie dans `design/projet/` ou `design/US-XX-<slug>/`, affichée par Ottho Builder 2. Pencil n'est plus utilisé.

---

## Hooks de sécurité

Trois scripts (`scripts/*.sh`) attachés à `PreToolUse` matcher `Bash` :

| Hook | Bloque |
|---|---|
| `branch-guard.sh` | `git commit` (si la branche du repo ciblé par la commande est `main`/`develop`) et `git push` avec refspec `main`/`develop` — repo du projet courant uniquement |
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
