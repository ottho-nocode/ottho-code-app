# Design

> Système visuel d'Ottho Builder 2 (dossier `builder/` du plugin `ottho-code-app`), l'interface `web/` (thèmes sombre et clair Ottho). Les valeurs vivent dans `web/src/styles.css`. Le plugin livre l'interface construite (`builder/dist/`, versionné) : après une modification, `npm run build` puis committer `dist/` avec elle.

## Visual Theme

Deux thèmes, **sombre** (défaut si le système est sombre) et **clair**, basculés par le bouton « Clair / Sombre » de la barre du haut (choix mémorisé dans le navigateur, posé avant le premier rendu par `index.html`). Identité Ottho « spectacle » dosée pour un outil : le dégradé chaud orange-rouge des présentations Ottho pour la marque et ce qui attend l'élève, **le violet pour les boutons**, un bleu pour ce qui travaille. Le spectacle suit l'état : la scène des agents s'éclaire (halo bleu) quand un agent tourne, la carte active respire, le passage de main s'anime. Au repos, tout reste calme.

Scène d'usage : un élève Ottho, souvent le soir sur son portable, l'app ouverte par le plugin à côté de son terminal Claude Code, qui veut sentir qu'il dirige une équipe d'agents. L'app se lit ; il répond, valide et écrit son brief dans le terminal.

## Color

Stratégie : Restrained pour la structure, Committed ponctuellement sur l'action. Chaque token existe en sombre (`:root[data-theme="dark"]`) et en clair (`:root[data-theme="light"]`) ; aucune couleur n'est écrite en dur dans les règles.

| Rôle | Token | Valeur |
|---|---|---|
| Fond | `--bg` / `--bg-deep` | oklch(0.155 0.012 285) / oklch(0.125 0.012 285) |
| Surfaces | `--surface-1..3` | oklch(0.19 → 0.27, teinte 285) |
| Traits | `--line` / `--line-soft` | oklch(0.34 …) / oklch(0.27 …) |
| Texte | `--text` / `--text-2` / `--muted` / `--faint` | 0.94 / 0.82 / 0.69 / 0.54 |
| Marque, à toi d'agir (chaud) | `--warm-1..3`, `--warm-grad` | #fb923c → #f97316 → #ef4444 en OKLCH (plus sombres en clair) |
| Actions, boutons (violet) | `--act-1`, `--act-2`, `--act-grad`, `--act-tint` | oklch(0.66 0.21 302) → oklch(0.56 0.25 290) |
| Un agent travaille (bleu) | `--run` | oklch(0.74 0.14 250) en sombre, oklch(0.52 0.17 254) en clair |
| Fait | `--ok` | oklch(0.8 0.14 163) |
| À corriger | `--ko` | oklch(0.7 0.19 22) |
| Modèles | `--opus`, `--sonnet`, `--haiku` | magenta, cyan, vert |

Règle de sens : violet = on peut cliquer (boutons, sélection, focus) ; chaud = marque et ce qui attend l'élève (pastilles, bandeau) ; bleu = en cours ; vert = fait. Jamais la couleur seule : chaque état a aussi un symbole ou un texte (✓, ◉, « à valider », « 2 ? »).

## Typography

- UI : Inter Variable (embarquée via `@fontsource-variable/inter`).
- Données, étiquettes, chemins, heures : JetBrains Mono 400/500/600 (`@fontsource/jetbrains-mono`).
- Étiquettes de section (`.eyebrow`) : mono 11px, capitales, interlettrage 0.1em, orange chaud.
- Échelle : 11 / 12 / 13 / 14 (base) / 15 / 17 / 18. Titres en 650, interlettrage négatif léger.

## Layout

- Coquille pleine hauteur (100vh, rien ne défile au niveau de la page) : barre du haut ; colonne de gauche 30 % (livrables, charte, questions, défile seule) ; zone de droite 70 % : bandeau, scène (hauteur restante), journal et features (28vh).
- Barre du haut : boutons bascules Aperçu (▶), Documents (▤), Config (⚙), Journal (◷), Features (▦), thème. Teinte violette = section ou panneau affiché. Journal et Features cachent ou réaffichent leur section du bas ; les deux cachés, le graphe prend toute la hauteur (réglage mémorisé). Sous 1480 px de large, les boutons ne gardent que leur icône (nom en info-bulle et pour le clavier) et le nom du projet est tronqué.
- Colonne de gauche réglable : poignée sur sa bordure (glisser, double-clic = 30 %, flèches au clavier, de 280 px à la largeur qui laisse 560 px à la scène) et bouton « ‹ » pour la fermer. Fermée, elle devient une barre de 44 px (« › », nombre d'éléments en attente, « À faire » vertical) et la scène prend toute la largeur. Choisir un agent, ouvrir « Documents » ou un fichier la rouvre. Largeur et état mémorisés dans le navigateur.
- Scène du canevas : remplace graphe, journal et features quand on ouvre les maquettes du designer (écrans à leur position Claude Design, déplacement et zoom).
- Aperçu : bouton « Aperçu » de la barre du haut (pastille verte quand l'app du projet tourne). S'ouvre en colonne à droite, pleine hauteur, réglable comme celle de gauche (poignée, « › » pour fermer) ; l'élargir resserre d'abord la colonne de gauche, la scène garde toujours 560 px. Barre d'état (en ligne, démarrage, erreur), adresse locale et actions en icônes : ↻ recharger, ↗ autre onglet, ⤢ en grand (remplace graphe, journal et features ; « ⤡ Réduire » la remet à droite), ■ arrêter, × fermer. Arrêté : une phrase dit ce qui sera lancé et un bouton violet « Lancer l'aperçu ». Site statique rechargé quand un agent modifie le code.
- Rayons : 8 / 12 / 16 px ; cartes d'agent 14 px ; pastilles en pilule.

## Components

- Boutons : primaire en dégradé violet (texte clair `--on-act`), fantôme sur `--surface-2`, « scène » et bascule de thème teintés violet. Hauteur 32 à 40 px.
- Carte d'agent : surface en dégradé vertical, trait fin ; en cours = trait bleu + respiration ; fait = trait vert + ✓ ; sélection = anneau violet ; pastilles « à valider » (contour chaud) à gauche, « N ? » (plein chaud) à droite.
- Robots des agents : pixel art Ottho repris de la page du webinar (`web/src/assets/robots/`, têtes et robots entiers). Tête de 56 px dans une vignette teintée de la couleur du robot à gauche de chaque carte ; en cours, la tête flotte doucement et la vignette prend le trait bleu. Robot entier (96 px) dans la fiche de l'agent, tête dans le bandeau (44 px) et dans le journal (20 px). security-auditor, absent de la page, reprend code-reviewer (la loupe) passé au rouge. Un agent sans robot (autre plugin) garde la carte sans vignette.
- Onboarding (nouveau projet) : canevas du module « De l'idée au projet validé » dans la scène, en lecture (Claude le remplit avec l'élève dans le terminal et écrit `docs/brief.md` ; le canevas se met à jour seul). Sous l'en-tête : « n/6 blocs remplis » et barre d'avancement (chaude, verte une fois complète), prompt de cadrage en mono violet et bouton « Copier le prompt de cadrage ». Les six blocs en cartes (grille) : titre numéroté, « ✓ rempli » (vert, trait vert) ou « à remplir » (chaud), consigne en italique, champs remplis (libellé mono en capitales, valeur), personas en encadrés, critères du cours repliés (« Ce que brainstorming vérifiera »). Posture dans un encadré chaud en bas. S'ouvre de lui-même sur un projet neuf ; l'étape Brief de la phase projet le rouvre.
- Phase projet (colonne de gauche, projet sans feature) : frise verticale Brief → Vision → PRD → Design → Architecture → Infra → 1re feature ; pastille ✓ verte (fait), ◉ bleue (en cours), « ! » chaude (à valider), étape suivante encadrée en chaud ; clic = brief ou agent de l'étape. Le bandeau donne la prochaine étape du projet.
- Configuration (bouton ⚙ Config, colonne de gauche) : une section par service (Supabase, Stripe, Brevo, Resend) puis « Autre variable ». Chaque champ : libellé, état « ✓ défini » (vert) ou « manquant » (chaud), nom exact de la variable en mono, « retirer » avec confirmation. Secrets en champ masqué, jamais préremplis ; valeurs publiques (URL) préremplies. Conseil de forme en chaud sous le champ (clé de production Stripe…). « Remplir avec Claude (copier le prompt) » pour Supabase (prompt à coller dans le terminal Claude, qui passe par son MCP), liens « Où les trouver ». La section Base de données y renvoie (« Configurer → »).
- Base de données (colonne de gauche, vue « À faire ») : ligne « App » (projet Supabase ou hôte lu dans les .env, lien « Ouvrir ↗ » vers le tableau de bord Supabase) et ligne « Agents » (projet visé par chaque source Supabase, ou « tous les projets de ton compte »). Alerte chaude si les agents peuvent atteindre la prod ou si l'app et les agents ne visent pas le même projet.
- Services externes (MCP) : pastilles mono sous les outils de la carte. « ✓ Supabase » trait plein vert = déclaré dans une configuration ; trait vert pointillé = connecteur claude.ai à vérifier ; « ⚠ Notion » chaud = connecteur à authentifier ; « +N » pointillé gris = services possibles non branchés. La fiche détaille chaque service (d'où il vient) et donne la commande `claude mcp add` à copier pour ceux qui manquent.
- Notifications de la session principale (Claude Code, dans le terminal de l'élève) : au-dessus du bandeau, même cadre à bord chaud. « Claude attend ta réponse dans ton terminal Claude » : pastille « ? », questions numérotées (celles du sélecteur de Claude Code ou de la fin de son message) ; pour les questions en texte, « Copier « Suivre tes recos » » (fantôme) copie le prompt qui laisse l'IA trancher (dans le sélecteur, ce choix est ajouté par le plugin, une ligne le rappelle). « Claude attend ton autorisation dans ton terminal Claude » : pastille « ⏸ », message de Claude Code. Disparaissent dès que tu as répondu.
- Bandeau : bord en dégradé (chaud à faire, bleu-violet en cours, vert fini), étiquette « Prochaine étape » en mono. Ses actions copient le prompt à coller dans le terminal Claude (« Copier le prompt pour Claude », de relance, du designer) ; le bouton affiche « Copié » un instant.
- Questions des agents : cartes teintées chaud, en lecture (« À répondre dans ton terminal Claude ») ; répondues : ✓ et leur réponse, ou « répondue dans le terminal ».
- Livrables (colonne de gauche) : état « ✓ Validé le … » (vert), « À valider : dis-le à Claude dans ton terminal » (chaud) ou « Non validé », chemin du fichier en mono. À valider : encadré chaud et bouton violet « Copier « Je valide » » (Claude note la validation dans l'« Historique » du fichier). Lecture en Markdown rendu dans un cadre `--bg-deep` qui défile seul (« Relire » / « Masquer »), ouverte d'office tant que le livrable n'est pas validé.
- Éléments de marque (designer) : encadré pointillé « Glisse tes fichiers (logo, polices, charte en PDF, maquettes) dans ton terminal Claude », puis les images en vignettes et les autres fichiers en liste (étiquette de type, taille).
- Écrans de canevas : aperçu statique en cadre isolé sans script, sur fond clair, ombre portée.
- Maquettes du projet (écrans clés, niveau projet) : rattachées à la charte du designer (`design/projet/`, canevas copié de Claude Design, ou pages HTML de `design/maquettes/`) ; « Voir le canevas en grand » ouvre la scène « Maquettes du projet ». Liens de la charte libellés d'après leur ligne : « Ouvrir les maquettes » ou « Ouvrir le design system dans Claude Design ».

## Motion

150 à 250 ms, courbe ease-out (`--ease`). Seuls mouvements continus : respiration de l'agent en cours, pastille « en direct », passage de main animé. Tout est coupé si le système demande moins de mouvement.
