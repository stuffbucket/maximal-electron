import * as Tooltip from '@radix-ui/react-tooltip';
import { createElement } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';

// The product's own stylesheet, which pulls in controls.css and tokens.css.
// A story is looking at the real thing or it is looking at nothing.
import '../src/renderer/styles/shell.css';
// Then undo the parts of its document reset that assume an application window.
import './preview.css';

/**
 * Theme, as a toolbar switch.
 *
 * The palette is defined twice in `tokens.css` and selected by `data-theme` on
 * the document root, exactly as `useThemePreference` does it at run time. Every
 * story therefore gets both schemes for free, which is the one thing that was
 * genuinely hard to see before: the light palette only ever appeared by driving
 * the application and toggling a preference.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals['theme'] as string;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  return Story();
};

/**
 * `IconButton` wraps its child in a Radix `Tooltip.Root`, which needs a
 * provider above it. `ShellLayout` supplies one in the application; a story
 * has no shell, and without this the button renders nothing rather than
 * throwing. Global, because forgetting it per story is exactly the trap.
 */
const withTooltips: Decorator = (Story) =>
  createElement(Tooltip.Provider, { delayDuration: 200, children: Story() });

const preview: Preview = {
  decorators: [withTooltips, withTheme],
  // A docs page for every component, from its args and its docstring.
  tags: ['autodocs'],
  initialGlobals: { theme: 'dark' },
  globalTypes: {
    theme: {
      description: 'Colour scheme',
      toolbar: {
        icon: 'contrast',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
          { value: 'system', title: 'System' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    backgrounds: { disable: true },
  },
};

export default preview;
