// Temporary. Issue #149, rung 3.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STEPS = pathToFileURL(path.join(__dirname, 'steps.mjs')).href;

void (async () => {
  const { runSteps } = await import(STEPS);
  await runSteps('electron-utility', (line) => process.stdout.write(`${line}\n`));
  process.exit(0);
})();
