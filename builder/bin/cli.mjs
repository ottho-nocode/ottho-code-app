#!/usr/bin/env node
import { main } from "../server/cli.mjs";

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
