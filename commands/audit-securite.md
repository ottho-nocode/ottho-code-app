---
description: Audit sécurité complet du projet (code, base, secrets) via l'agent security-auditor, avec rapport classé dans /reviews/security-audit.md.
---

# /audit-securite

Déclenche un **audit sécurité complet** du projet : code, base de données, secrets. À lancer avant une mise en ligne ou après une grosse vague de modifications.

## Pré-requis

- Un projet qui tourne (app Next.js + Supabase).
- Idéalement le MCP `supabase` connecté (pour les advisors). Sinon, l'audit reste possible en statique et signale ce qui n'a pas pu être vérifié en direct.

## Séquence d'exécution

1. **Invoquer l'agent `security-auditor`** sur l'ensemble du projet (pas seulement la branche courante). Il déroule ses cinq fronts : secrets/frontière client, RLS + advisors Supabase, code mort, patterns auth, rappel des réglages dashboard.
2. **Récupérer le rapport dicté** par l'agent (il n'a pas `Write`, il dicte le contenu classé 🔴/🟠/🟡).
3. **Écrire le rapport** dans `/reviews/security-audit.md` au format :
   ```markdown
   # Audit sécurité

   ### Bloquant
   - ...

   ### Important
   - ...

   ### Mineur
   - ...
   ```
   (Créer le dossier `/reviews/` s'il n'existe pas.)
4. **Afficher un récapitulatif** : nombre de constats par gravité + le verdict de l'agent (**PRÊT POUR MISE EN LIGNE** / **CORRECTIONS REQUISES AVANT MISE EN LIGNE**).
5. **Si des points 🔴 bloquants** : proposer de re-invoquer `developer` avec le rapport pour les corriger, puis relancer `/audit-securite`.
6. **Si aucun bloquant** : suggérer de dérouler le skill `security-checklist` pour la validation finale avant `/ship-feature`.

---

**Règles** :

- Tu ne **corriges pas** le code toi-même : tu orchestres `security-auditor` (audit) puis `developer` (correction) si besoin.
- **Jamais** de requête mutante sur la base de production : advisors et lectures uniquement.
- Le rapport écrase le précédent `/reviews/security-audit.md` (c'est une photo à l'instant T, versionnée par Git).
