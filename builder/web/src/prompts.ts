// Prompts partagés, copiés par l'app pour être collés dans le terminal Claude.

// Cadrage d'un nouveau projet : renvoie Claude à la procédure du plugin (skill project-bootstrap,
// étape 0) : exemples de brief enregistrés d'abord, sinon les six blocs du canevas, puis docs/brief.md.
export const BRIEF_PROMPT =
  "Lance le cadrage du projet avec la méthode Ottho (skill project-bootstrap, étape 0) : propose-moi d'abord les exemples de brief enregistrés, sinon pose-moi les 6 blocs du canevas un par un, puis écris docs/brief.md.";

// Questions en texte : laisser l'IA trancher (dans le sélecteur, le plugin ajoute ce choix).
export const FOLLOW_RECO_PROMPT =
  "Suis tes recommandations pour ces questions : tranche selon la recommandation par défaut de chacune et consigne-la comme réponse dans le livrable concerné.";

// Validation d'un livrable : Claude la note en fin d'« Historique » du fichier, lu par l'app.
export const validatePrompt = (label: string, file: string) => `Je valide ${label} (${file}).`;
