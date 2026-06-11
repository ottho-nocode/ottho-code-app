---
description: Phase Validate du cycle SDD (code-reviewer + tester) sur la branche feature courante.
---

# /validate-feature

Exécute la phase **Validate** du cycle SDD sur la branche feature courante.

## Pré-requis

- Branche courante = `feature/US-XX-<slug>` (vérifier avec `git branch --show-current`).
- `developer` a terminé son implémentation initiale.

## Séquence d'exécution

1. **Vérifier les pré-requis** :
   - On est bien sur une branche `feature/*` (sinon : refuser).
   - Il y a des commits non poussés ou poussés sur cette branche (sinon : indiquer qu'il n'y a rien à valider).
2. **Invoquer `code-reviewer`** sur la diff `develop...HEAD`.
3. Si le verdict est **CORRECTIONS REQUISES** :
   - Afficher le rapport.
   - Demander : "Voulez-vous re-invoquer `developer` avec ce rapport ? (oui/non)"
   - Si oui : invoquer `developer` avec le rapport en contexte, puis re-`code-reviewer`.
4. Si le verdict est **APPROUVÉ** : passer à l'étape suivante.
5. **Invoquer `tester`** pour écrire et exécuter les tests :
   - Tests unitaires + intégration : `npm test`
   - Tests E2E : `npm run test:e2e`
   - Couverture : objectif 70 % minimum sur les fichiers modifiés.
6. Si **tests rouges** à cause du code : re-invoquer `developer` avec la liste des échecs, puis re-`tester`.
7. Si **tous les tests verts** :
   - Afficher un récapitulatif : "Validate OK. Tu peux maintenant lancer `/ship-feature` pour ouvrir la PR."

---

**Règles** :

- Tu ne push **pas** vers le remote dans cette commande — c'est `/ship-feature` qui le fait.
- Tu ne modifies **pas** le code toi-même — tu orchestres `developer` si correction nécessaire.
- Tu produis un rapport final consolidé : code-review + couverture de tests + liste des critères d'acceptation validés.
