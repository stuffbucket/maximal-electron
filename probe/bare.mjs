// Temporary. Issue #149, rung 1: getLlama() in bare node, no Electron.
import { runSteps } from './steps.mjs';

await runSteps('bare-node', (line) => console.log(line));
process.exit(0);
