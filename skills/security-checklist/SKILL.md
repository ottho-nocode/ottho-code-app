---
name: security-checklist
description: Use when the user prepares a launch, is about to ship to production, mentions "mise en ligne", "déployer en prod", "c'est prêt ?", or wants the pre-launch security checklist. Déroule les 5 fronts de durcissement (code, base, utilisateur, performance, environnement) avant chaque mise en ligne, coche avec l'utilisateur, et lance /audit-securite pour la partie automatisable.
---

# Security Checklist — liste de contrôle avant mise en ligne

Quand l'utilisateur **prépare un lancement** (mise en ligne, déploiement prod, « c'est prêt ? »), déroule cette liste **avec lui**, front par front. Cinq fronts, dans l'ordre du cours. Tu ne coches pas seul : pour chaque point, tu vérifies ce qui est vérifiable (via `/audit-securite` et les advisors) et tu demandes confirmation pour ce qui se règle dans un dashboard.

## Comment dérouler

1. Propose de lancer **`/audit-securite`** d'abord : il couvre automatiquement les fronts Code et Base de données (secrets, RLS, advisors, code mort) et produit `/reviews/security-audit.md`.
2. Reprends les cases une par une. Coche celles couvertes par le rapport ; marque « à confirmer » celles qui dépendent d'un réglage dashboard (Auth Supabase) ou d'une action manuelle.
3. Ne déclare **PRÊT** que si les 5 fronts sont au vert, aucun 🔴 bloquant restant.

## Front 1 — Code
```
[ ] Aucune clé secrète derrière NEXT_PUBLIC_ ni dans un Client Component
[ ] Clés sk_ (Stripe) et service_role (Supabase) côté serveur uniquement
[ ] /security-review passé, points bloquants corrigés
[ ] Code mort supprimé (derrière des tests verts)
[ ] Aucun console.log résiduel qui fuite des données
```

## Front 2 — Base de données
```
[ ] Chaque table exposée a la RLS activée
[ ] Chaque table a une policy adaptée à chaque rôle (pas de using(true) involontaire)
[ ] Advisors Supabase, type sécurité, au vert
[ ] Vues security definer vérifiées (n'exposent pas de données client)
```

## Front 3 — Utilisateur
```
[ ] Longueur minimale de mot de passe relevée (8 à 10)
[ ] Protection contre les mots de passe fuités activée (HaveIBeenPwned)
[ ] Changement d'email sécurisé activé (double confirmation)
[ ] Changement de mot de passe sécurisé activé (réauthentification)
```
> Ces quatre points se règlent dans le dashboard Supabase Auth (OFF par défaut). Non vérifiables en code : demande confirmation à l'utilisateur.

## Front 4 — Performance
```
[ ] Advisors Supabase, type performance, traités (index, N+1)
[ ] Pas de fetch-all : agrégats là où la liste est longue
[ ] Core Web Vitals mesurés (LCP, INP, CLS)
[ ] Dette consolidée par un refactoring derrière des tests verts
```

## Front 5 — Environnement
```
[ ] Base de test séparée de la production
[ ] Recette sur un preview ou un domaine de test, jamais sur la prod
[ ] Migrations validées en test avant promotion en production
```

## Verdict

- Toutes les cases cochées → **PRÊT POUR MISE EN LIGNE**. Enchaîne avec `/ship-feature`.
- Un ou plusieurs 🔴 restants → **PAS PRÊT**. Liste ce qui bloque, propose de re-`developer` puis de relancer `/audit-securite`.

> Une checklist qu'on garde dans sa tête est une checklist qu'on oublie sous pression. Celle-ci, Claude la déroule avec toi à chaque lancement.
