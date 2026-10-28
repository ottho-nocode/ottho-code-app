// Aperçu statique d'un écran de canevas Claude Design (fichier .dc.html rangé par
// le designer sous design/). Le canevas vivant ne peut pas être intégré (claude.ai
// interdit l'affichage en cadre) : on rend son balisage tel quel, sans aucun script,
// les réglages ({{accent}}…) remplacés par leur valeur par défaut. Fidèle pour des
// maquettes statiques ; boucles et conditions du canevas ne sont pas évaluées.
const PROPS_RE = /<script[^>]*data-props='([^']*)'[^>]*>/i;

function defaults(html) {
  const raw = PROPS_RE.exec(html)?.[1];
  if (!raw) return {};
  try {
    const props = JSON.parse(raw.replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
    return Object.fromEntries(
      Object.entries(props)
        .filter(([key, value]) => !key.startsWith("$") && value && typeof value === "object" && "default" in value)
        .map(([key, value]) => [key, String(value.default)]),
    );
  } catch {
    return {};
  }
}

export function staticPreview(html) {
  const values = defaults(html);
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sautofocus(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, "") // refusé dans un cadre isolé
    .replace(/\{\{\s*([\w$.]+)\s*\}\}/g, (_, key) => values[key.split(".")[0]] ?? "")
    .replace(/<head>/i, "<head>\n<style>x-dc, helmet { display: contents; }</style>");
}
