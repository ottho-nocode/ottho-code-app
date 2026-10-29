// Instantané Git utile au calcul des statuts. null si le dossier n'est pas un repo.
// execFile (pas de shell) : aucun argument n'est interprété.
// --no-optional-locks : git status ne réécrit pas .git/index, que surveille la signature (sinon
// chaque lecture déclencherait la suivante). windowsHide : le Builder tourne sans console sous
// Windows, chaque git y ouvrirait une fenêtre.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd, args) {
  const { stdout } = await run("git", ["--no-optional-locks", ...args], { cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

export async function readGit(cwd) {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return null;
  }
  const lines = async (args) => (await git(cwd, args).catch(() => "")).split("\n").filter(Boolean);
  const branches = await lines(["branch", "--format=%(refname:short)"]);
  const base = branches.includes("develop") ? "develop" : branches.includes("main") ? "main" : null;
  const [subjects, baseSubjects, current, changes] = await Promise.all([
    lines(["log", "--all", "--format=%s", "--max-count=5000"]),
    base ? lines(["log", base, "--format=%s", "--max-count=5000"]) : [],
    git(cwd, ["branch", "--show-current"]).catch(() => ""),
    // Fichiers modifiés ou nouveaux, pas encore commités (fichiers ignorés exclus).
    lines(["status", "--porcelain", "--untracked-files=normal"]),
  ]);
  return { branches, base, subjects, baseSubjects, current, dirty: changes.length };
}
