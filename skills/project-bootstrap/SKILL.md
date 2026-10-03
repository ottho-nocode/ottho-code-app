---
name: project-bootstrap
description: Use when the user wants to start a new agency project, init a project from scratch, bootstrap a Next.js/Supabase app, or asks how to set up a new client app; also for the project brief written from the terminal (brief du projet, canevas en 6 blocs, docs/brief.md, cadrage). Step 0 writes the brief, then it orchestrates the 5-step project-level SDD workflow (brainstorming → spec-writer → designer → architect → devops).
---

# Bootstrap projet — Ottho Code App

Quand l'utilisateur demande à **démarrer un nouveau projet** / **init projet** / **setup agence** / **bootstrap**, applique cette procédure.

## Pré-requis

- Le dossier courant est vide ou ne contient pas encore de code applicatif.
- Git n'est pas encore initialisé (sinon : vérifier l'état avec l'utilisateur avant de continuer).

## Étapes

### 0. Brief du projet (canevas en 6 blocs)

Le brief `docs/brief.md` suit le canevas en six blocs du module « De l'idée au projet validé » (formation Claude Builder). Il se remplit **ici, dans le terminal**, avant `brainstorming` ; Ottho Builder 2 l'affiche en lecture seule.

**La commande du brief** est donnée par le hook de démarrage dans le contexte de la session (« Pour écrire le brief du projet ») : `'<node>' '<cli>' brief --project '<dossier du projet>'` suivi d'**une seule** option, `--list`, `--preset <nom>` ou `--json <fichier>`. Lance-la avec l'outil Bash, telle quelle (chemins déjà échappés). Absente du contexte : compose-la avec `~/.ottho-pipeline/engine.json` (`{ "node": …, "cli": … }`). Fichier absent : le Builder n'est pas installé ; dis-le, propose `npx ottho-pipeline --install`, et laisse `brainstorming` faire le cadrage par questions.

1. **`docs/brief.md` complet** (nom du projet et premier champ de chaque bloc remplis ; données dans le commentaire `<!-- ottho-brief {…} -->` en fin de fichier) : annonce-le et passe directement à la transmission ci-dessous.
2. **Pas de brief** : propose d'abord les exemples enregistrés. Lance la commande avec `--list` (une ligne `slug<TAB>nom` par exemple, ou « Aucun exemple de brief enregistré. »). L'utilisateur en choisit un (Haircut, par exemple) : lance-la avec `--preset <slug>`, puis va au point 5.
3. **Sinon** (aucun exemple choisi, ou brief incomplet) : demande le nom du projet, puis pose les 6 blocs **un par message**, avec leur titre, leur consigne et leurs champs (tableau ci-dessous). Brief incomplet : repars de ses données (commentaire en fin de fichier) et ne pose que les blocs manquants. Le choix « Suivre tes recos » reste disponible (sélecteur, ou « suis tes recos » en toutes lettres) : propose alors toi-même le contenu du bloc, justifié en une ligne, et dis-le ; pour une persona que tu proposes, `interviews` vaut `"0"`. Ne vérifie pas les critères des blocs : c'est le travail de `brainstorming`.

   | Bloc | Clé | Consigne | Champs (clé : libellé) |
   |---|---|---|---|
   | Le domaine | `domaine` | Le terrain que tu apprécies ou maîtrises. | `domaine` : ton domaine / thème ; `legitimite` : ta légitimité (langage maîtrisé, audience connue, unfair advantage) |
   | Le problème | `probleme` | Un problème dur : douloureux, urgent, récurrent, et conscient. | `description` : le problème ; `vecu` : l'as-tu vécu toi-même ? ; `autres` : qui d'autre le vit (nommé) ? |
   | La cible quantifiable | `cible` | 5-10% d'un marché, 100k-1M de personnes, déjà en recherche. | `marche` : marché visé ; `pourcentage` : % du marché concerné ; `volume` : volume estimé (personnes) ; `recherche` : comment cherchent-ils déjà une solution ? |
   | La persona | `persona` (liste de 1 à 5) | Inventée puis comparée à de vrais utilisateurs. Plusieurs, jamais une seule. | `identite` : identité (prénom, âge, rôle, lieu) ; `contexte` : contexte (personnel / pro / techno) ; `objectifs` : 3 objectifs prioritaires ; `freins` : freins / craintes ; `techno` : profil techno ; `interviews` : nombre de personnes interviewées |
   | La solution | `solution` | Réalisable, formulée Modèle + Action + Comment. | `modele` : modèle (automatisation, mise en relation…) ; `action` : action ; `comment` : comment |
   | La phrase de valeur (Steve Blank) | `uvp` | J'aide [cible] à résoudre [problème] grâce à [solution]. | `phrase` : ta phrase (« J'aide … à résoudre … grâce à … ») |

4. **Écris les réponses** dans `<dossier du projet>/.ottho-brief.json` (chemin absolu, hors de `.claude/`), avec exactement ces clés, puis lance la commande avec `--json '<dossier du projet>/.ottho-brief.json'` :

   ```json
   {
     "name": "Nom du projet",
     "domaine": { "domaine": "", "legitimite": "" },
     "probleme": { "description": "", "vecu": "", "autres": "" },
     "cible": { "marche": "", "pourcentage": "", "volume": "", "recherche": "" },
     "persona": [
       { "identite": "", "contexte": "", "objectifs": "", "freins": "", "techno": "", "interviews": "" }
     ],
     "solution": { "modele": "", "action": "", "comment": "" },
     "uvp": { "phrase": "" }
   }
   ```

   Champ sans réponse : `""` (jamais de 0 ni de texte de remplissage). Une persona par objet de la liste ; aucune persona : `"persona": []`. Valeurs en texte (nombre accepté pour `interviews`) ; 300 caractères au plus pour `name`, `domaine.domaine`, `marche`, `pourcentage`, `volume`, `identite`, `interviews`, `modele`, `action` et `comment`, 5 000 pour les autres champs ; 5 personas au plus. Une autre clé est ignorée.
5. **Rends compte** : la commande affiche `<dossier>/docs/brief.md écrit (complet).` ou `… écrit (incomplet : <blocs manquants>).` Supprime alors `<dossier du projet>/.ottho-brief.json` et redonne cette ligne à l'utilisateur ; incomplet, nomme ce qui manque et propose de le compléter maintenant (sinon `brainstorming` posera les questions qui manquent). Un refus (champ invalide, brief rempli jamais remplacé par un brief vide) s'explique de lui-même : corrige le JSON et relance (le fichier n'est supprimé qu'après une écriture réussie). La version remplacée est sauvegardée dans `.claude/brief-backups/`.

Puis transmets `docs/brief.md` à `brainstorming` : il vérifie chaque bloc avec ses critères, challenge ce qui ne passe pas et ne pose que les questions qui manquent. Sans brief, `brainstorming` construit le cadrage par questions.

**Validations dans le terminal** : l'utilisateur valide le PRD, la charte et l'architecture ici, dans le terminal ; Ottho Builder 2 ne fait qu'afficher leur état. Sur son accord explicite (« je valide le PRD »), ajoute à la fin de la section `## Historique` du livrable la ligne `- AAAA-MM-JJ : Validé par l'utilisateur.` (section créée en fin de fichier si elle manque), puis passe à l'étape suivante. Ne valide jamais à sa place (voir `agency-method`, « Validations »).

### 1. Cadrage initial — `brainstorming`

Invoquer `brainstorming` (niveau projet) :
- Vision globale
- Personas cibles (1 à 3)
- Périmètre du MVP (3 à 5 fonctionnalités max)
- Analyse concurrentielle si pertinente

**STOP** — demander validation humaine.

### 2. PRD — `spec-writer`

Invoquer `spec-writer` (niveau projet) :
- Génère `/docs/PRD.md` à partir du template `${CLAUDE_PLUGIN_ROOT}/templates/PRD.md.template`
- Synthétise vision, personas, fonctionnalités MVP, contraintes, métriques de succès

**Puis lance `designer` tout de suite** (étape 3), sans attendre la validation du PRD : il pose ses questions (charte, maquettes existantes) pendant que l'utilisateur relit le PRD.

**STOP** : validation humaine du PRD, dans le terminal. Elle reste obligatoire avant `architect` (étape 4), et le designer ne dessine rien avant elle.

### 3. Design initial — `designer`

**Lance `designer` au premier plan, jamais en arrière-plan** (`run_in_background: false`) : il publie un canevas Claude Design (outil `Artifact`), ce qui demande l'autorisation de l'utilisateur, et le canevas s'ouvre alors dans son navigateur. En arrière-plan, la publication est refusée et il n'y a pas de maquettes visibles.

**Dès que `spec-writer` a rendu le PRD**, invoquer `designer` (niveau projet) sans attendre : il pose ses questions (charte, maquettes existantes) pendant que l'utilisateur relit le PRD. Il passe **avant** l'architecture : la stack et le découpage en composants dépendent de l'interface. Il ne dessine qu'une fois le PRD et la charte validés.
- Charte graphique `/design/charte.md` : il la **demande toujours d'abord** à l'utilisateur (couleurs, polices, logo, références) et s'arrête ; il n'en propose une que si l'utilisateur n'en a pas
- Puis design system de base (tokens, typographie, composants atomiques) et maquettes des écrans clés du parcours principal du MVP (`/design/projet/`)

**STOP** : validation humaine de la charte, dans le terminal, consignée dans l'« Historique » de `/design/charte.md`. Projet sans interface : étape sautée, dis-le.

### 4. Architecture initiale — `architect`

Seulement après la validation du PRD et, si le projet a une interface, de la charte. Invoquer `architect` (niveau projet) :
- Part du PRD, de la charte et des maquettes du designer
- Définit la stack (par défaut : Next.js 16 + Supabase + Brevo + Stripe + Vercel)
- Schéma BDD de base (tables, relations, **RLS obligatoire**)
- Conventions de code et de commits
- Génère `CLAUDE.md` à la racine du projet à partir de `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md.template`
- Rédige `/docs/architecture.md` (stack, schéma, conventions), terminé par une section `## Historique` : c'est le livrable que l'utilisateur valide
- Initialise l'arborescence : `/docs/`, `/specs/`, `/plans/`, `/docs/adr/`

**STOP** — validation humaine.

### 5. Setup infra — `devops`

Invoquer `devops` (niveau projet) :
- Init Git (si pas fait) + premier commit
- Branches `main` et `develop` + branch protections
- Création du repo GitHub (via MCP `github` si configuré)
- Création de **deux** projets Supabase (dev + prod, jamais le même)
- Connexion Vercel + preview deployments
- GitHub Actions : lint, typecheck, test, build
- `.env.example` avec toutes les variables documentées
- Page Notion projet si MCP `notion` configuré

### 6. Validation finale

À la fin du bootstrap, le projet contient :
- `CLAUDE.md` à la racine
- `/docs/PRD.md`, `/docs/architecture.md`, `/docs/devops.md`
- `/specs/` et `/plans/` vides (prêts à recevoir)
- Branches `main` et `develop` poussées
- CI verte sur le premier commit
- Preview Vercel fonctionnel
- Deux projets Supabase isolés

Annonce alors :

> Le projet est prêt. Tu peux maintenant lancer ta première feature avec `/new-feature "Titre de la première US"`.
