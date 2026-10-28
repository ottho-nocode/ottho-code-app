# Ottho Builder 2

> Inclus dans le plugin Claude Code `ottho-code-app` (dossier `builder/`) : rien à installer ni à publier sur npm, l'interface est déjà construite (`builder/dist/`).

App locale qui affiche, à côté de Claude Code, le pipeline des agents SDD du plugin Claude Code `ottho-code-app` :

- la carte des agents (plugin et projet), lue depuis leurs fichiers `.md`, avec leur robot et les services externes (Supabase, Stripe…) branchés ou non ;
- l'agent que Claude Code fait tourner, en direct, et l'historique de chacun (fichiers produits, questions, compte rendu) ;
- l'avancement de chaque feature `US-XX` (spec, plan, code, review, tests, merge) et la prochaine étape, avec le prompt à copier pour Claude ;
- les questions des agents et les livrables à relire (spec, charte, maquettes, plan), validés ou non ;
- le brief du projet (canevas en six blocs), bloc par bloc ;
- tous les documents Markdown du projet (bouton « Documents ») ;
- la configuration des services de l'app, Supabase, Stripe, Brevo, Resend (bouton « Config », écrit dans `.env.local`) ;
- l'app que les agents construisent (bouton « Aperçu »).

L'app se lit ; tout le reste se passe dans le terminal Claude Code. Tu y réponds aux questions des agents, tu y valides un livrable en le disant à Claude (il le note dans l'« Historique » du fichier, que l'app lit), Claude y écrit le brief avec toi (sous-commande `brief`) et range dans `design/assets/` les fichiers que tu glisses dans le terminal (logo, polices, charte, maquettes). Les boutons de l'app copient le prompt à coller.

Deux écritures seulement depuis l'app : les variables des services dans `.env.local` (droits 600, ajouté au `.gitignore` s'il ne l'est pas, noms sans valeurs dans `.env.example` ; les secrets ne repartent jamais vers le navigateur, l'app n'affiche que « défini » ou « manquant ») et le lancement ou l'arrêt du serveur local de l'aperçu (bouton « Lancer l'aperçu » : site statique servi par l'app, ou `npm run dev`, sur 127.0.0.1, port 3100 ou le suivant libre), qui s'arrête avec l'app.

## Lancer

Rien à lancer à la main : quand Claude Code démarre dans un projet Ottho (ou un dossier vide), le plugin `ottho-code-app` démarre Ottho Builder 2 pour ce dossier et l'ouvre dans le navigateur ; une session suivante réutilise le Builder déjà lancé. Il s'arrête seul 30 minutes après la fermeture du dernier onglet. Depuis Claude Code, `/pipeline` (ou `/ottho-code-app:pipeline`) rouvre le navigateur, ou démarre le Builder s'il ne tourne pas.

À la main (`<plugin>` : dossier du plugin, celui qui contient `builder/`) :

```bash
node <plugin>/builder/bin/cli.mjs --project <dir>            # options : --plugin <dir> --port 4317 --no-open --idle-exit <min>
node <plugin>/builder/bin/cli.mjs --project <dir> --reopen   # rouvre le navigateur sur le Builder du projet, sans rien lancer
```

`--idle-exit <min>` arrête le Builder quand aucun onglet n'est ouvert depuis ce nombre de minutes (le plugin passe 30). Sans `--plugin`, les agents affichés sont ceux du plugin qui contient le Builder (sinon ceux du plugin installé).

Le brief, écrit par Claude depuis le terminal (le hook de démarrage du plugin lui donne la commande exacte ; `--project <dir>` pour un autre dossier) :

```bash
node <plugin>/builder/bin/cli.mjs brief --list               # exemples enregistrés dans ~/.ottho-pipeline/briefs
node <plugin>/builder/bin/cli.mjs brief --preset <nom>       # docs/brief.md depuis un exemple
node <plugin>/builder/bin/cli.mjs brief --json <fichier>     # docs/brief.md depuis un JSON (les six blocs)
node <plugin>/builder/bin/cli.mjs brief --save <nom>         # le brief du projet devient un exemple, dans ~/.ottho-pipeline/briefs
```

Un seul mode à la fois. `--save` refuse un brief absent, vide ou écrit à la main (sans les données du canevas) ; un exemple du même nom est remplacé.

Un brief vide ne remplace jamais un brief rempli ; la version remplacée est gardée dans `.claude/brief-backups/`.

`~/.ottho-pipeline` ne garde que les exemples de brief (`briefs/`). Un ancien `~/.ottho-pipeline/engine.json` (écrit par `npx ottho-pipeline --install`, versions précédentes) ne sert plus : tu peux le supprimer.

## Développer

Le serveur n'a aucune dépendance à l'exécution (modules intégrés de Node 20 ou plus) ; `npm ci` n'installe que les outils de build et de test. `dist/` est versionné : après une modification de `web/`, reconstruis-le et committe-le avec la modification.

```bash
cd builder && npm ci && npm run build && npm test && npx playwright test
npm run typecheck             # types de l'interface (web/)
npm run demo                  # crée un projet de démo et affiche son chemin
node bin/cli.mjs --project <chemin-demo> --no-open   # API sur :4317
npm run dev:web               # interface sur :3100 (proxy /api vers :4317)
```

À la racine du plugin, `node --test` passe aussi les tests serveur du Builder (`builder/server/*.test.mjs`).
