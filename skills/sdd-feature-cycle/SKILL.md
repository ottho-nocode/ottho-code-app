---
name: sdd-feature-cycle
description: Use when the user wants to add a new feature, build a new module, implement a user story, or asks about how to ship a feature with the Ottho method. Guides through the 4-phase SDD cycle (Specify → Plan → Implement → Validate) with mandatory human validation between phases.
---

# Cycle SDD par feature — Ottho Code App

Quand l'utilisateur demande à **ajouter une fonctionnalité** / **nouvelle feature** / **implémenter une US** / **construire un module**, applique ce cycle.

## Principes

- **4 phases strictes** : Specify → Plan → Implement → Validate.
- **Validation humaine obligatoire** entre chaque phase. Ne passe **jamais** à la phase suivante sans un OK explicite.
- **Une branche par feature** : `feature/US-XX-slug` créée depuis `develop`.
- **Une fiche spec + un plan + des tests + de la doc** par feature.

## Phase 1 — Specify

**Objectif** : produire la fiche fonctionnalité SDD complète.

1. Si la feature mérite un cadrage (problème pas clair, plusieurs personas concernés) : invoquer `brainstorming` pour clarifier vision et personas de la feature.
2. Invoquer `spec-writer` pour formaliser la fiche dans `/specs/US-XX-<slug>.md` (template : `${CLAUDE_PLUGIN_ROOT}/templates/feature-spec.md.template`).
3. Si la feature a une dimension UI/UX : invoquer `designer` pour wireframes puis maquettes.
4. **STOP** — demander validation humaine.

## Phase 2 — Plan

**Objectif** : produire le plan technique.

1. Vérifier que la branche `feature/US-XX-<slug>` existe et est checkout-ée.
2. Invoquer `architect` (mode feature) pour produire `/plans/US-XX-<slug>.md` (template : `${CLAUDE_PLUGIN_ROOT}/templates/plan.md.template`).
3. **STOP** — demander validation humaine du plan technique.

## Phase 3 — Implement

**Objectif** : produire le code de la feature.

1. Invoquer `developer` avec la spec et le plan en contexte.
2. `developer` commit au fil de l'eau sous forme `feat(US-XX): ...`.
3. **STOP** — demander validation humaine sur l'implémentation initiale avant la phase Validate.

## Phase 4 — Validate

**Objectif** : garantir qualité + conformité aux critères d'acceptation.

1. Invoquer `code-reviewer` pour audit qualité/sécurité/perf (lecture seule).
2. Si le rapport est **APPROUVÉ** → étape 3. Sinon : re-invoquer `developer` avec le rapport pour correction, puis re-`code-reviewer`.
3. Invoquer `tester` pour écrire et exécuter les tests.
4. Si tous les tests sont verts : passer au Post-Validate. Sinon : corriger via `developer` puis re-tester.

## Post-Validate

1. Invoquer `doc-writer` pour mettre à jour la doc.
2. Utiliser la commande `/ship-feature` pour vérifier la conformité finale et ouvrir la PR vers `develop`.

## Templates de référence

- Fiche feature : `${CLAUDE_PLUGIN_ROOT}/templates/feature-spec.md.template`
- Plan technique : `${CLAUDE_PLUGIN_ROOT}/templates/plan.md.template`

## Récapitulatif rapide

```
brainstorming (optionnel) → spec-writer → designer (si UI)  ← Phase Specify
   ↓ validation humaine
architect (mode feature)                                     ← Phase Plan
   ↓ validation humaine
developer                                                    ← Phase Implement
   ↓ validation humaine
code-reviewer → tester                                       ← Phase Validate
   ↓
doc-writer → /ship-feature                                   ← Post-Validate
```

## Designer : au premier plan

**Lance `designer` au premier plan, jamais en arrière-plan** (`run_in_background: false`) : il publie un canevas Claude Design (outil `Artifact`), ce qui demande l'autorisation de l'utilisateur, et le canevas s'ouvre alors dans son navigateur. En arrière-plan, la publication est refusée et il n'y a pas de maquettes visibles.
