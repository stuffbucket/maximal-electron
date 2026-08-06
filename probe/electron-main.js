// Temporary. Issue #149, rungs 2 and 3: getLlama() in an Electron main process,
// then in an Electron utilityProcess forked from it.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, utilityProcess } = require('electron');

const STEPS = pathToFileURL(path.join(__dirname, 'steps.mjs')).href;
const ROOT = process.env.PROBE_ROOT ?? process.cwd();

function utilityRung() {
  return new Promise((resolve) => {
    const child = utilityProcess.fork(path.join(__dirname, 'utility.js'), [], {
      stdio: 'pipe',
      env: { ...process.env, PROBE_ROOT: ROOT },
    });
    let buffered = '';
    child.stdout?.on('data', (chunk) => {
      buffered += String(chunk);
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) console.log(line);
    });
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    child.on('exit', (code) => {
      if (buffered.length > 0) console.log(buffered);
      console.log(`[electron-utility] child exited with code ${String(code)}`);
      resolve();
    });
  });
}

app.whenReady().then(async () => {
  const { runSteps } = await import(STEPS);
  await runSteps('electron-main', (line) => console.log(line));
  await utilityRung();
  app.exit(0);
});
