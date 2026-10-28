# Ottho Builder 2

> Paquet npm et commande : `ottho-pipeline`.

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

Une fois, enregistre Ottho Builder 2 pour le plugin :

```bash
npx ottho-pipeline --install   # écrit ~/.ottho-pipeline/engine.json, ne lance rien
```

Ensuite, rien à lancer à la main : quand Claude Code démarre dans un projet Ottho (ou un dossier vide), le plugin `ottho-code-app` démarre Ottho Builder 2 pour ce dossier et l'ouvre dans le navigateur ; une session suivante réutilise le Builder déjà lancé. Il s'arrête seul 30 minutes après la fermeture du dernier onglet. Depuis Claude Code, `/ottho-code-app:pipeline` rouvre le navigateur.

À la main, dans le dossier du projet :

```bash
npx ottho-pipeline            # options : --project <dir> --plugin <dir> --port 4317 --no-open --idle-exit <min>
npx ottho-pipeline --reopen   # rouvre le navigateur sur le Builder du projet, sans rien lancer
```

`--idle-exit <min>` arrête le Builder quand aucun onglet n'est ouvert depuis ce nombre de minutes (le plugin passe 30). Chaque lancement à la main enregistre aussi le Builder (`~/.ottho-pipeline/engine.json`, lu par le plugin) : après un premier `npx ottho-pipeline`, `--install` n'est pas nécessaire. Une ancienne app « Ottho Builder 2 » dans `~/Applications` (versions précédentes de `--install`) ne sert plus : `--install` la signale, tu peux la supprimer. Désinstaller : supprimer `~/.ottho-pipeline`.

Le brief, écrit par Claude depuis le terminal (`--project <dir>` pour un autre dossier) :

```bash
npx ottho-pipeline brief --list               # exemples enregistrés dans ~/.ottho-pipeline/briefs
npx ottho-pipeline brief --preset <nom>       # docs/brief.md depuis un exemple
npx ottho-pipeline brief --json <fichier>     # docs/brief.md depuis un JSON (les six blocs)
npx ottho-pipeline brief --save <nom>         # le brief du projet devient un exemple, dans ~/.ottho-pipeline/briefs
```

Un seul mode à la fois. `--save` refuse un brief absent, vide ou écrit à la main (sans les données du canevas) ; un exemple du même nom est remplacé.

Un brief vide ne remplace jamais un brief rempli ; la version remplacée est gardée dans `.claude/brief-backups/`.

## Développer

```bash
npm install
npm test                      # tests serveur (node:test)
npm run demo                  # crée un projet de démo et affiche son chemin
node bin/cli.mjs --project <chemin-demo> --no-open   # API sur :4317
npm run dev:web               # interface sur :3100 (proxy /api vers :4317)
npm run test:e2e              # build + test Playwright
```
