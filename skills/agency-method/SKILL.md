---
name: agency-method
description: Use when the user asks about the Ottho method, how the 9 agents work together, the SDD 2-level workflow, agency Git conventions, or how to use this plugin. This is the master reference skill that explains the whole methodology — invoke it for any "how does it work" question about the plugin.
---

# Méthode agence Ottho Code App — Référence maître

Ce skill est la **référence méthodologique** du plugin. Charge-le quand l'utilisateur veut comprendre la méthode, les agents, ou les conventions.

## Vue d'ensemble

Le plugin packe une méthode agence éprouvée : **Spec-Driven Development à 2 niveaux**, orchestré par 9 agents spécialisés.

- **Niveau Projet** (one-shot, au démarrage) : 4 agents, sortie = projet prêt à recevoir des features.
- **Niveau Feature** (cycle répété) : 5 à 7 agents par feature, sortie = code mergeable.

## Les 9 agents

| Agent | Modèle | Phase | Rôle |
|---|---|---|---|
| `brainstorming` | opus | Specify | Idéation, personas, vision |
| `spec-writer` | sonnet | Specify | PRD, fiches feature SDD |
| `designer` | opus | Specify (UI) | Wireframes, maquettes, tokens |
| `architect` | opus | Plan | Stack, BDD, API, ADR |
| `developer` | sonnet | Implement | Code sur branche feature |
| `code-reviewer` | opus | Validate | Audit qualité/sécu/perf (read-only) |
| `tester` | sonnet | Validate | Tests unit + intégration + E2E |
| `devops` | sonnet | Bootstrap + après-coup | CI/CD, infra, monitoring |
| `doc-writer` | sonnet | Post-Validate | README, doc API, guides |

**Règle de passage de main** : chaque agent **recommande** explicitement l'agent suivant à la fin de sa réponse. L'orchestration est faite par le thread principal ou par les slash commands du plugin. Un agent **n'invoque jamais** un autre agent directement.

**Règle de lecture seule** : chaque agent est en lecture seule sur les livrables des agents précédents (designer ne touche pas au PRD, tester ne touche pas au code, etc.).

## Workflow Git

- `main` : production (jamais commiter directement).
- `develop` : intégration (jamais commiter directement).
- `feature/US-XX-slug` : travail courant. Une branche = une user story.
- `fix/*`, `refactor/*`, `chore/*` : pour les autres types de travaux.
- Commits préfixés : `feat(US-XX): ...`, `fix(US-XX): ...`, `test(US-XX): ...`, `docs(US-XX): ...`, `chore: ...`.
- PR `feature/*` → `develop`. PR `develop` → `main` à chaque release.

**Les hooks `branch-guard.sh`, `git-safe.sh` et `secret-scan.sh` du plugin appliquent ces règles automatiquement** : tout commit direct sur `main`/`develop`, toute commande Git destructrice (`reset --hard`, `push --force`), et toute fuite de secret sont **bloqués** avant exécution.

## Stack agence par défaut

- **Front** : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **BDD** : Supabase (Postgres + RLS obligatoire sur toutes les tables)
- **Auth** : Supabase Auth (Auth.js si besoin spécifique)
- **Email** : Brevo par défaut (Resend en alternative)
- **Paiements** : Stripe (sk_test_... en dev, jamais de clés live en non-prod)
- **Hébergement** : Vercel (deux projets Supabase distincts : dev/preview et prod)
- **Tests** : Vitest + Playwright

## MCP recommandés (non installés par défaut)

`github`, `vercel`, `supabase`, `stripe`, `brevo`, `resend`, `notion`, `figma`, `context7`. Les maquettes se font dans Claude Design (outil `Artifact` de Claude Code). **Lance `designer` au premier plan, jamais en arrière-plan** (`run_in_background: false`) : il publie un canevas Claude Design (outil `Artifact`), ce qui demande l'autorisation de l'utilisateur, et le canevas s'ouvre alors dans son navigateur. En arrière-plan, la publication est refusée et il n'y a pas de maquettes visibles.

Le plugin n'installe aucun serveur MCP : chaque projet ajoute les siens dans son `.mcp.json` à la racine (blocs prêts à copier dans le README). Les clés passent par les variables d'environnement du projet, jamais en clair dans le fichier.

## Conventions de sécurité

- **RLS Supabase activée** sur toute nouvelle table — non-négociable.
- **Aucun secret en clair** dans le repo. Tout passe par `.env.local` (gitignored) et `process.env.X`.
- **Validation des inputs côté serveur** systématique (Zod ou équivalent).
- **Headers de sécurité** sur les endpoints publics (CSP, X-Frame-Options).
- **Tests sur projet Supabase de test**, jamais sur la base de dev.

## Slash commands

- `/init-agency-project` — bootstrap projet complet (5 agents : brainstorming, spec-writer, designer, architect, devops).
- `/new-feature "titre"` — démarre un cycle SDD niveau feature.
- `/validate-feature` — phase Validate (code-reviewer + tester).
- `/ship-feature` — vérification finale + ouverture PR + doc.

## Source de vérité projet

- **Page Notion** si MCP `notion` configuré (briefs, décisions, deadlines).
- **Sinon** : dossier `/docs/` du repo (PRD, architecture, devops, ADR).
- Dans tous les cas, le code reste **dans Git** et la doc dans le repo (Notion est un miroir, pas l'inverse).

## Questions à l'utilisateur : dans le terminal

Les questions des agents se posent **dans le terminal** : Ottho Builder 2 les affiche en lecture seule (pas de champ de réponse, pas de terminal intégré) et renvoie l'utilisateur ici. Quand l'utilisateur répond :
- **consigne la réponse** dans le livrable concerné, section « Questions ouvertes » (case cochée, puis `  > Réponse (AAAA-MM-JJ) : …`) : spec pour une feature, `docs/PRD.md` au niveau projet, sinon `docs/questions/<US-XX ou projet>.md` ; c'est là que les agents suivants la lisent ;
- **transmets-la** à l'agent suivant et ne la remplace jamais par une hypothèse ;
- avant de reposer une question, **relis ces sections** : si elle y a déjà une réponse, reprends-la. Le hook `answered-guard` refuse d'ailleurs une question du sélecteur (`AskUserQuestion`) déjà répondue et te donne la réponse ;
- chaque question du sélecteur reçoit aussi le choix **« Suivre tes recos »** (ajouté par `answered-guard`), et l'utilisateur peut l'écrire en toutes lettres (« suis tes recos »). Dans ce cas, **tranche toi-même** selon la recommandation de l'agent (ou la tienne, justifiée en une ligne) et consigne-la comme réponse : `> Réponse (date) : suivre la recommandation, <choix retenu>`. Donne donc toujours une recommandation par défaut avec tes questions.

## Validations : dans le terminal

L'utilisateur valide chaque livrable **dans le terminal** : PRD (`docs/PRD.md`), charte (`design/charte.md`), architecture (`docs/architecture.md`), spec (`specs/US-XX-<slug>.md`), maquettes (`design/US-XX-<slug>.md`), plan (`plans/US-XX-<slug>.md`). Ottho Builder 2 n'écrit rien : il lit l'état dans la section `## Historique` du livrable, validé quand la dernière entrée de sa liste dit « Validé par l'utilisateur ».
- Sur son accord explicite (« je valide la spec », « OK pour le plan »), **ajoute à la fin de cette section** la ligne `- AAAA-MM-JJ : Validé par l'utilisateur.` (date du jour). Pas de section : crée `## Historique` en fin de fichier avec cette ligne.
- **Ne valide jamais à sa place** : ni sur ton propre jugement, ni sur un silence, ni sur l'avis d'un agent.
- Une entrée ajoutée ensuite (révision par un agent) annule la validation dans l'app : redemande-la.

## Fichiers de marque : glissés dans le terminal

L'utilisateur glisse ses fichiers (logo, images, polices, charte en PDF, maquettes) dans le terminal Claude Code. **Copie-les dans `design/assets/`** en gardant leur nom (dossier créé au besoin ; un fichier du même nom n'est remplacé qu'avec son accord), puis **dis-le à `designer`** en listant les fichiers copiés dans sa demande : il lit ce dossier avant la charte. Image reçue sans son chemin : demande-lui le chemin du fichier pour le copier. Ottho Builder 2 les affiche dans « Éléments de marque ».
