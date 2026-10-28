// Version minimale de Node pour le Builder (fetch, AbortSignal.timeout, parseArgs…). Vérifiée par
// bin/cli.mjs avant de charger le serveur : syntaxe volontairement simple, lisible par un vieux Node.
export const MIN_NODE_MAJOR = 20;

// Message d'erreur si Node est trop ancien, sinon null (version illisible : pas de blocage).
export function nodeVersionError(version = process.versions.node) {
  const major = parseInt(String(version).split(".")[0], 10);
  if (!(major < MIN_NODE_MAJOR)) return null;
  return "Ottho Builder 2 demande Node " + MIN_NODE_MAJOR + " ou plus (version actuelle : " + version + ").";
}
