import { test } from "node:test";
import assert from "node:assert/strict";
import { shellEnv } from "./shellenv.mjs";

test("le shell n'hérite pas de la session Claude Code qui aurait lancé l'app", () => {
  const env = {
    SHELL: "/bin/zsh", PATH: "/usr/bin", ANTHROPIC_BASE_URL: "https://exemple", CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDECODE: "1", CLAUDE_PID: "12", CLAUDE_EFFORT: "high", CLAUDE_CODE_ENTRYPOINT: "cli", CLAUDE_CODE_EXECPATH: "/x",
    CLAUDE_CODE_SESSION_ID: "s", CLAUDE_CODE_SESSION_ATTENDED: "1", CLAUDE_CODE_CHILD_SESSION: "1",
    CLAUDE_CODE_BRIDGE_SESSION_ID: "b", CLAUDE_CODE_MESSAGING_SOCKET: "/sock", CLAUDE_CODE_MESSAGING_TOKEN: "t", CLAUDE_CODE_SSE_PORT: "9",
  };
  assert.deepEqual(Object.keys(shellEnv(env)).sort(), ["ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "PATH", "SHELL"]);
});
