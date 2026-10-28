// Environnement des processus lancés depuis l'app (serveur de l'aperçu).

// Variables propres à une session Claude Code en cours. Si l'app a été lancée depuis
// Claude Code, un processus lancé ensuite (serveur de l'aperçu) en hériterait, et un
// claude qu'il lancerait se croirait sous-session : pas de transcript écrit (donc pas de
// compte rendu d'agent), messagerie vers l'autre session.
// La configuration de l'élève (ANTHROPIC_*, CLAUDE_CODE_USE_BEDROCK…) est gardée.
const SESSION_VAR = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_CODE_(ENTRYPOINT|EXECPATH|SESSION_\w+|CHILD_SESSION|BRIDGE_\w+|MESSAGING_\w+|SSE_PORT))$/;

export const shellEnv = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !SESSION_VAR.test(name)));
