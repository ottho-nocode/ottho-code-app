---
description: Bootstrap d'un nouveau projet agence Ottho (Brief → Brainstorming → Spec-writer → Designer → Architect → DevOps).
---

# /init-agency-project

Démarre un nouveau projet selon la méthode agence Ottho.

Charge et applique le skill **project-bootstrap** pour orchestrer la séquence :

0. Brief du projet : canevas en 6 blocs écrit dans `docs/brief.md` depuis le terminal (exemple enregistré, ou les six blocs posés un par un)
1. `brainstorming` — vision, personas, MVP
2. `spec-writer` — PRD global
3. `designer` — charte graphique (demandée d'abord), design system, maquettes des écrans clés
4. `architect` — stack, schéma BDD, conventions, `CLAUDE.md`
5. `devops` — Git, Vercel, Supabase dev/prod, GitHub Actions, monitoring

**Validation humaine obligatoire entre chaque étape** (seule exception : `designer` démarre dès que le PRD est écrit et pose ses questions pendant que l'utilisateur le relit ; le PRD reste validé avant `architect`).

À la fin, le projet est prêt à recevoir sa première feature via `/new-feature`.

---

**Instructions d'exécution** :

Invoque immédiatement le skill `project-bootstrap` en suivant sa procédure pas à pas. Ne saute aucune étape. Demande validation à l'utilisateur entre chaque agent.
