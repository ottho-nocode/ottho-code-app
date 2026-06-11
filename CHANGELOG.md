# Changelog

Tous les changements notables de ce plugin sont documentés ici. Format basé sur [Keep a Changelog](https://keepachangelog.com/) et le plugin respecte le [SemVer](https://semver.org/).

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
