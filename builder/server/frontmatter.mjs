// Frontmatter YAML minimal (une clé: valeur par ligne), suffisant pour les
// agents Claude Code. Les structures imbriquées sont ignorées, sans dépendance.
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    data[m[1]] = value;
  }
  return { data, body: match[2] };
}
