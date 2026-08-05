#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist/renderer');

await mkdir(output, { recursive: true });
await copyFile(
  path.join(root, 'src/renderer/styles/structural.css'),
  path.join(output, 'styles.css'),
);
