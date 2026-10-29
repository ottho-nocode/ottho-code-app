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
- **Panneau « Équipe » dans Claude Code** : le robot de chaque agent, son déroulé en direct et les validations qui t'attendent, à côté de la conversation (commande `/equipe`).
- **Ottho Builder 2 inclus** (dossier `builder/`) : la vue du pipeline des agents dans le navigateur, ouverte au démarrage de Claude Code (commande `/pipeline`). Rien à installer : Node 20 ou plus suffit, l'interface est déjà construite.

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

Lance `code-reviewer` (audit) puis `tester` (tests + coverage, parcours E2E filmés et analysés, rapport `/reviews/test-report-US-XX.md`).

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

Ottho Builder 2 est inclus dans le plugin (dossier `builder/`, interface déjà construite, serveur sans dépendance) : rien à installer ni à enregistrer, le hook de démarrage le lance avec le Node de la machine (20 ou plus). Les exemples de brief restent dans `~/.ottho-pipeline/briefs` ; un ancien `~/.ottho-pipeline/engine.json` (versions précédentes) ne sert plus et peut être supprimé. Détails et lancement à la main : `builder/README.md`.

### Panneau « Équipe » dans Claude Code

Dans un projet suivi par Ottho Builder 2, un panneau « Équipe » s'ouvre aussi dans Claude Code, à côté de la conversation (module de hooks `hooks/equipe/register.tsx`). Il reprend l'essentiel du Builder et se met à jour toutes les 4 secondes :

- les étapes de la feature en cours : Spec, Plan, Code, Revue, Tests, Fusion ;
- **À toi de jouer** : les questions des agents sans réponse, les livrables à valider et la prochaine étape. Le bouton « Préparer le message » écrit le bon message dans la zone de saisie, sans l'envoyer : tu relis, puis tu appuies sur Entrée ;
- **L'équipe** : le robot de chaque agent, son statut (travaille depuis…, terminé, interrompu, sans nouvelles depuis 8 min), son nombre de passages et ses dernières actions en direct.

Il ne s'ouvre de lui-même que si Ottho Builder 2 suit le projet. Pour le rouvrir :

```
/equipe
```

Tant qu'il est ouvert, il garde Ottho Builder 2 en vie, comme un onglet du navigateur. Comme le Builder, il est en lecture seule.

### Panneau « Agents Ottho » dans Claude Code

Un second panneau, « Agents Ottho » (module `hooks/agents-pane/register.tsx`), suit les agents **sans Ottho Builder 2** : il lit directement le journal du plugin, `.claude/pipeline-events.jsonl`, dès qu'un agent démarre, agit ou termine.

- une ligne par agent du pipeline : en cours (US, depuis combien de temps, ce qu'il fait : « lit specs/US-02.md »), terminé (il y a combien de temps, verdict), interrompu (sans nouvelles depuis 30 min) ou au repos ;
- en bas : « Claude attend ta réponse » (ou ton autorisation) dans le terminal, et la prochaine étape recommandée ;
- des **notifications** : un agent démarre, un agent a fini (verdict et suite), Claude attend ta réponse.

Il s'ouvre de lui-même dans un projet Ottho (`docs/brief.md`, `docs/PRD.md`, `design/charte.md` ou une spec `specs/US-*.md`) quand le terminal est assez large, jamais sous `claude -p`. Pour l'ouvrir :

```
/ottho-agents
```

Prérequis des deux panneaux : Claude Code 2.1.287 ou plus dans le terminal (2.1.286 pour l'app Desktop), versions où les mods (modules de hooks) sont activés par défaut ; testés avec Claude Code 2.1.289. Plus ancien, les panneaux n'apparaissent pas : mets Claude Code à jour (`claude update`). Le reste du plugin n'en dépend pas.

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
| `tester` | sonnet | Validate | Tests unit + intégration + E2E filmés, analyse des captures et vidéos, rapport de recette |
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

**Pour l'agent `tester` (facultatif)** : le MCP Playwright lui donne un navigateur en direct pour explorer un écran ou comprendre un échec (`claude mcp add playwright -- npx @playwright/mcp@latest`). Les vidéos et captures de recette, elles, viennent de `npx playwright test` et ne demandent aucun MCP. Pour analyser les vidéos, `tester` a besoin de `ffmpeg` sur la machine (`brew install ffmpeg`).

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

Tests :

```bash
node --test                    # scripts des hooks (tests/) et serveur d'Ottho Builder 2 (builder/server/)
claude plugin test             # panneaux de Claude Code (tests/equipe.test.tsx ; le modèle d'« Agents Ottho » est couvert par node --test)
cd builder && npm ci && npm run typecheck && npm run build && npx playwright test   # interface d'Ottho Builder 2 et tests e2e
```

Le plugin livre l'interface d'Ottho Builder 2 déjà construite : après une modification de `builder/web/`, `npm run build` dans `builder/` puis committer `builder/dist/` avec elle.

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
