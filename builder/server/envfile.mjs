// Configuration des services de l'app (Supabase, Stripe…) écrite dans .env.local, le
// fichier que Next, Vite & co lisent en développement. Les secrets n'en ressortent jamais :
// l'état ne dit que « défini » ou non (seules les valeurs publiques, comme l'URL
// Supabase, sont renvoyées). Le fichier est ignoré par Git (ajouté au .gitignore au
// besoin) et ses noms de variables, sans valeurs, vont dans .env.example.
import { execFile } from "node:child_process";
import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { atomicWrite, HttpError } from "./files.mjs";

const run = promisify(execFile);
export const ENV_FILE = ".env.local";
const MAX_VALUE = 4096;
const NAME_RE = /^[A-Z][A-Z0-9_]{0,99}$/;

const PREFIX_OF = { next: "NEXT_PUBLIC_", vite: "VITE_", astro: "PUBLIC_", nuxt: "NUXT_PUBLIC_", expo: "EXPO_PUBLIC_" };

export async function publicPrefix(projectDir) {
  try {
    const pkg = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, prefix] of Object.entries(PREFIX_OF)) if (name in deps) return prefix;
  } catch {
    // pas de package.json : convention Next (pile par défaut du plugin)
  }
  return "NEXT_PUBLIC_";
}

// Services proposés, noms de variables selon le préfixe public du framework.
function presets(p) {
  return [
    {
      key: "supabase", label: "Supabase",
      fields: [
        { name: `${p}SUPABASE_URL`, label: "URL du projet", secret: false, required: true },
        { name: `${p}SUPABASE_ANON_KEY`, label: "Clé publique (anon ou publishable)", secret: true, required: true },
        { name: "SUPABASE_SERVICE_ROLE_KEY", label: "Clé secrète (service_role), côté serveur uniquement", secret: true, required: false },
      ],
    },
    {
      key: "stripe", label: "Stripe",
      fields: [
        { name: `${p}STRIPE_PUBLISHABLE_KEY`, label: "Clé publiable (pk_test_…)", secret: false, required: true },
        { name: "STRIPE_SECRET_KEY", label: "Clé secrète (sk_test_…)", secret: true, required: true },
        { name: "STRIPE_WEBHOOK_SECRET", label: "Secret du webhook (whsec_…)", secret: true, required: false },
      ],
    },
    { key: "brevo", label: "Brevo", fields: [{ name: "BREVO_API_KEY", label: "Clé API (xkeysib-…)", secret: true, required: true }] },
    { key: "resend", label: "Resend", fields: [{ name: "RESEND_API_KEY", label: "Clé API (re_…)", secret: true, required: true }] },
  ];
}

function parse(text) {
  const vars = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^"(.*)"$/.test(value)) value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    else if (/^'(.*)'$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars.set(m[1], value);
  }
  return vars;
}

// Valeur sûre sur une ligne ; guillemets dès qu'un espace, #, guillemet ou $ pourrait être mal lu.
const serialize = (value) => (/^[A-Za-z0-9_\-.:/@+=,%]*$/.test(value) ? value : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

const readText = (path) => readFile(path, "utf8").catch(() => "");

export async function configStatus(projectDir) {
  const prefix = await publicPrefix(projectDir);
  const vars = parse(await readText(join(projectDir, ENV_FILE)));
  const services = presets(prefix).map((s) => ({
    ...s,
    fields: s.fields.map((f) => {
      const set = Boolean(vars.get(f.name));
      return { ...f, set, ...(set && !f.secret ? { value: vars.get(f.name) } : {}) };
    }),
  }));
  const known = new Set(services.flatMap((s) => s.fields.map((f) => f.name)));
  return { file: ENV_FILE, prefix, services, other: [...vars.keys()].filter((k) => !known.has(k)) };
}

async function ignored(projectDir) {
  try {
    await run("git", ["check-ignore", "-q", ENV_FILE], { cwd: projectDir, windowsHide: true });
    return true;
  } catch (err) {
    if (err.code === 1) return false; // repo Git, fichier non ignoré
  }
  // Pas de repo Git : on regarde le .gitignore tel quel.
  return /^(?:\.env\*?\.local|\.env\.local|\*\.local)\s*$/m.test(await readText(join(projectDir, ".gitignore")));
}

// updates : { NOM: "valeur" } pour écrire, { NOM: null } pour retirer.
export async function writeEnv(projectDir, updates) {
  const entries = Object.entries(updates ?? {});
  if (!entries.length) throw new HttpError(400, "Rien à enregistrer.");
  for (const [name, value] of entries) {
    if (!NAME_RE.test(name)) throw new HttpError(400, `Nom de variable invalide : ${name.slice(0, 60)}`);
    if (value === null) continue;
    if (typeof value !== "string" || /[\r\n\0]/.test(value)) throw new HttpError(400, `Valeur invalide pour ${name} : une seule ligne.`);
    if (value.length > MAX_VALUE) throw new HttpError(413, `Valeur trop longue pour ${name}.`);
  }

  // .env.local : lignes existantes gardées (commentaires compris), variables remplacées sur place.
  const path = join(projectDir, ENV_FILE);
  const lines = (await readText(path)).split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const pending = new Map(entries);
  const out = [];
  for (const line of lines) {
    const name = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
    if (name && pending.has(name)) {
      const value = pending.get(name);
      pending.delete(name);
      if (value !== null) out.push(`${name}=${serialize(value)}`);
    } else out.push(line);
  }
  for (const [name, value] of pending) if (value !== null) out.push(`${name}=${serialize(value)}`);
  // Secrets : lisibles par le seul propriétaire dès la création du fichier temporaire.
  await atomicWrite(path, out.length ? `${out.join("\n")}\n` : "", { mode: 0o600 });
  await chmod(path, 0o600);

  // Jamais commité : ajouté au .gitignore s'il ne l'est pas déjà.
  let gitignoreUpdated = false;
  if (!(await ignored(projectDir))) {
    const gi = await readText(join(projectDir, ".gitignore"));
    await atomicWrite(join(projectDir, ".gitignore"), `${gi}${gi && !gi.endsWith("\n") ? "\n" : ""}# Secrets locaux (Ottho Builder 2)\n.env*.local\n`);
    gitignoreUpdated = true;
  }

  // .env.example (versionné) : les noms, sans valeurs, pour savoir quoi remplir.
  const examplePath = join(projectDir, ".env.example");
  const example = await readText(examplePath);
  const listed = parse(example);
  const added = entries.filter(([name, value]) => value !== null && !listed.has(name)).map(([name]) => `${name}=`);
  if (added.length) await atomicWrite(examplePath, `${example}${example && !example.endsWith("\n") ? "\n" : ""}${added.join("\n")}\n`);

  return { gitignoreUpdated };
}
