// Temporary. Issue #149: fork the application's own engine bundle and send it a
// probe request, the way `native/llama-host.ts` does.
//
// Given the bundle inside `app.asar`, this resolves `node-llama-cpp` exactly as
// the packaged application does, under an Electron whose fuses are not burned.
const { app, utilityProcess } = require('electron');

const worker = process.argv[2];
const BOUND_MS = Number(process.env.PROBE_BOUND_MS ?? 150_000);
const started = Date.now();

function stamp(stream, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.length > 0) {
      console.log(`${String(Date.now() - started).padStart(7)} ms ${stream} ${line}`);
    }
  }
}

app.whenReady().then(() => {
  stamp('---', `forking ${worker}`);
  const child = utilityProcess.fork(worker, [], { serviceName: 'llama', stdio: 'pipe' });

  let released = false;
  const release = (why) => {
    if (released) return;
    released = true;
    stamp('---', `released by ${why}, sending probe`);
    child.postMessage({ kind: 'probe', id: 'probe-149' });
  };

  child.stdout?.on('data', (chunk) => stamp('out', chunk));
  child.stderr?.on('data', (chunk) => stamp('err', chunk));
  child.on('spawn', () => {
    stamp('---', 'spawn');
    release('spawn');
  });
  child.on('message', (message) => {
    stamp('msg', JSON.stringify(message));
    if (message?.kind === 'hello') release('hello');
    if (message?.kind === 'loaded' || message?.kind === 'failed') {
      stamp('---', 'settled');
      child.kill();
      app.exit(0);
    }
  });
  child.on('exit', (code) => {
    stamp('---', `engine exited with code ${String(code)}`);
    app.exit(0);
  });

  setTimeout(() => {
    stamp('---', 'bound reached with no answer');
    child.kill();
    app.exit(1);
  }, BOUND_MS);
});
