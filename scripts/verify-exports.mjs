#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const failures = [];
const check = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`);
  if (!condition) failures.push(message);
};

console.log('Package dependency contract');
for (const dependency of ['react', 'react-dom']) {
  check(
    typeof manifest.peerDependencies?.[dependency] === 'string' &&
      typeof manifest.devDependencies?.[dependency] === 'string',
    `${dependency} is a consumer peer and a development dependency`,
  );
  check(
    manifest.dependencies?.[dependency] === undefined,
    `${dependency} is not installed as a package runtime dependency`,
  );
}

const exportTargets = [
  manifest.exports?.['./host']?.types,
  manifest.exports?.['./host']?.default,
  manifest.exports?.['./renderer']?.types,
  manifest.exports?.['./renderer']?.default,
  manifest.exports?.['./renderer/styles.css'],
];

console.log('Package export targets');
for (const target of exportTargets) {
  check(
    typeof target === 'string' && existsSync(path.join(root, target)),
    `${String(target)} exists`,
  );
}

const rendererEntry = path.join(root, manifest.exports['./renderer'].default);
const rendererSource = await readFile(rendererEntry, 'utf8');
const expectedExports = [
  'Canvas',
  'IconButton',
  'NavRail',
  'ShellLayout',
  'TabBar',
  'TitleBar',
  'getTabPanelId',
  'getTabTriggerId',
];
const actualExports = [
  ...rendererSource.matchAll(/export\s*\{([^}]+)}\s*from/g),
].flatMap((match) =>
  (match[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);
check(
  JSON.stringify(actualExports.sort()) === JSON.stringify(expectedExports),
  'renderer JavaScript exposes only the approved component surface',
);
check(
  import.meta.resolve(`${manifest.name}/renderer`) ===
    new URL(manifest.exports['./renderer'].default, `file://${root}/`).href,
  'renderer package specifier resolves to the built entry',
);

const forbidden = [
  /(?:^|\/)App(?:\.js)?$/,
  /(?:^|\/)lib\//,
  /Terminal/,
  /(?:^|\/)native\//,
  /demo/i,
  /fixture/i,
  /\.stories\./,
];
const visited = new Set();
const pending = [rendererEntry];
const importPattern = /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g;

while (pending.length > 0) {
  const file = pending.pop();
  if (!file || visited.has(file)) continue;
  visited.add(file);

  const relative = path.relative(root, file).split(path.sep).join('/');
  check(!forbidden.some((pattern) => pattern.test(relative)), `${relative} is generic`);

  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier) continue;
    const dependency = path.resolve(path.dirname(file), specifier);
    pending.push(dependency);
  }
}

const packed = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
  }),
)[0].files.map((file) => file.path);

console.log('\nPacked library artifacts');
for (const target of exportTargets) {
  const packedPath = target?.replace(/^\.\//, '');
  check(packed.includes(packedPath), `${String(packedPath)} is included by npm pack`);
}

if (failures.length > 0) {
  console.error(`\n${String(failures.length)} export check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll exports passed (${String(visited.size)} renderer modules inspected).`);
