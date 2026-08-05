import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The product's stylesheet first: it carries the tokens, the panel chrome, and
// every class the shared components use. `demo.css` adds only what the fleet
// needs on top.
import '../../../src/renderer/styles/shell.css';
import './demo.css';

import { DemoApp } from './DemoApp.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
