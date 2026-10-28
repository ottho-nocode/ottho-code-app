// Crée un projet de démonstration pour ottho-pipeline et affiche son chemin.
// US-01 : cycle complet et mergé. US-02 : spec écrite et validée, branche créée, plan
// à faire, deux questions en attente (une dans la spec, une posée en direct par
// designer). US-03 : spec écrite, pas encore validée.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const AGENTS = {
  brainstorming: ["opus", "Read, WebFetch"],
  "spec-writer": ["sonnet", "Read, Write"],
  designer: ["opus", "Read, Write, WebFetch"],
  architect: ["opus", "Read, Write, WebFetch, Glob, Grep"],
  developer: ["sonnet", "Read, Write, Edit, Bash, Glob, Grep, mcp__supabase, mcp__claude_ai_Supabase, mcp__stripe, mcp__context7"],
  "code-reviewer": ["opus", "Read, Glob, Grep, Bash"],
  tester: ["sonnet", "Read, Write, Edit, Bash, Glob, Grep"],
  devops: ["sonnet", "Read, Write, Edit, Bash, Glob, mcp__github, mcp__vercel, mcp__supabase"],
  "doc-writer": ["haiku", "Read, Write, Edit, Glob, Grep"],
};

export async function createDemoProject(root) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "ottho-pipeline-demo-")));
  const env = { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@local", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@local" };
  const g = (...args) => execFileSync("git", args, { cwd: dir, env, stdio: "pipe" });
  const w = async (rel, text) => {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), text);
  };

  // Maquettes du projet (écrans clés, niveau projet) : copie du canevas Claude Design.
  await w("design/projet/Accueil.dc.html", "<!doctype html><html><body style=\"font-family:sans-serif\"><h1>Accueil démo</h1><p>Réserver un créneau</p></body></html>\n");
  await w("design/projet/Paiement.dc.html", "<!doctype html><html><body style=\"font-family:sans-serif\"><h1>Paiement démo</h1></body></html>\n");
  await w("design/projet/canvas.json", JSON.stringify({ order: ["Accueil.dc.html", "Paiement.dc.html"], boards: { "Accueil.dc.html": { title: "Accueil", x: 0, y: 0, w: 390, h: 844 }, "Paiement.dc.html": { title: "Paiement", x: 440, y: 0, w: 390, h: 844 } } }) + "\n");

  // L'app construite par les agents : un site statique, pour l'onglet « Aperçu ».
  await w("index.html", `<!doctype html>\n<html lang="fr">\n<head><meta charset="utf-8"><title>Démo</title></head>\n<body><h1>Mes tâches (démo)</h1></body>\n</html>\n`);

  // Services externes : Supabase branché pour le projet, Stripe et les autres non.
  // Base de données : l'app et les agents visent le même projet Supabase (celui de dev).
  await w(".mcp.json", JSON.stringify({ mcpServers: { supabase: { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=demoprojetdevabcdefg" } } }, null, 2) + "\n");
  await w(".env.local", "NEXT_PUBLIC_SUPABASE_URL=https://demoprojetdevabcdefg.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=cle-de-demo-jamais-affichee\n");

  for (const [name, [model, tools]] of Object.entries(AGENTS)) {
    await w(`fake-plugin/agents/${name}.md`, `---\nname: ${name}\ndescription: Agent ${name} de démonstration\nmodel: ${model}\ntools: ${tools}\n---\n\n# ${name}\n\nPrompt système de démonstration.\n`);
  }
  await w("specs/US-01-inscription.md", "# US-01 — Inscription\n");
  await w("plans/US-01-inscription.md", "# Plan US-01\n");
  await w("reviews/US-01-inscription-review.md", "Verdict : APPROUVÉ\n");
  await w("e2e/US-01-inscription.spec.ts", "// test e2e de démo\n");
  g("init", "-q", "-b", "develop");
  g("add", ".");
  g("commit", "-q", "-m", "chore: init");
  g("checkout", "-q", "-b", "feature/US-01-inscription");
  await w("src/inscription.ts", "export {};\n");
  g("add", ".");
  g("commit", "-q", "-m", "feat(US-01): formulaire d'inscription");
  g("checkout", "-q", "develop");
  g("merge", "-q", "--no-ff", "feature/US-01-inscription", "-m", "Merge branch 'feature/US-01-inscription' into develop");
  const today = new Date().toISOString().slice(0, 10);
  await w(
    "specs/US-02-paiement.md",
    `# US-02 — Paiement\n\n## 7. Questions ouvertes\n\n- [ ] Le paiement doit-il gérer les remboursements ?\n- [x] Quel prestataire de paiement ?\n  > Réponse (${today}) : Stripe.\n\n---\n\n## 8. Prochaine étape\n\n→ invoquer \`architect\`.\n\n## Historique\n\n- ${today} — Création par \`spec-writer\`.\n- ${today} — Validé par l'utilisateur (ottho-pipeline).\n`,
  );
  await w(
    "design/US-02-paiement.md",
    `# US-02 — Paiement (maquettes)\n\n> Maquettes : https://claude.ai/artifact/demo-maquette-paiement\n\nÉcran unique : formulaire de carte, bouton Payer, message de confirmation.\n\n## Historique\n\n- ${today} — Création par \`designer\`.\n- ${today} — Validé par l'utilisateur (ottho-pipeline).\n`,
  );
  await w(
    "design/US-02-paiement/formulaire.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="#fff"/><text x="20" y="36" font-family="sans-serif" font-size="18" font-weight="bold">Paiement</text><rect x="20" y="60" width="280" height="36" rx="6" fill="none" stroke="#999"/><text x="30" y="83" font-family="sans-serif" font-size="13" fill="#999">Numéro de carte</text><rect x="20" y="110" width="130" height="36" rx="6" fill="none" stroke="#999"/><rect x="170" y="110" width="130" height="36" rx="6" fill="none" stroke="#999"/><rect x="20" y="170" width="280" height="40" rx="8" fill="#ff5a1f"/><text x="136" y="195" font-family="sans-serif" font-size="15" fill="#fff">Payer</text></svg>\n',
  );
  await w(
    "design/charte.md",
    `# Charte graphique\n\n> Design system : https://claude.ai/artifact/demo-design-system\n\n- Accent : #ff5a1f (boutons, liens)\n- Texte : #17171c sur fond #ffffff\n- Police : Inter, 16px\n\n## Historique\n\n- ${today} — Création par \`designer\`.\n- ${today} — Validé par l'utilisateur (ottho-pipeline).\n`,
  );
  await w(
    "design/US-02-paiement/canvas.json",
    JSON.stringify({ v: 3, title: "US-02 Paiement", boards: { "Main.dc.html": { x: 0, y: 0, w: 640, h: 420, title: "Formulaire" } }, order: ["Main.dc.html"], notes: {}, designSystems: [] }),
  );
  await w(
    "design/US-02-paiement/Main.dc.html",
    `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<title>Formulaire</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet><style>body{margin:0;font-family:system-ui,sans-serif}</style></helmet>\n<div style="width: 640px; height: 420px; box-sizing: border-box; padding: 40px; display: flex; flex-direction: column; gap: 16px; background: #fff">\n<h1 style="margin: 0; font-size: 28px">Paiement</h1>\n<label style="display: grid; gap: 6px">Numéro de carte<input style="padding: 12px; border: 1px solid #999; border-radius: 6px" placeholder="1234 5678 9012 3456"></label>\n<button style="padding: 14px; border: 0; border-radius: 8px; background: {{accent}}; color: #fff; font-size: 16px">Payer</button>\n</div>\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props='{"accent":{"editor":"color","default":"#ff5a1f"},"$preview":{"width":640,"height":420}}'>\nclass Component extends DCLogic { renderVals() { return { accent: this.props.accent ?? '#ff5a1f' }; } }\n</script>\n</body>\n</html>\n`,
  );
  await w("specs/US-03-export-csv.md", `# US-03 — Export CSV\n\n## 1. Contexte\n\nExporter la liste en CSV.\n\n## Historique\n\n- ${today} — Création par \`spec-writer\`.\n`);
  g("checkout", "-q", "-b", "feature/US-02-paiement");

  const t0 = Date.now() - 3_600_000;
  const at = (min) => new Date(t0 + min * 60_000).toISOString();
  // Cycle de US-01 : chaque passage a ses fichiers produits et son compte rendu.
  const cycle = [
    ["spec-writer", 0, "architect", null, ["specs/US-01-inscription.md"]],
    ["architect", 5, "developer", null, ["plans/US-01-inscription.md"]],
    ["developer", 10, "code-reviewer", null, ["src/inscription.ts"]],
    ["code-reviewer", 20, "tester", "APPROUVÉ", ["reviews/US-01-inscription-review.md"]],
    ["tester", 25, "doc-writer", "VERTS", ["e2e/US-01-inscription.spec.ts"]],
  ];
  const lines = [];
  cycle.forEach(([agent, m, next, verdict, files], i) => {
    const id = `demo-${i}`;
    const agentId = `demo-agent-${i}`;
    lines.push({ v: 1, ts: at(m), type: "start", id, agent, source: "plugin", us: "US-01", branch: "feature/US-01-inscription" });
    lines.push({ v: 1, ts: at(m), type: "launch", id, agentId, agent, source: "plugin", us: "US-01" });
    for (const file of files) lines.push({ v: 1, ts: at(m + 1), type: "activity", agentId, agent, tool: "Write", detail: file });
    const report = `## Compte rendu de ${agent}\n\nFichiers : ${files.map((f) => `\`${f}\``).join(", ")}.${verdict ? `\n\nVerdict : ${verdict}` : ""}\n\n> **Prochaine étape recommandée** : invoquer \`${next}\``;
    lines.push({ v: 1, ts: at(m + 3), type: "end", id, agentId, agent, us: "US-01", next, verdict, questions: [], report });
  });
  lines.push({ v: 1, ts: at(35), type: "start", id: "demo-q", agent: "designer", source: "plugin", us: "US-02", branch: "feature/US-02-paiement" });
  lines.push({
    v: 1, ts: at(40), type: "end", id: "demo-q", agent: "designer", us: "US-02", next: "architect", verdict: null,
    questions: ["Faut-il un reçu PDF envoyé par e-mail après paiement ?"],
  });
  await w(".claude/pipeline-events.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await createDemoProject());
}
