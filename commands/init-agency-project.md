---
description: Bootstrap d'un nouveau projet agence Ottho (Brainstorming → Spec-writer → Designer → Architect → DevOps).
---

# /init-agency-project

Démarre un nouveau projet selon la méthode agence Ottho.

Charge et applique le skill **project-bootstrap** pour orchestrer la séquence :

1. `brainstorming` — vision, personas, MVP
2. `spec-writer` — PRD global
3. `designer` — charte graphique (demandée d'abord), design system, maquettes des écrans clés
4. `architect` — stack, schéma BDD, conventions, `CLAUDE.md`
5. `devops` — Git, Vercel, Supabase dev/prod, GitHub Actions, monitoring

**Validation humaine obligatoire entre chaque étape.**

À la fin, le projet est prêt à recevoir sa première feature via `/new-feature`.

---

**Instructions d'exécution** :

Invoque immédiatement le skill `project-bootstrap` en suivant sa procédure pas à pas. Ne saute aucune étape. Demande validation à l'utilisateur entre chaque agent.
