// Temporary. Issue #149: what llama.cpp packages did the build actually ship?
import fs from 'node:fs';
import path from 'node:path';

const unpacked = path.resolve(process.argv[2] ?? '');
const scope = path.join(unpacked, 'node_modules', '@node-llama-cpp');

console.log(`[scope] ${scope}`);
if (!fs.existsSync(scope)) {
  console.log('[scope] absent');
} else {
  for (const name of fs.readdirSync(scope)) {
    const bins = path.join(scope, name, 'bins');
    const inner = fs.existsSync(bins) ? fs.readdirSync(bins).join(', ') : 'no bins directory';
    console.log(`[scope] ${name}: ${inner}`);
  }
}

const nlc = path.join(unpacked, 'node_modules', 'node-llama-cpp', 'dist', 'bindings', 'utils');
console.log(
  `[scope] testBindingBinary.js present=${fs.existsSync(path.join(nlc, 'testBindingBinary.js')) ? 'yes' : 'no'}`,
);
