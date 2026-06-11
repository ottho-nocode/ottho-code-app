# Changelog

Tous les changements notables de ce plugin sont documentés ici. Format basé sur [Keep a Changelog](https://keepachangelog.com/) et le plugin respecte le [SemVer](https://semver.org/).

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
