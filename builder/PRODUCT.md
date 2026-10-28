# Product

## Register

product

## Users

Les élèves de la formation Ottho « Claude for Builders », souvent débutants en développement. L'app s'ouvre d'elle-même sur leur ordinateur portable quand ils lancent Claude Code dans leur projet, à côté de leur terminal, pendant qu'ils appliquent la méthode SDD du plugin `ottho-code-app` (souvent le soir ou le week-end, en suivant le cours). Leur travail : comprendre où en est chaque feature, quel agent lancer ensuite, voir les questions des agents, relire les livrables (spec, charte, maquettes, plan) sans se perdre dans les fichiers ; ils répondent, valident et écrivent leur brief dans le terminal Claude Code.

## Product Purpose

Nom : **Ottho Builder 2** (paquet et commande `ottho-pipeline`). Rendre visible une équipe de 10 agents qui travaillent pour l'élève : qui tourne, qui attend quoi, ce qu'il faut valider. L'app guide sans piloter : lancée par le plugin au démarrage de Claude Code (enregistrée une fois pour lui avec `npx ottho-pipeline --install`), elle se lit et donne le prompt à coller dans le terminal ; réponses, validations, brief et fichiers de marque passent par Claude Code. Ses seules actions : la configuration des services (`.env.local`) et le lancement ou l'arrêt de l'aperçu. Réussite : l'élève sait toujours quoi faire ensuite, et il a le sentiment de diriger une équipe plutôt que de subir un outil.

## Brand Personality

Ottho, version spectacle : sombre, chaude, énergique. Le dégradé orange-rouge des présentations Ottho, Inter et JetBrains Mono, de la profondeur et un peu de lumière. Trois mots : vivant, chaleureux, maîtrisé. L'émotion visée : « mon équipe d'agents travaille, et je la dirige ».

## Anti-references

- Le tableau de bord corporate : gris froid, dense, austère, sans chaleur, tableaux partout.
- Le SaaS générique issu d'un template (cartes identiques en grille, dégradés violets).

## Design Principles

1. **Une scène, pas un tableau de bord** : les agents sont des personnages sur une scène ; l'agent actif et ce qui attend l'élève captent la lumière, le reste s'efface.
2. **Toujours une prochaine action** : chaque écran dit quoi faire maintenant (valider, répondre, lancer), au même endroit, avec le prompt à copier pour Claude.
3. **Le travail des agents en grand** : les livrables visuels (maquettes, canevas) prennent la place qu'ils méritent, pas des vignettes.
4. **La méthode se lit d'un coup d'œil** : les 4 phases SDD et les passages de main restent lisibles, même pour un débutant.

## Accessibility & Inclusion

Pas d'exigence formelle. Base conservée : contrastes de texte lisibles sur fond sombre, focus visibles, navigation clavier sur les boutons, animations coupées quand le système demande moins de mouvement, états jamais distingués par la seule couleur (symbole ou texte en plus).
