# Changelog

Tous les changements notables de ce plugin sont documentés ici. Format basé sur [Keep a Changelog](https://keepachangelog.com/) et le plugin respecte le [SemVer](https://semver.org/).

## [1.2.0] — 2026-09-26

### Ajouté

- **Commande `/pipeline`** (6e commande) : rouvre l'app locale `ottho-pipeline` si elle tourne (`--reopen`), sinon explique comment la lancer dans un terminal ordinaire (`npx ottho-pipeline`) : l'app embarque un terminal Claude Code, elle ne doit donc pas dépendre d'une session Claude Code.
- **Hooks `PreToolUse` / `PostToolUse` sur les sub-agents** : journalisent début, fin, agent recommandé, verdict et questions du bloc « Questions pour toi » dans `.claude/pipeline-events.jsonl` (métadonnées seulement, jamais bloquant, sans effet si Node est absent).

### Modifié

- **Les 10 agents** : section « Questions pour l'utilisateur » (bloc `Questions pour toi :` en fin de réponse quand une réponse est nécessaire pour avancer).
- **Agent `tester`** : termine toujours par `Verdict tests : VERTS` ou `Verdict tests : ROUGES`.
- **Agent `designer`** : maquettes dans Claude Design (outil `Artifact`) si le compte l'a, sinon Pencil (noms d'outils mis à jour pour le serveur Pencil actuel : `get_app_state`, `read_skill`, `get_style`, `execute`), sinon texte. Livrable `/design/US-XX-<slug>.md` avec la ligne `> Maquettes : …` ; copie des écrans du canevas dans `/design/US-XX-<slug>/` (aperçu dans `ottho-pipeline`).
- **Agent `developer`** : lit les maquettes du designer (outil `Artifact` en lecture, ou serveur Pencil) et applique `/design/charte.md`.
- **Éléments de marque** : `/design/assets/` (logo, images, polices, charte en PDF déposés depuis `ottho-pipeline`) ; lus par le designer (charte, assets du canevas) et repris par le développeur.
- **Charte graphique** : `/design/charte.md` (source, dans le dépôt) + design system Claude Design tiré d'elle et installé dans chaque canevas. Sans charte, le designer la demande toujours d'abord (couleurs, polices, logo, références) et s'arrête ; il n'en propose une que si l'utilisateur n'en a pas, puis attend sa validation avant toute maquette.
- **Agent `spec-writer`** : questions ouvertes au format `- [ ] question ?`, reprise de `docs/questions/US-XX.md`, passage de main au format standard « Prochaine étape recommandée ».
- **Template `.gitignore`** : ignore `.claude/pipeline-events.jsonl`.

- **Questions du terminal central dans le pipeline** : hooks `Stop` (questions de fin de tour de la session principale : bloc « Questions pour toi », liste de questions ou dernière phrase interrogative), `UserPromptSubmit` (l'utilisateur a répondu, sans le contenu de son message) et `Notification` `permission_prompt` (Claude attend une autorisation). L'app les affiche en notification et peut envoyer la réponse au terminal intégré.

- **Brief du projet** : `brainstorming` part de `docs/brief.md` (onboarding d'Ottho Builder 2, canevas en six blocs du module « De l'idée au projet validé »), coche les critères de chaque bloc et ne pose que les questions qui manquent ; `spec-writer` s'en sert pour le PRD ; `project-bootstrap` le transmet, fait écrire `docs/architecture.md` et accepte la validation du PRD et de l'architecture faite dans le pipeline. Le modèle de PRD a une section « Historique ».

### Corrigé

- **Le designer n'intervenait pas au démarrage d'un projet** : `project-bootstrap` et `/init-agency-project` passent en 5 étapes, avec `designer` (charte demandée d'abord, design system, maquettes des écrans clés) entre le PRD et l'architecture.
- **Questions : un seul canal, le terminal** (plus de double réponse app / terminal). `PreToolUse` `AskUserQuestion` journalise les questions posées (Ottho Builder 2 ouvre le terminal) ; la méthode demande de consigner chaque réponse dans le livrable concerné.

- **Réponses données dans Ottho Builder 2 ignorées par la session principale** (elle lançait l'agent suivant avec ses propres hypothèses) : à chaque message de l'utilisateur, `answered-guard` ajoute au contexte les réponses consignées depuis le dernier tour, qui priment sur toute hypothèse. Chaque agent fait primer les réponses consignées sur les hypothèses de sa demande et signale les contradictions.

- **Questions reposées dans le terminal alors que l'utilisateur y avait répondu dans Ottho Builder 2** : nouveau hook `PreToolUse` `AskUserQuestion` (`scripts/answered-guard.mjs`) qui lit les réponses consignées (`docs/questions/*.md`, specs, PRD), refuse les questions déjà répondues et donne les réponses à Claude ; il ne repose que les autres. Dans l'autre sens, `PostToolUse` `AskUserQuestion` journalise les réponses données dans le sélecteur (événement `answered`) pour que l'app ne les laisse pas en attente. Consigne ajoutée au skill `agency-method`.

- **Questions coupées à 300 caractères** : une question longue (avec sa recommandation) arrivait tronquée dans le pipeline. Limite portée à 2 000 caractères, coupe sur un mot entier avec « … » au-delà ; une question numérotée suivie d'une recommandation est reconnue.

- **Les agents peuvent enfin utiliser les MCP que leurs consignes citent.** La ligne `tools:` d'un sous-agent est une liste fermée : devops, developer, architect, spec-writer, doc-writer et brainstorming parlaient de GitHub, Vercel, Supabase, Context7 ou Notion sans y avoir accès. Chaque agent reçoit désormais les services de son métier, par serveur entier (`mcp__supabase`) et sous le nom du connecteur claude.ai (`mcp__claude_ai_Supabase`). security-auditor ne dépend plus du nom exact du serveur Supabase.
- **Actions payantes ou destructives retirées** (`disallowedTools`) : créer un projet ou une branche Supabase, confirmer un coût, fusionner, réinitialiser, mettre en pause ; achats Vercel. architect et security-auditor lisent Supabase sans pouvoir l'écrire. Stripe : compte de test exigé, arrêt sur `livemode: true`.
- README : colonne « Utilisé par », garde-fous (`?project_ref=` du projet de dev, noms de serveurs à garder), conduite quand un service manque. Test `tests/agents-tools.test.mjs` : cohérence entre consignes et outils accordés.

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
