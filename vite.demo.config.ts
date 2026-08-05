import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = resolve(__dirname, 'e2e/fixtures/demo-shell');

// The capture fixture's renderer.
//
// A second Forge renderer entry, built beside the product's and kept out of the
// package by the `ignore` predicate in `forge.config.ts`. It exists so the demo
// shell is a separate bundle rather than dead weight inside the one a user
// installs.
//
// `outDir` is absolute for the same reason `vite.renderer.config.ts` needs it:
// Forge's default is relative to the root it sets, so overriding `root` sends
// the output to `e2e/fixtures/demo-shell/.vite/...` and it never reaches the
// build. `emptyOutDir` is explicit because Vite will not clear a directory
// outside its root without being told.
export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '.vite/renderer/demo_window'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { index: resolve(root, 'index.html') },
    },
  },
});
