---
description: Démarre un cycle SDD pour une nouvelle feature (branche + Specify + Plan)
---

# /new-feature

Démarre la phase **Specify** + **Plan** du cycle SDD pour une nouvelle user story.

**Argument** : `$ARGUMENTS` = titre court de la US (entre guillemets).

## Séquence d'exécution

1. **Déterminer le numéro de US** :
   - Lister les fichiers `/specs/US-*.md` existants.
   - Le nouveau numéro = max(existants) + 1, padding sur 2 chiffres (US-01, US-02, ...).
2. **Slugifier le titre** : minuscules, tirets, sans accents → ex. "Page de connexion" → `page-de-connexion`.
3. **Créer la branche** :
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/US-XX-<slug>
   ```
   (Les hooks `branch-guard.sh` et `git-safe.sh` du plugin garantissent la sécurité.)
4. **Charger le skill `sdd-feature-cycle`** et appliquer sa phase Specify :
   - Si besoin de cadrage : invoquer `brainstorming` (mode feature).
   - Invoquer `spec-writer` pour produire `/specs/US-XX-<slug>.md`.
   - Si dimension UI : invoquer `designer`.
5. **STOP** — afficher : "Phase Specify terminée. Validez la spec, puis tapez 'GO PLAN' pour passer à la phase Plan."
6. **Sur 'GO PLAN'** : invoquer `architect` (mode feature) pour produire `/plans/US-XX-<slug>.md`.
7. **STOP** — afficher : "Phase Plan terminée. Validez le plan, puis tapez 'GO IMPLEMENT' pour passer à l'implémentation."
8. **Sur 'GO IMPLEMENT'** : invoquer `developer` avec la spec et le plan en contexte.

À la fin de l'implémentation, l'utilisateur lance `/validate-feature` pour la phase Validate.

---

**Règles strictes** :

- Une seule feature en cours à la fois (vérifier qu'on n'est pas déjà sur une branche `feature/*`).
- Validation humaine obligatoire entre Specify, Plan, et Implement.
- Aucune action destructrice sans confirmation explicite.
