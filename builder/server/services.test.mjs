import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectServices, serviceOfTool, servicesOfTools, supabaseScope } from "./services.mjs";
import { tempDir } from "./tmpdirs.mjs";

test("serviceOfTool : serveur du .mcp.json, connecteur claude.ai, outil précis ou serveur entier", () => {
  assert.equal(serviceOfTool("mcp__supabase"), "supabase");
  assert.equal(serviceOfTool("mcp__supabase__list_tables"), "supabase");
  assert.equal(serviceOfTool("mcp__claude_ai_Supabase"), "supabase");
  assert.equal(serviceOfTool("mcp__claude_ai_Google_Drive__search_files"), "google_drive");
  assert.equal(serviceOfTool("mcp__pencil__execute"), "pencil");
  assert.equal(serviceOfTool("mcp__plugin_posthog_posthog__authenticate"), "posthog");
  assert.equal(serviceOfTool("Read"), null);
  assert.deepEqual(servicesOfTools(["Read", "mcp__supabase", "mcp__claude_ai_Supabase", "mcp__stripe", "mcp__context7"]), ["supabase", "stripe", "context7"]);
});

test("detectServices : projet, local, utilisateur et connecteurs claude.ai, noms seulement, jamais la configuration", async () => {
  const home = await tempDir("op-home-");
  const project = join(home, "mon-projet");
  await mkdir(project);
  await writeFile(
    join(project, ".mcp.json"),
    JSON.stringify({ mcpServers: { supabase: { type: "http", url: "https://mcp.supabase.com/mcp" }, resend: { headers: { Authorization: "Bearer re_SECRET" } }, stripe: {} } }),
  );
  await writeFile(
    join(home, ".claude.json"),
    JSON.stringify({
      mcpServers: { pencil: { command: "pencil" }, github: { headers: { Authorization: "Bearer ghp_SECRET" } } },
      claudeAiMcpEverConnected: ["claude.ai Supabase", "claude.ai Google Drive"],
      mcpNeedsAuthNoticed: ["claude.ai Google Drive", "plugin:vercel:vercel"],
      projects: { [project]: { mcpServers: { context7: { url: "https://mcp.context7.com/mcp" } }, disabledMcpjsonServers: ["stripe"] } },
    }),
  );
  const services = await detectServices({ projectDir: project, claudeConfigPath: join(home, ".claude.json") });
  const via = Object.fromEntries(services.map((s) => [s.key, s.via]));
  assert.deepEqual(via, {
    context7: ["local"],
    github: ["utilisateur"],
    google_drive: ["connecteur claude.ai"],
    pencil: ["utilisateur"],
    resend: ["projet"],
    supabase: ["projet", "connecteur claude.ai"],
  });
  assert.equal(services.find((s) => s.key === "supabase").label, "Supabase");
  assert.equal(services.find((s) => s.key === "google_drive").label, "Google Drive");
  // Connecteur signalé « à authentifier » par Claude Code.
  assert.deepEqual(services.filter((s) => s.needsAuth).map((s) => s.key), ["google_drive"]);
  assert.doesNotMatch(JSON.stringify(services), /SECRET|https:|Bearer/);
});

test("detectServices : fichiers absents ou illisibles, aucun service", async () => {
  const dir = await tempDir("op-nomcp-");
  await writeFile(join(dir, ".mcp.json"), "{ pas du json");
  assert.deepEqual(await detectServices({ projectDir: dir, claudeConfigPath: join(dir, "absent.json") }), []);
});

test("supabaseScope : projet visé et lecture seule, depuis l'URL ou les arguments ; rien d'autre", () => {
  assert.deepEqual(supabaseScope({ type: "http", url: "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst&read_only=true" }), { project: "abcdefghijklmnopqrst", readOnly: true });
  assert.deepEqual(supabaseScope({ command: "npx", args: ["-y", "@supabase/mcp-server-supabase", "--project-ref=zyxwvutsrqponmlkjihg", "--read-only"], env: { SUPABASE_ACCESS_TOKEN: "sbp_SECRET" } }), { project: "zyxwvutsrqponmlkjihg", readOnly: true });
  assert.deepEqual(supabaseScope({ command: "mcp-server-supabase", args: ["--project-ref", "qwertyuiopasdfghjklz"] }), { project: "qwertyuiopasdfghjklz", readOnly: false });
  assert.deepEqual(supabaseScope({ command: "/opt/homebrew/bin/mcp-server-supabase", env: { SUPABASE_ACCESS_TOKEN: "sbp_SECRET" } }), { project: null, readOnly: false });
});

test("detectServices : cible Supabase de chaque source (projet précis, tout le compte, connecteur)", async () => {
  const home = await tempDir("op-home-");
  const project = join(home, "p");
  await mkdir(project);
  await writeFile(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { supabase: { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=abcdefghijklmnopqrst" } } }));
  await writeFile(
    join(home, ".claude.json"),
    JSON.stringify({ mcpServers: { supabase: { command: "mcp-server-supabase", env: { SUPABASE_ACCESS_TOKEN: "sbp_SECRET" } } }, claudeAiMcpEverConnected: ["claude.ai Supabase"] }),
  );
  const [supa] = await detectServices({ projectDir: project, claudeConfigPath: join(home, ".claude.json") });
  assert.deepEqual(supa.targets, [
    { via: "projet", project: "abcdefghijklmnopqrst", readOnly: false },
    { via: "utilisateur", project: null, readOnly: false },
    { via: "connecteur claude.ai", project: null, readOnly: false },
  ]);
  assert.doesNotMatch(JSON.stringify(supa), /SECRET/);
});
