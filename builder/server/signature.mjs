// Signature bon marché de tout ce qui influence l'état affiché. Recalculée chaque
// seconde : si elle change, l'état est reconstruit et poussé en SSE.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIRS = ["specs", "design", "plans", "reviews", "e2e", "docs/questions", ".claude/agents", ".git/refs/heads"];
const FILES = [".git/HEAD", ".git/index", ".git/packed-refs", ".git/logs/HEAD", ".claude/pipeline-events.jsonl", "docs/PRD.md", "docs/brief.md", "docs/vision.md", "docs/architecture.md", "docs/devops.md", "CLAUDE.md", ".mcp.json", ".env", ".env.local", ".env.development", ".env.development.local"];

async function fileSig(path) {
  try {
    const s = await stat(path);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return "-";
  }
}

async function dirSig(path) {
  let names;
  try {
    names = await readdir(path, { recursive: true });
  } catch {
    return "-";
  }
  const parts = await Promise.all(names.sort().map(async (n) => `${n}=${await fileSig(join(path, n))}`));
  return parts.join(",");
}

export async function signature(projectDir, now = Date.now()) {
  const parts = await Promise.all([
    ...DIRS.map((d) => dirSig(join(projectDir, d))),
    ...FILES.map((f) => fileSig(join(projectDir, f))),
  ]);
  // La minute courante en fait partie : un run passe « interrompu » après 30 min
  // sans qu'aucun fichier ne bouge.
  parts.push(String(Math.floor(now / 60_000)));
  return parts.join("|");
}
