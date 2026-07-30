import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/shell.css';

import { App } from './App.js';
import { DemoApp } from './components/demo/DemoApp.js';
import { isDemoShell } from './lib/demo.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

// Demo mode is a separate tree, chosen once at mount. `STUFFBUCKET_DEMO=1`
// makes the main process load this page with `?demo=1`. Without it the demo
// tree is never mounted, and the shell behaves exactly as it always has.
createRoot(container).render(
  <StrictMode>{isDemoShell() ? <DemoApp /> : <App />}</StrictMode>,
);
