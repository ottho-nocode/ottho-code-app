import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createDemoProject } from "../scripts/demo-fixture.mjs";
import { savePreset } from "../server/brief.mjs";
import { BRIEF_PROMPT, FOLLOW_RECO_PROMPT, validatePrompt } from "../web/src/prompts";

// L'app est en lecture seule : ses actions sont des prompts copiés pour le terminal Claude.
// Le presse-papiers du navigateur de test (en mémoire) doit donc être lisible.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

type Builder = { proc: ChildProcess; url: string };

// Lance le Builder sur un projet et attend son adresse (ligne « prêt : http://… »).
// Services : jamais la vraie configuration Claude Code de la machine.
// Exemples de brief : dans un dossier temporaire (OTTHO_PIPELINE_HOME), jamais dans ~/.ottho-pipeline.
async function startBuilder(project: string, port: number, home: string, plugin: string): Promise<Builder> {
  const proc = spawn(process.execPath, ["bin/cli.mjs", "--project", project, "--plugin", plugin, "--port", String(port), "--no-open"], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, OTTHO_PIPELINE_CLAUDE_CONFIG: join(project, "absent.json"), OTTHO_PIPELINE_HOME: home },
  });
  const url = await new Promise<string>((ok, ko) => {
    let out = "";
    // Pas prêt en 15 s : arrêté (aucun processus orphelin sur le port), le hook échoue avec sa sortie.
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      ko(new Error(`Builder pas prêt en 15 s : ${out}`));
    }, 15_000);
    proc.stdout!.on("data", (d) => {
      out += String(d);
      const m = /prêt : (http:\/\/\S+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        ok(m[1]);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      ko(new Error(`Builder arrêté avant d'être prêt (code ${code}) : ${out}`));
    });
  });
  return { proc, url };
}

async function stopBuilder(builder: Builder | undefined) {
  if (!builder || builder.proc.exitCode !== null || builder.proc.signalCode !== null) return;
  const exited = new Promise((ok) => builder.proc.once("exit", ok));
  builder.proc.kill();
  await exited;
}

const readClipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

// Clic sur un bouton « Copier… » : renvoie le texte copié. Le presse-papiers est vidé avant,
// pour ne jamais relire la copie d'un test précédent.
async function copyFrom(page: Page, button: Locator): Promise<string> {
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await button.click();
  await expect.poll(() => readClipboard(page)).not.toBe("");
  return readClipboard(page);
}

// Validation donnée dans le CLI : Claude ajoute une ligne en fin de section « Historique » du livrable.
// Mêmes règles de section que le serveur (server/deliverables.mjs) : titre « ## Historique » ou
// « ## 9. Historique », section close au titre suivant ou à une ligne « --- ».
const HISTORY_RE = /^#{2,3}\s*(?:\d+[.)]\s*)?Historique\b/i;
const SECTION_END_RE = /^(#{1,6}\s|---\s*$)/;
function noteValidation(file: string, date: string) {
  const lines = readFileSync(file, "utf8").replace(/\n+$/, "").split("\n");
  const start = lines.findIndex((l) => HISTORY_RE.test(l));
  if (start === -1) throw new Error(`Pas de section « Historique » dans ${file}`);
  let end = start + 1;
  while (end < lines.length && !SECTION_END_RE.test(lines[end])) end++;
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, `- ${date} : Validé par l'utilisateur.`);
  writeFileSync(file, lines.join("\n") + "\n");
}

const today = new Date().toISOString().slice(0, 10);
let builder: Builder | undefined;
let dir: string;
let home: string;

test.beforeAll(async () => {
  dir = await createDemoProject();
  home = await mkdtemp(join(tmpdir(), "op-home-"));
  builder = await startBuilder(dir, 4399, home, join(dir, "fake-plugin"));
  // baseURL des tests : 4399 pris par autre chose, le Builder serait ailleurs et les tests viseraient la mauvaise app.
  if (builder.url !== "http://127.0.0.1:4399") {
    await stopBuilder(builder);
    throw new Error(`Port 4399 occupé : le Builder a démarré sur ${builder.url}`);
  }
});

test.afterAll(async () => {
  await stopBuilder(builder);
  for (const d of [dir, home]) if (d) rmSync(d, { recursive: true, force: true });
});

test("affiche les features et allume l'agent lancé", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "US-01", exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("US-02");
  const architect = page.locator('[data-agent="architect"]');
  await expect(architect).toHaveAttribute("data-status", "idle");
  const banner = page.locator(".banner");
  await expect(banner).toContainText("lance architect");
  // Prochaine étape : un prompt à coller dans le terminal Claude.
  expect(await copyFrom(page, banner.getByRole("button", { name: "Copier le prompt pour Claude" }))).toBe(
    "GO PLAN : lance l'agent architect sur US-02 (Paiement), avec mes réponses consignées dans la section « Questions ouvertes » de la spec.",
  );

  const start = { v: 1, ts: new Date().toISOString(), type: "start", id: "e2e-1", agent: "architect", source: "plugin", us: "US-02", branch: null };
  appendFileSync(join(dir, ".claude", "pipeline-events.jsonl"), JSON.stringify(start) + "\n");
  await expect(architect).toHaveAttribute("data-status", "running", { timeout: 5000 });
  await expect(banner).toContainText("travaille sur US-02");
});

test("questions d'un agent : visibles à la demande, en lecture, réponse dans le terminal Claude", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("US-02");
  const designer = page.locator('[data-agent="designer"]');
  await expect(designer).toHaveAttribute("data-questions", "1");

  // Les questions ne s'affichent qu'à la demande : pastille sur la carte, clic, puis questions à gauche.
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  const question = "Faut-il un reçu PDF envoyé par e-mail après paiement ?";
  await expect(column.locator("li.q", { hasText: question })).toHaveCount(0);
  await designer.click();
  await expect(column.getByRole("heading", { name: "designer", exact: true })).toBeVisible();
  // Maquettes du designer : lien Claude Design et image exportée.
  await expect(column.getByRole("link", { name: /Ouvrir le canevas dans Claude Design/ })).toHaveAttribute(
    "href",
    "https://claude.ai/artifact/demo-maquette-paiement",
  );
  await expect(column.getByAltText("Maquette formulaire.svg")).toBeVisible();
  // Écran du canevas en aperçu, et charte graphique du projet.
  await expect(column.getByTitle("Écran Formulaire")).toBeVisible();
  await expect(column.getByRole("heading", { name: "Charte graphique" })).toBeVisible();
  await expect(column.getByRole("link", { name: /Ouvrir le design system/ })).toHaveAttribute("href", "https://claude.ai/artifact/demo-design-system");
  // Question en lecture : ni champ ni bouton, Claude la pose dans le terminal.
  const item = column.locator("li.q[data-question]", { hasText: question });
  await expect(item.locator(".q__todo")).toHaveText("À répondre dans ton terminal Claude : il te la pose.");
  await expect(item.getByRole("textbox")).toHaveCount(0);
  await expect(item.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /terminal/i })).toHaveCount(0);

  // Questions de la spec : l'une en attente, l'autre répondue (réponse consignée par Claude dans la spec).
  await page.locator('[data-agent="spec-writer"]').click();
  await expect(column.getByRole("heading", { name: "spec-writer", exact: true })).toBeVisible();
  await expect(column.locator("li.q", { hasText: "Le paiement doit-il gérer les remboursements ?" }).locator(".q__todo")).toBeVisible();
  const answered = column.locator("li.a", { hasText: "Quel prestataire de paiement ?" });
  await expect(answered.locator('.a__ok[aria-label="répondue"]')).toBeVisible();
  await expect(answered.locator(".a__answer")).toContainText("Stripe.");
  // Spec déjà validée : repliée, relue à la demande.
  const deliv = column.locator('.deliv[data-deliverable="specs/US-02-paiement.md"]');
  await expect(deliv.locator(".deliv__status.ok")).toHaveText(/^✓ Validé le \d{4}-\d{2}-\d{2} · specs\/US-02-paiement\.md$/);
  await expect(deliv.locator(".deliv__validate")).toHaveCount(0);
  const toggle = deliv.locator(".deliv__toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveText("Relire la spec");
  await toggle.click();
  await expect(toggle).toHaveText("Masquer la spec");
  await expect(deliv.getByLabel("Contenu de specs/US-02-paiement.md")).toContainText("Quel prestataire de paiement ?");
});

test("éléments de marque du designer : en lecture, fichiers à glisser dans le terminal Claude", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("US-02");
  await page.locator('[data-agent="designer"]').click();
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  const heading = column.getByRole("heading", { name: /Éléments de marque/ });
  await expect(heading).toContainText("aucun");
  await expect(column.locator(".assets__hint")).toContainText("Glisse tes fichiers (logo, polices, charte en PDF, maquettes) dans ton terminal Claude");
  // Aucun dépôt de fichier dans l'app.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  // Claude range les fichiers glissés dans design/assets/ : la liste suit d'elle-même.
  mkdirSync(join(dir, "design", "assets"), { recursive: true });
  writeFileSync(
    join(dir, "design", "assets", "logo-demo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ff5a1f"/></svg>',
  );
  writeFileSync(join(dir, "design", "assets", "charte-marque.pdf"), "%PDF-1.4\n% charte de démo\n");
  await expect(heading).toContainText("2 fichiers");
  const logo = column.locator(".asset-grid a.asset", { hasText: "logo-demo.svg" });
  await expect(logo).toHaveAttribute("href", "/api/design-file?path=design%2Fassets%2Flogo-demo.svg");
  await expect.poll(() => logo.locator("img").evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0))).toBeGreaterThan(0);
  const pdf = column.locator(".asset-list li", { hasText: "charte-marque.pdf" });
  await expect(pdf.locator(".tag")).toHaveText("PDF");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("plus d'écriture depuis l'app : ni éditeur, ni bouton Valider, Modifier ou Enregistrer hors de la configuration", async ({ page }) => {
  await page.goto("/");
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  const readOnly = async () => {
    await expect(column.locator('textarea, input, select, [contenteditable="true"]')).toHaveCount(0);
    for (const name of [/^Valider/, /modifier/i, /^Enregistrer/]) await expect(column.getByRole("button", { name })).toHaveCount(0);
  };
  // Livrable déplié (contenu affiché), là où se trouvait l'éditeur.
  const expand = async (file: string) => {
    const deliv = column.locator(`.deliv[data-deliverable="${file}"]`);
    const toggle = deliv.locator(".deliv__toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(deliv.locator(".deliv__body")).toBeVisible();
  };
  // Spec de US-03, pas encore validée.
  await page.getByRole("combobox").selectOption("US-03");
  await page.locator('[data-agent="spec-writer"]').click();
  await expand("specs/US-03-export-csv.md");
  await readOnly();
  // Designer de US-02 : charte et maquette dépliées, éléments de marque.
  await page.getByRole("combobox").selectOption("US-02");
  await page.locator('[data-agent="designer"]').click();
  for (const file of ["design/charte.md", "design/US-02-paiement.md"]) await expand(file);
  await readOnly();
  // Pas de terminal intégré non plus.
  await expect(page.getByRole("region", { name: "Terminal Claude Code" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /terminal/i })).toHaveCount(0);

  // « Enregistrer » n'existe que dans la configuration (écrit .env.local).
  await page.getByRole("button", { name: "Configuration" }).click();
  const config = page.getByRole("complementary", { name: "Configuration des services" });
  await expect(config.getByRole("button", { name: "Enregistrer" }).first()).toBeVisible();
});

test("spec à valider : lecture et prompt « Je valide » copié, puis validation notée par Claude", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("US-03");
  const banner = page.locator(".banner");
  await expect(banner).toHaveClass(/\bvalidate\b/);
  await expect(banner).toContainText("valide la spec de spec-writer");
  const writer = page.locator('[data-agent="spec-writer"]');
  await expect(writer).toHaveAttribute("data-validate", "1");

  await writer.click();
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  const file = "specs/US-03-export-csv.md";
  const deliv = column.locator(`.deliv[data-deliverable="${file}"]`);
  await expect(deliv.locator(".deliv__status.todo")).toHaveText(`À valider : dis-le à Claude dans ton terminal · ${file}`);
  // Relue dans l'app, en Markdown rendu.
  const toggle = deliv.locator(".deliv__toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveText("Masquer la spec");
  const body = deliv.getByLabel(`Contenu de ${file}`);
  await expect(body.getByRole("heading", { name: "US-03 — Export CSV" })).toBeVisible();
  await expect(body).toContainText("Exporter la liste en CSV.");

  // « Je valide » : prompt à coller dans le terminal Claude, « Copié » un instant.
  const validate = deliv.locator(".deliv__validate");
  expect(await copyFrom(page, validate.getByRole("button", { name: "Copier « Je valide »" }))).toBe(validatePrompt("la spec", file));
  await expect(validate.getByRole("button", { name: "Copié" })).toBeVisible();
  await expect(validate.locator('[role="status"]')).toHaveText("Copié");

  // Claude note la validation en fin d'« Historique » (dans le CLI) : l'app la lit et passe à la suite.
  noteValidation(join(dir, file), today);
  await expect(deliv.locator(".deliv__status.ok")).toHaveText(`✓ Validé le ${today} · ${file}`);
  await expect(validate).toHaveCount(0);
  await expect(writer).toHaveAttribute("data-validate", "0");
  await expect(banner).toContainText("lance architect");
});

test("historique d'un agent : fichiers produits lisibles et compte rendu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").selectOption("US-01");
  await page.locator('[data-agent="architect"]').click();
  const panel = page.getByRole("complementary", { name: "Fiche de l'agent architect" });
  await expect(panel.getByRole("heading", { name: "Historique" })).toBeVisible();
  await panel.getByRole("button", { name: "plans/US-01-inscription.md" }).click();
  const viewer = page.getByRole("complementary", { name: "Fichier plans/US-01-inscription.md" });
  await expect(viewer).toContainText("Plan US-01");
  await viewer.getByRole("button", { name: "← Retour" }).click();
  await panel.getByText("Compte rendu").first().click();
  await expect(panel.locator(".run__report .markdown").first()).toContainText("Compte rendu de architect");
});

test("documents : tous les .md du projet, rangés par dossier, lisibles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Documents" }).click();
  const docs = page.getByRole("complementary", { name: "Documents du projet" });
  await expect(docs.getByRole("heading", { name: "specs/" })).toBeVisible();
  await expect(docs.getByRole("heading", { name: "design/" })).toBeVisible();
  await docs.getByRole("searchbox", { name: "Filtrer les documents" }).fill("US-03");
  await expect(docs.getByRole("button", { name: /US-01-inscription\.md/ })).toHaveCount(0);
  await docs.getByRole("button", { name: /US-03-export-csv\.md/ }).click();
  const viewer = page.getByRole("complementary", { name: "Fichier specs/US-03-export-csv.md" });
  await expect(viewer.getByRole("heading", { name: "US-03 — Export CSV" })).toBeVisible();
  await viewer.getByRole("button", { name: "← Retour" }).click();
  await expect(docs).toBeVisible();
  await docs.getByRole("button", { name: "Fermer" }).click();
  await expect(docs).toHaveCount(0);
});

test("services externes : branchés ou non sur la carte, commande d'ajout à copier dans la fiche", async ({ page }) => {
  await page.goto("/");
  const developer = page.locator('[data-agent="developer"]');
  await expect(developer.locator(".svc--on")).toHaveText("✓ Supabase");
  await expect(developer.locator(".svc--off")).toHaveText("+2");
  await developer.click();
  const panel = page.getByRole("complementary", { name: "Fiche de l'agent developer" });
  await expect(panel.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(panel.getByText(".mcp.json du projet")).toBeVisible();
  const cmd = panel.locator(".svc-cmd").first();
  await expect(cmd.locator("code")).toContainText("claude mcp add --transport http stripe https://mcp.stripe.com");
  expect(await copyFrom(page, cmd.getByRole("button", { name: "Copier", exact: true }))).toBe(await cmd.locator("code").innerText());
  await expect(panel.getByText("Connecte un compte de test (sandbox Stripe), jamais le compte réel.")).toBeVisible();
});

test("colonne de gauche : redimensionnable, repliable, la scène prend toute la largeur", async ({ page }) => {
  await page.goto("/");
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  const main = page.locator("main.main");
  const splitter = page.getByRole("separator", { name: "Largeur de la colonne de gauche" });
  const before = (await column.boundingBox())!.width;

  // Glisser la poignée élargit la colonne ; les flèches la règlent au clavier.
  const handle = (await splitter.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + 40, { steps: 5 });
  await page.mouse.up();
  const wider = (await column.boundingBox())!.width;
  expect(wider).toBeGreaterThan(before + 100);
  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  expect((await column.boundingBox())!.width).toBeLessThan(wider);

  // Fermer : la barre repliée apparaît, la scène s'élargit.
  const mainOpen = (await main.boundingBox())!.width;
  await page.getByRole("button", { name: "Fermer la colonne de gauche" }).click();
  await expect(column).toHaveCount(0);
  expect((await main.boundingBox())!.width).toBeGreaterThan(mainOpen + 200);

  // Réglage mémorisé : toujours fermée après rechargement.
  await page.reload();
  await expect(column).toHaveCount(0);

  // Cliquer sur un agent rouvre la colonne sur son livrable et ses questions.
  await page.getByRole("combobox").selectOption("US-02");
  await page.locator('[data-agent="designer"]').click();
  await expect(column.getByRole("heading", { name: "designer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer la colonne de gauche" }).click();
  await page.getByRole("button", { name: /Ouvrir la colonne de gauche/ }).click();
  await expect(column).toBeVisible();
});

test("aperçu : barre latérale à droite réglable, en grand, dans un onglet, arrêt", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Aperçu" }).click();
  const stage = page.getByRole("region", { name: "Aperçu de l'app" });
  const graph = page.locator(".graph-zone");
  // Barre latérale : le graphe reste visible à côté.
  await expect(stage).toContainText("site statique (index.html)");
  await expect(graph).toBeVisible();
  await stage.getByRole("button", { name: "Lancer l'aperçu" }).click();
  await expect(stage.getByRole("link", { name: /^http:\/\/127\.0\.0\.1:31\d\d\/$/ })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Aperçu de l\'app du projet"]').getByRole("heading", { name: "Mes tâches (démo)" })).toBeVisible();
  await expect(stage.getByRole("link", { name: "Ouvrir dans un autre onglet" })).toHaveAttribute("target", "_blank");

  // Tirer la poignée vers la gauche élargit l'aperçu.
  const before = (await stage.boundingBox())!.width;
  const handle = (await page.getByRole("separator", { name: "Largeur de l'aperçu" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 60);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 120, handle.y + 60, { steps: 5 });
  await page.mouse.up();
  expect((await stage.boundingBox())!.width).toBeGreaterThan(before + 100);
  // La colonne de gauche s'est resserrée pour laisser la place, la scène garde sa largeur minimale.
  expect((await page.locator("main.main").boundingBox())!.width).toBeGreaterThanOrEqual(559);

  // En grand : l'aperçu remplace le graphe ; « Réduire » le remet à droite.
  await stage.getByRole("button", { name: "Ouvrir l'aperçu en grand" }).click();
  await expect(graph).toHaveCount(0);
  await stage.getByRole("button", { name: "Réduire l'aperçu à droite" }).click();
  await expect(graph).toBeVisible();

  await stage.getByRole("button", { name: "Arrêter le serveur de l'aperçu" }).click();
  await expect(stage.getByRole("button", { name: "Lancer l'aperçu" })).toBeVisible();
  await stage.getByRole("button", { name: "Fermer l'aperçu" }).click();
  await expect(stage).toHaveCount(0);
});

test("agent silencieux (session fermée) : signalé sur la carte et le bandeau, avec prompt de relance", async ({ page }) => {
  // US-04 : spec écrite, pas encore validée (prochaine étape : la valider).
  writeFileSync(
    join(dir, "specs", "US-04-relances.md"),
    `# US-04 : Relances\n\n## 1. Contexte\n\nRelancer les devis restés sans réponse.\n\n## Historique\n\n- ${today} : Création par spec-writer.\n`,
  );
  await page.goto("/");
  await page.getByRole("combobox").selectOption("US-04");
  const banner = page.locator(".banner");
  await expect(banner).toContainText("valide la spec de spec-writer");
  // developer lancé quand même il y a 12 min sur US-04, plus aucune action depuis (sa session a été
  // fermée) : le signal prend la place de la validation dans le bandeau. 12 min 30 s : l'horloge de
  // la page avance par pas de 15 s (useNow), elle lit donc toujours 12 min.
  const start = { v: 1, ts: new Date(Date.now() - 12 * 60_000 - 30_000).toISOString(), type: "start", id: "e2e-silent", agent: "developer", source: "plugin", us: "US-04", branch: null };
  appendFileSync(join(dir, ".claude", "pipeline-events.jsonl"), JSON.stringify(start) + "\n");
  await expect(banner).toHaveClass(/\bsilent\b/);
  await expect(banner).toContainText("developer ne donne plus signe de vie depuis 12 min");
  await expect(banner).not.toContainText("valide la spec");
  await expect(banner.getByRole("button", { name: /terminal/i })).toHaveCount(0);
  expect(await copyFrom(page, banner.getByRole("button", { name: "Copier le prompt de relance" }))).toBe(
    "Lance l'agent developer sur US-04 (Relances) : son passage précédent a été interrompu.",
  );
  await expect(page.locator('[data-agent="developer"] .agent-node__activity')).toHaveText("⚠ aucune action depuis 12 min");
});

test("base de données : celle de l'app et celle des agents, sans jamais afficher de clé", async ({ page }) => {
  await page.goto("/");
  const db = page.getByRole("region", { name: "Base de données" });
  await expect(db).toContainText("Supabase, projet demoprojetdevabcdefg (.env.local)");
  await expect(db).toContainText("projet demoprojetdevabcdefg (.mcp.json du projet)");
  await expect(db.getByRole("link", { name: "Ouvrir ↗" }).first()).toHaveAttribute("href", "https://supabase.com/dashboard/project/demoprojetdevabcdefg");
  await expect(db).not.toContainText("prod comprise");
  await expect(page.locator("body")).not.toContainText("cle-de-demo-jamais-affichee");
});

test("journal et features : se cachent et réapparaissent depuis la barre du haut, réglage mémorisé", async ({ page }) => {
  await page.goto("/");
  const journal = page.getByRole("region", { name: "Journal des agents" });
  const features = page.getByRole("region", { name: "Avancement des features" });
  const graph = page.locator(".graph-zone");
  const tall = (await graph.boundingBox())!.height;
  await expect(page.getByRole("button", { name: "Journal" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Journal" }).click();
  await expect(journal).toHaveCount(0);
  await expect(features).toBeVisible();
  await page.getByRole("button", { name: "Features" }).click();
  await expect(features).toHaveCount(0);
  expect((await graph.boundingBox())!.height).toBeGreaterThan(tall + 150);

  await page.reload();
  await expect(journal).toHaveCount(0);
  await expect(features).toHaveCount(0);
  await page.getByRole("button", { name: "Journal" }).click();
  await page.getByRole("button", { name: "Features" }).click();
  await expect(journal).toBeVisible();
  await expect(features).toBeVisible();
});

test("session principale : questions et autorisation signalées, réponse dans le terminal Claude, « Suivre tes recos » copié", async ({ page }) => {
  const journalFile = join(dir, ".claude", "pipeline-events.jsonl");
  const event = (e: Record<string, unknown>) =>
    appendFileSync(journalFile, JSON.stringify({ v: 1, ts: new Date().toISOString(), agent: "claude", session: "e2e", ...e }) + "\n");
  await page.goto("/");
  const ask = page.locator(".notif--ask");
  const wait = page.locator(".notif--wait");

  // Questions posées dans le sélecteur du terminal : signalées ici, sans champ ni bouton.
  const questions = ["Je lance l'agent architect pour mettre à jour le plan ?", "Je commite specs/ et reviews/ ?"];
  event({ type: "wait", source: "session", kind: "questions", message: "2 questions dans le terminal", questions });
  await expect(ask).toHaveAttribute("aria-label", "Claude attend ta réponse");
  await expect(ask.locator(".eyebrow")).toHaveText("Claude attend ta réponse dans ton terminal Claude");
  await expect(ask.locator("ol.notif__questions li")).toHaveText(questions);
  await expect(ask).toContainText("Dans le sélecteur, le choix « Suivre tes recos » laisse l'IA trancher.");
  await expect(ask.getByRole("textbox")).toHaveCount(0);
  await expect(ask.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Terminal Claude Code" })).toHaveCount(0);

  // Réponse donnée dans le sélecteur du terminal : la notification disparaît.
  event({ type: "answered", source: "terminal", pairs: [{ question: questions[0], answer: "Oui" }] });
  await expect(ask).toHaveCount(0, { timeout: 5000 });

  // Autorisation attendue : le message de Claude Code, à accorder dans le terminal.
  event({ type: "wait", source: "session", message: "Claude needs your permission to use Bash" });
  await expect(wait).toHaveAttribute("aria-label", "Claude attend ton autorisation");
  await expect(wait).toContainText("Claude attend ton autorisation dans ton terminal Claude");
  await expect(wait).toContainText("Claude needs your permission to use Bash");
  await expect(wait.getByRole("button")).toHaveCount(0);
  // Autorisation donnée dans le terminal (message suivant) : la notification disparaît.
  event({ type: "reply", source: "session" });
  await expect(wait).toHaveCount(0, { timeout: 5000 });

  // Questions posées en texte (fin de message) : « Suivre tes recos » se copie pour laisser l'IA trancher.
  event({ type: "ask", source: "session", questions: ["Stripe ou Paddle ?"] });
  await expect(ask.locator("ol.notif__questions li")).toHaveText(["Stripe ou Paddle ?"]);
  expect(await copyFrom(page, ask.getByRole("button", { name: "Copier « Suivre tes recos »" }))).toBe(FOLLOW_RECO_PROMPT);

  // Réponse de l'utilisateur : rien ne reste en attente pour les tests suivants.
  event({ type: "reply", source: "session" });
  await expect(ask).toHaveCount(0, { timeout: 5000 });
});

test("barre du haut : branche Git courante du projet et fichiers non commités", async ({ page }) => {
  await page.goto("/");
  const chip = page.locator(".branch-chip");
  await expect(chip.locator(".branch-chip__name")).toHaveText("feature/US-02-paiement");
  await expect(chip).toHaveAttribute("title", /^Branche Git du projet : feature\/US-02-paiement\. /);
});

test("configuration : Supabase, Stripe et variable libre écrits dans .env.local, secrets jamais réaffichés", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Configuration" }).click();
  const supa = page.getByRole("region", { name: "Configuration Supabase" });
  await expect(supa.getByLabel("NEXT_PUBLIC_SUPABASE_URL")).toHaveValue("https://demoprojetdevabcdefg.supabase.co");
  await expect(supa.locator(".cfg-field").nth(2)).toContainText("✓ défini"); // clé service_role de la démo
  await expect(supa.getByLabel("SUPABASE_SERVICE_ROLE_KEY")).toHaveValue("");
  // Ou remplir avec Claude : prompt copié pour le terminal (MCP Supabase).
  const fill = await copyFrom(page, supa.getByRole("button", { name: "Remplir avec Claude (copier le prompt)" }));
  expect(fill).toMatch(/^Via le MCP Supabase, récupère l'URL et la clé publique/);
  expect(fill).toContain("sous NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY");
  await supa.getByLabel("NEXT_PUBLIC_SUPABASE_ANON_KEY").fill("sb_publishable_demo123456");
  await supa.getByRole("button", { name: "Enregistrer" }).click();
  await expect(supa).toContainText("Enregistré dans .env.local");
  await expect(supa.locator(".cfg-field").nth(1)).toContainText("✓ défini");
  await expect(supa.getByLabel("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toHaveValue("");

  const stripe = page.getByRole("region", { name: "Configuration Stripe" });
  await stripe.getByLabel("STRIPE_SECRET_KEY").fill("sk_live_ABCDEFGH");
  await expect(stripe).toContainText("Clé de production");

  const custom = page.getByRole("region", { name: "Autre variable" });
  await custom.getByLabel("Nom de la variable").fill("ma_variable");
  await custom.getByLabel("Valeur de la variable").fill("valeur-perso");
  await custom.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("complementary", { name: "Configuration des services" })).toContainText("Autres variables définies : MA_VARIABLE");

  const env = readFileSync(join(dir, ".env.local"), "utf8");
  expect(env).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_demo123456");
  expect(env).toContain("MA_VARIABLE=valeur-perso");
  expect(readFileSync(join(dir, ".env.example"), "utf8")).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=\n");
  for (const secret of ["sb_publishable_demo123456", "cle-de-demo-jamais-affichee", "valeur-perso"]) await expect(page.locator("body")).not.toContainText(secret);
});

test("nouveau projet : canevas du brief en lecture, rempli depuis le CLI (brief --json puis --preset), la phase projet suit", async ({ page }) => {
  const empty = await mkdtemp(join(tmpdir(), "op-neuf-"));
  execFileSync("git", ["init", "-q"], { cwd: empty });
  const projectHome = await mkdtemp(join(tmpdir(), "op-home-"));
  const scratch = await mkdtemp(join(tmpdir(), "op-brief-"));
  // Sous-commande brief, telle que Claude l'appelle : même dossier du Builder (exemples) que l'instance lancée.
  const brief = (...args: string[]) =>
    execFileSync(process.execPath, ["bin/cli.mjs", "brief", "--project", empty, ...args], {
      env: { ...process.env, OTTHO_PIPELINE_HOME: projectHome },
      encoding: "utf8",
    });
  let app: Builder | undefined;
  try {
    app = await startBuilder(empty, 4397, projectHome, join(dir, "fake-plugin"));
    await page.goto(app.url);
    const ob = page.getByRole("region", { name: "Nouveau projet" });
    await expect(ob).toBeVisible();
    await expect(ob.locator(".ob-posture")).toContainText("Ce n'est pas toi qui décides si ton idée est bonne : c'est le marché.");

    // Canevas vide, en lecture : aucun champ, le prompt de cadrage à copier pour le terminal Claude.
    const label = ob.locator(".ob-progress__label");
    const progress = ob.getByRole("progressbar", { name: "Blocs remplis" });
    await expect(label).toHaveText("0/6 blocs remplis · nom à donner");
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await expect(ob.locator("article.ob-card")).toHaveCount(6);
    await expect(ob.locator("article.ob-card.is-filled")).toHaveCount(0);
    await expect(ob.getByRole("article", { name: "Le domaine" })).toContainText("Ce que brainstorming vérifiera");
    await expect(ob.locator("input, textarea, select")).toHaveCount(0);
    await expect(ob.locator(".ob-launch__prompt")).toHaveText(BRIEF_PROMPT);
    expect(await copyFrom(page, ob.getByRole("button", { name: "Copier le prompt de cadrage" }))).toBe(BRIEF_PROMPT);
    // Le bandeau ne répète pas le prompt tant que le canevas est ouvert.
    const banner = page.locator(".banner");
    await expect(banner).toContainText("Nouveau projet");
    await expect(banner.getByRole("button")).toHaveCount(0);
    const phase = page.getByRole("region", { name: "Phase projet" });
    await expect(phase.locator(".phase__step.is-next")).toContainText("Brief");
    await expect(phase.locator(".phase__step.is-next")).toHaveClass(/\bis-todo\b/);

    // Claude pose les blocs dans le terminal puis écrit le brief (brief --json) : le canevas suit tout seul.
    const partial = join(scratch, "brief.json");
    writeFileSync(
      partial,
      JSON.stringify({
        name: "Devis Facile",
        domaine: { domaine: "Freelances créatifs", legitimite: "Dix ans de graphisme en agence." },
        probleme: { description: "Les freelances oublient de relancer leurs devis." },
        persona: [{ identite: "Léa, 32 ans, graphiste, Lyon", freins: "Peur de paraître insistante." }],
      }),
    );
    expect(brief("--json", partial)).toMatch(/docs\/brief\.md écrit \(incomplet : /);
    await expect(label).toHaveText("3/6 blocs remplis");
    await expect(progress).toHaveAttribute("aria-valuenow", "3");
    await expect(ob.getByRole("heading", { name: "Devis Facile", exact: true })).toBeVisible();
    for (const title of ["Le domaine", "Le problème", "La persona"]) {
      await expect(ob.getByRole("article", { name: title })).toHaveClass(/\bis-filled\b/);
      await expect(ob.getByRole("article", { name: title }).locator(".ob-card__state")).toHaveText("✓ rempli");
    }
    const cible = ob.getByRole("article", { name: "La cible quantifiable" });
    await expect(cible).not.toHaveClass(/\bis-filled\b/);
    await expect(cible.locator(".ob-card__state")).toHaveText("à remplir");
    await expect(ob.getByRole("article", { name: "Le domaine" })).toContainText("Freelances créatifs");
    await expect(ob.locator(".ob-persona h4")).toHaveText(["Persona 1 : Léa, 32 ans, graphiste, Lyon"]);
    await expect(phase.locator(".phase__step.is-next")).toContainText("Brief");
    await expect(phase.locator(".phase__step.is-next")).toHaveClass(/\bis-started\b/);
    await expect(banner).toContainText("le brief est commencé");
    const md = readFileSync(join(empty, "docs", "brief.md"), "utf8");
    expect(md).toContain("# Brief projet : Devis Facile");
    expect(md).toContain("### Persona 1 : Léa, 32 ans, graphiste, Lyon");

    // Canevas fermé : le bandeau porte le prompt de cadrage et le rouvre.
    await ob.getByRole("button", { name: "Fermer l'onboarding" }).click();
    await expect(ob).toHaveCount(0);
    expect(await copyFrom(page, banner.getByRole("button", { name: "Copier le prompt de cadrage" }))).toBe(BRIEF_PROMPT);
    await banner.getByRole("button", { name: "Voir le brief" }).click();
    await expect(ob).toBeVisible();
    await expect(label).toHaveText("3/6 blocs remplis");

    // Exemple enregistré dans le dossier du Builder : brief --list le propose, brief --preset l'écrit.
    await savePreset(join(projectHome, "briefs"), "Haircut", {
      name: "Haircut",
      domaine: { domaine: "Coiffure à domicile" },
      probleme: { description: "Les personnes âgées ne peuvent plus se déplacer au salon." },
      cible: { marche: "Personnes âgées vivant chez elles, en France" },
      persona: [{ identite: "Jeanne, 78 ans, retraitée, Nantes" }, { identite: "Marc, 45 ans, aidant, Rennes" }],
      solution: { modele: "Mise en relation" },
      uvp: { phrase: "J'aide les personnes âgées à se faire coiffer chez elles grâce à des coiffeurs à domicile réservés en ligne." },
    });
    expect(brief("--list").trim()).toBe("haircut\tHaircut");
    expect(brief("--preset", "haircut")).toMatch(/docs\/brief\.md écrit \(complet\)/);
    await expect(label).toHaveText("6/6 blocs remplis");
    await expect(progress).toHaveAttribute("aria-valuenow", "6");
    await expect(progress).toHaveClass(/\bis-complete\b/);
    await expect(ob.locator("article.ob-card.is-filled")).toHaveCount(6);
    await expect(ob.getByRole("heading", { name: "Haircut", exact: true })).toBeVisible();
    await expect(ob.locator(".ob-persona h4")).toHaveText(["Persona 1 : Jeanne, 78 ans, retraitée, Nantes", "Persona 2 : Marc, 45 ans, aidant, Rennes"]);
    await expect(ob.locator(".ob-launch__text")).toContainText("Les six blocs sont remplis.");
    await expect(ob.getByRole("button", { name: "Copier le prompt de cadrage" })).toHaveCount(0);

    // Brief prêt : la phase projet passe au cadrage (Vision), prompt à copier pour Claude.
    await expect(phase.locator(".phase__step.is-done")).toContainText("Brief");
    await expect(phase.locator(".phase__step.is-next")).toContainText("Vision");
    await expect(banner).toContainText("brief prêt : lance le cadrage du projet");
    // Ordre du plugin : designer après spec-writer, pendant la relecture du PRD, avant architect.
    await expect(banner).toContainText("spec-writer (PRD), designer (charte et écrans clés, pendant ta relecture du PRD), architect (architecture) et devops (infra)");
    expect(await copyFrom(page, banner.getByRole("button", { name: "Copier le prompt pour Claude" }))).toBe("/ottho-code-app:init-agency-project");
  } finally {
    await stopBuilder(app);
    for (const d of [empty, projectHome, scratch]) rmSync(d, { recursive: true, force: true });
  }
});

test("maquettes du projet : ouvertes en grand depuis la charte du designer", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-agent="designer"]').click();
  const column = page.getByRole("complementary", { name: "Livrables et questions" });
  await column.getByRole("button", { name: "Voir le canevas en grand (2 écrans)" }).first().click();
  await expect(page.getByText("Maquettes du projet")).toBeVisible();
  await expect(page.getByTitle("Écran Accueil").first()).toBeVisible();
});
