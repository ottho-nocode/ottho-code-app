// Base de données utilisée par l'app du projet, lue dans ses fichiers .env : on n'en tire
// que l'adresse (projet Supabase ou hôte), jamais une clé, un identifiant ou un mot de passe.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Du plus général au plus particulier : le dernier qui définit la variable l'emporte (comme Next, Vite).
const FILES = [".env", ".env.development", ".env.local", ".env.development.local"];
const SUPABASE_URL = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|NUXT_PUBLIC_)?SUPABASE_URL$/;
const DATABASE_URL = /^(?:DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|DIRECT_URL)$/;
const SUPABASE_HOST = /^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|in)$/;

function parseEnv(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars[m[1]] = value;
  }
  return vars;
}

function describe(value, source) {
  if (value.startsWith("file:")) return { kind: "sqlite", project: null, host: value.slice(5), source };
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const ref = SUPABASE_HOST.exec(url.hostname)?.[1] ?? null;
  // Adresse du « pooler » Supabase : le projet est dans l'identifiant (postgres.<ref>), pas le secret.
  const pooled = /\.pooler\.supabase\.com$/.test(url.hostname) ? (/^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username))?.[1] ?? null) : null;
  const project = ref ?? pooled;
  return { kind: project ? "supabase" : url.protocol.startsWith("postgres") ? "postgres" : url.protocol.replace(/:$/, ""), project, host: url.hostname, source };
}

export async function detectAppDatabase(projectDir) {
  let supabase = null;
  let database = null;
  for (const file of FILES) {
    const text = await readFile(join(projectDir, file), "utf8").catch(() => null);
    if (text === null) continue;
    for (const [key, value] of Object.entries(parseEnv(text))) {
      if (!value) continue;
      if (SUPABASE_URL.test(key)) supabase = describe(value, file) ?? supabase;
      else if (DATABASE_URL.test(key)) database = describe(value, file) ?? database;
    }
  }
  return supabase ?? database;
}
