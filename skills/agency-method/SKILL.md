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

## MCP préconfigurés

`github`, `vercel`, `supabase`, `stripe`, `brevo`, `resend`, `notion`, `figma`, `pencil`, `context7`.

Les credentials sont demandés à l'install via `userConfig` (cf README) et stockés en keychain système.

## Conventions de sécurité

- **RLS Supabase activée** sur toute nouvelle table — non-négociable.
- **Aucun secret en clair** dans le repo. Tout passe par `.env.local` (gitignored) et `process.env.X`.
- **Validation des inputs côté serveur** systématique (Zod ou équivalent).
- **Headers de sécurité** sur les endpoints publics (CSP, X-Frame-Options).
- **Tests sur projet Supabase de test**, jamais sur la base de dev.

## Slash commands

- `/init-agency-project` — bootstrap projet complet (4 agents).
- `/new-feature "titre"` — démarre un cycle SDD niveau feature.
- `/validate-feature` — phase Validate (code-reviewer + tester).
- `/ship-feature` — vérification finale + ouverture PR + doc.

## Source de vérité projet

- **Page Notion** si MCP `notion` configuré (briefs, décisions, deadlines).
- **Sinon** : dossier `/docs/` du repo (PRD, architecture, devops, ADR).
- Dans tous les cas, le code reste **dans Git** et la doc dans le repo (Notion est un miroir, pas l'inverse).
