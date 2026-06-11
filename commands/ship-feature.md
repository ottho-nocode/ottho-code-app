---
description: Finalise une feature validée (doc + PR vers develop + notification Notion).
---

# /ship-feature

Finalise une feature ayant passé la phase Validate.

## Pré-requis

- Branche courante = `feature/US-XX-<slug>`.
- `code-reviewer` a APPROUVÉ.
- `tester` a tous les tests verts.

## Séquence d'exécution

1. **Vérifier les pré-requis** :
   - Bash : `git status` → working tree propre (commits prêts à push).
   - Bash : `npm test -- --run --reporter=verbose` → tous verts.
   - Bash : `npm run lint && npm run typecheck && npm run build` → tous verts.
   - Si l'un échoue : afficher l'erreur et **refuser** de continuer.
2. **Invoquer `doc-writer`** pour mettre à jour :
   - `README.md` (si feature visible utilisateur)
   - `/docs/api.md` (si nouveaux endpoints)
   - `CHANGELOG.md` (entrée `## [Unreleased]`)
3. **Commit doc** : `docs(US-XX): update README and CHANGELOG`.
4. **Push** : `git push -u origin feature/US-XX-<slug>`.
5. **Ouvrir la PR** vers `develop` via le MCP `github` :
   - Titre : `[US-XX] Titre de la US`
   - Body : résumé de la feature, lien vers `/specs/US-XX-<slug>.md`, lien vers `/plans/US-XX-<slug>.md`, checklist de validation.
6. **Notification Notion** (si MCP `notion` configuré) : poster un résumé dans la page projet avec lien vers la PR.
7. Afficher : "PR ouverte : <URL>. Merge dans `develop` après revue humaine. La feature est shipped quand `develop` → `main` à la prochaine release."

---

**Règles strictes** :

- Aucune PR direct vers `main` — toujours vers `develop`.
- Si un test échoue à cette étape, **refuser le ship** et renvoyer vers `/validate-feature`.
- Ne **jamais** force-push (le hook `git-safe.sh` du plugin l'empêche de toute façon).
- Marquer la PR comme **draft** si la feature dépend d'autres PR en cours.
