#!/usr/bin/env node
// Node trop ancien : message clair avant tout le reste (visible dans .claude/ottho-builder.log
// quand le hook du plugin lance le Builder). Le serveur n'est chargé qu'ensuite.
import { nodeVersionError } from "../server/node-version.mjs";

const tooOld = nodeVersionError();
if (tooOld) {
  console.error(tooOld);
  process.exit(1);
}

const { main } = await import("../server/cli.mjs");

main(process.argv.slice(2))
  .then((app) => {
    if (!app) return;
    // Ctrl+C ou arrêt du terminal : on ferme proprement (aperçu compris).
    const stop = () => {
      app.close();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    process.on("SIGHUP", stop);
  })
  .catch((err) => {
    console.error(`Ottho Builder 2 : ${err.message}`);
    process.exit(1);
  });
