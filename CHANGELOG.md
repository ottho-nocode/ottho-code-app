# Changelog

Tous les changements notables de ce plugin sont documentés ici. Format basé sur [Keep a Changelog](https://keepachangelog.com/) et le plugin respecte le [SemVer](https://semver.org/).

## [1.2.0] — 2026-10-29

### Modifié

- **Agent `tester` v2 : recette filmée et analysée.** Ajout de `mcp__playwright__*` dans `tools` (navigateur en direct, facultatif). Pour chaque critère Given-When-Then joué dans un navigateur, il écrit un test Playwright, active `video: 'on', screenshot: 'on', trace: 'on'` dans `playwright.config.ts`, puis **regarde lui-même les preuves** : il ouvre chaque capture, découpe chaque vidéo en images avec `ffmpeg` (`fps=2`) et cherche ce qu'aucune assertion ne teste (texte coupé, élément qui déborde, montant mal formaté, erreur affichée). Nouveau verdict `PASS ⚠` (assertions vertes, anomalie visible). Il rend un rapport de recette `/reviews/test-report-US-XX.md` (verdict, preuves et observation par critère, sections Échecs et Points visuels à vérifier). Vidéos, captures et traces restent hors de Git.
- **`/validate-feature`** : enchaîne les tests E2E filmés, l'analyse visuelle et le rapport de recette ; s'arrête sur les `PASS ⚠` pour demander « corriger ou accepter ».
- **README** : rôle de `tester` mis à jour, MCP Playwright et `ffmpeg` documentés comme facultatifs pour `tester`.

Support du cours academy **« Tester ton app »** (Claude for Builders). Avant cette version, l'élève devait modifier lui-même le fichier de l'agent, et `claude plugin update` écrasait sa modification.

## [1.1.0] — 2026-07-21

### Ajouté

- **Agent `security-auditor`** (10e agent) : Opus, lecture seule (`disallowedTools: Write, Edit`), `tools: Read, Glob, Grep, Bash, mcp__supabase__get_advisors`. Balaie tout le projet sur les failles transverses (secrets exposés, `NEXT_PUBLIC_` mal placé, `service_role` côté client, RLS manquante, policies trop permissives, code mort) et croise le code avec les advisors Supabase. Dicte un rapport classé bloquant / important / mineur (il n'écrit pas lui-même).
- **Slash command `/audit-securite`** (5e commande) : orchestre `security-auditor` sur l'ensemble du projet et écrit le rapport dans `/reviews/security-audit.md`, avec récap par gravité et verdict PRÊT / CORRECTIONS REQUISES.
- **Skill `security-checklist`** (4e skill) : la liste de contrôle avant mise en ligne (5 fronts : code, base, utilisateur, performance, environnement), chargée automatiquement quand tu prépares un lancement. Se combine avec `/audit-securite` pour la partie automatisable.

Support du cours academy **« Sécurité & bonnes pratiques »** (Claude for Builders). Rien de cassant : les composants existants sont inchangés.

## [1.0.2] — 2026-06-12

### Modifié

- **MCP non installés par défaut** : le plugin n'embarque plus de `.mcp.json`. Les 9 MCP (github, vercel, supabase, stripe, brevo, resend, notion, figma, context7) restent recommandés et documentés dans le README, avec des blocs `.mcp.json` prêts à copier par projet. Fini les serveurs « Failed to connect » dans les projets qui n'en ont pas l'usage.
- **`userConfig` retiré** (`github_token`, `brevo_api_key`, `resend_api_key`) : il n'alimentait que le `.mcp.json` embarqué. Les clés passent désormais par les variables d'environnement du projet (cf README).

### Corrigé

- **`branch-guard.sh`** : le hook lisait toujours la branche du projet courant (`CLAUDE_PROJECT_DIR`), même quand la commande git visait un autre repo (`cd /tmp/x && git commit`, `git -C /tmp/x commit`) — blocages à tort. Il résout désormais le repo cible de chaque commande git (suivi des `cd`, support de `git -C`) et n'applique la garde qu'au repo du projet courant. Bonus : un message de commit contenant « git push origin main » ne déclenche plus le bloc push.

## [1.0.1] — 2026-06-11

### Corrigé

- **`rls-watch.sh`** compatible bash 3.2 / macOS : suppression de `mapfile` (bash 4+) et de `sleep infinity` (non supporté par le sleep BSD). Le monitor plantait systématiquement sur macOS (exit 127 / usage error).

## [1.0.0] — 2026-05-13

### Ajouté

- **9 agents spécialisés** : `brainstorming`, `spec-writer`, `designer`, `architect`, `developer`, `code-reviewer`, `tester`, `devops`, `doc-writer`.
- **3 skills** : `agency-method`, `project-bootstrap`, `sdd-feature-cycle`.
- **4 slash commands** : `/init-agency-project`, `/new-feature`, `/validate-feature`, `/ship-feature`.
- **10 MCP préconfigurés** : `github`, `vercel`, `supabase`, `stripe`, `brevo`, `resend`, `notion`, `figma`, `pencil`, `context7`.
- **3 hooks de sécurité Git** : `branch-guard.sh` (anti-commit direct main/develop), `git-safe.sh` (anti-reset --hard / push --force), `secret-scan.sh` (anti-fuite de clés API et de fichiers .env).
- **5 templates** : `CLAUDE.md`, `PRD`, fiche feature SDD, plan technique, `.gitignore`.
- **Monitor expérimental** (prêt, non-wiré) : `supabase-rls-watch` qui alerte si une migration crée une table sans RLS. À activer manuellement quand le CLI supporte le champ `experimental.monitors` (cf README).
- **`userConfig`** pour 6 credentials (Supabase, Stripe, Brevo, Resend, Notion, Vercel) — stockage keychain via `sensitive: true`.
- README complet avec installation, premiers pas, cycle SDD, conventions Git, et désinstallation.
