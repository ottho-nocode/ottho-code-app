---
name: project-bootstrap
description: Use when the user wants to start a new agency project, init a project from scratch, bootstrap a Next.js/Supabase app, or asks how to set up a new client app. Orchestrates the 4-step project-level SDD workflow (brainstorming → spec-writer → architect → devops).
---

# Bootstrap projet — Ottho Code App

Quand l'utilisateur demande à **démarrer un nouveau projet** / **init projet** / **setup agence** / **bootstrap**, applique cette procédure.

## Pré-requis

- Le dossier courant est vide ou ne contient pas encore de code applicatif.
- Git n'est pas encore initialisé (sinon : vérifier l'état avec l'utilisateur avant de continuer).

## Étapes

### 0. Brief

Si `docs/brief.md` existe (onboarding d'Ottho Builder 2), annonce-le et transmets-le à `brainstorming` : il en part et ne pose que les questions qui manquent. Sinon, `brainstorming` construit le cadrage par questions.

**Validations dans Ottho Builder 2** : l'utilisateur peut valider le PRD et l'architecture dans l'app (entrée « Validé par l'utilisateur (Ottho Builder 2) » dans leur « Historique »). Un message du type « Le PRD est validé dans le pipeline » vaut validation : passe à l'étape suivante.

### 1. Cadrage initial — `brainstorming`

Invoquer `brainstorming` (niveau projet) :
- Vision globale
- Personas cibles (1 à 3)
- Périmètre du MVP (3 à 5 fonctionnalités max)
- Analyse concurrentielle si pertinente

**STOP** — demander validation humaine.

### 2. PRD — `spec-writer`

Invoquer `spec-writer` (niveau projet) :
- Génère `/docs/PRD.md` à partir du template `${CLAUDE_PLUGIN_ROOT}/templates/PRD.md.template`
- Synthétise vision, personas, fonctionnalités MVP, contraintes, métriques de succès

**STOP** — validation humaine.

### 3. Architecture initiale — `architect`

Invoquer `architect` (niveau projet) :
- Définit la stack (par défaut : Next.js 16 + Supabase + Brevo + Stripe + Vercel)
- Schéma BDD de base (tables, relations, **RLS obligatoire**)
- Conventions de code et de commits
- Génère `CLAUDE.md` à la racine du projet à partir de `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template`
- Rédige `/docs/architecture.md` (stack, schéma, conventions), terminé par une section `## Historique` : c'est le livrable que l'utilisateur valide
- Initialise l'arborescence : `/docs/`, `/specs/`, `/plans/`, `/docs/adr/`

**STOP** — validation humaine.

### 4. Setup infra — `devops`

Invoquer `devops` (niveau projet) :
- Init Git (si pas fait) + premier commit
- Branches `main` et `develop` + branch protections
- Création du repo GitHub (via MCP `github` si configuré)
- Création de **deux** projets Supabase (dev + prod, jamais le même)
- Connexion Vercel + preview deployments
- GitHub Actions : lint, typecheck, test, build
- `.env.example` avec toutes les variables documentées
- Page Notion projet si MCP `notion` configuré

### 5. Validation finale

À la fin du bootstrap, le projet contient :
- `CLAUDE.md` à la racine
- `/docs/PRD.md`, `/docs/architecture.md`, `/docs/devops.md`
- `/specs/` et `/plans/` vides (prêts à recevoir)
- Branches `main` et `develop` poussées
- CI verte sur le premier commit
- Preview Vercel fonctionnel
- Deux projets Supabase isolés

Annonce alors :

> Le projet est prêt. Tu peux maintenant lancer ta première feature avec `/new-feature "Titre de la première US"`.
