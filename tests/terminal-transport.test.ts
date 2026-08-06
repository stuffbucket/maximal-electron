import { describe, expect, it } from 'vitest';

import {
  SHELL_TERMINAL_PROPERTIES,
  readTerminalTheme,
} from '../src/renderer/lib/terminal-transport.js';

/**
 * The colours the emulator is handed.
 *
 * `ghostty-web` parses an unrecognised colour to black, so a property that
 * resolves to nothing must be left out rather than passed through empty:
 * passing it through renders black on black. That is the behaviour these
 * tests exist for, and nothing asserted it before.
 */

const properties = SHELL_TERMINAL_PROPERTIES;

function reader(values: Record<string, string>) {
  return (property: string) => values[property] ?? '';
}

describe('readTerminalTheme', () => {
  it('passes every property through when all three resolve', () => {
    const theme = readTerminalTheme(
      reader({
        [properties.background]: '#101010',
        [properties.foreground]: '#f0f0f0',
        [properties.cursor]: '#ff8800',
      }),
      properties,
    );
    expect(theme).toEqual({
      background: '#101010',
      foreground: '#f0f0f0',
      cursor: '#ff8800',
    });
  });

  it('returns nothing when no property resolves', () => {
    expect(readTerminalTheme(reader({}), properties)).toEqual({});
  });

  it('omits a property that resolves to whitespace', () => {
    // getComputedStyle returns a leading space for a custom property.
    const theme = readTerminalTheme(
      reader({
        [properties.background]: '   ',
        [properties.foreground]: ' #f0f0f0',
        [properties.cursor]: '\t\n',
      }),
      properties,
    );
    expect(theme).toEqual({ foreground: '#f0f0f0' });
  });

  it('trims the value it keeps', () => {
    const theme = readTerminalTheme(
      reader({ [properties.background]: '  #101010  ' }),
      properties,
    );
    expect(theme.background).toBe('#101010');
  });

  it('omits the background alone', () => {
    const theme = readTerminalTheme(
      reader({
        [properties.foreground]: '#f0f0f0',
        [properties.cursor]: '#ff8800',
      }),
      properties,
    );
    expect(theme).toEqual({ foreground: '#f0f0f0', cursor: '#ff8800' });
  });

  it('omits the foreground alone', () => {
    const theme = readTerminalTheme(
      reader({
        [properties.background]: '#101010',
        [properties.cursor]: '#ff8800',
      }),
      properties,
    );
    expect(theme).toEqual({ background: '#101010', cursor: '#ff8800' });
  });

  it('omits the cursor alone', () => {
    const theme = readTerminalTheme(
      reader({
        [properties.background]: '#101010',
        [properties.foreground]: '#f0f0f0',
      }),
      properties,
    );
    expect(theme).toEqual({ background: '#101010', foreground: '#f0f0f0' });
  });

  it('reads each colour from its own property', () => {
    const asked: string[] = [];
    readTerminalTheme((property) => {
      asked.push(property);
      return property;
    }, properties);
    expect(asked).toEqual([
      properties.background,
      properties.foreground,
      properties.cursor,
    ]);
  });
});

describe('SHELL_TERMINAL_PROPERTIES', () => {
  it('names the three properties a consumer sets', () => {
    // `docs/shell-variables.md` documents these names, and a consumer's
    // stylesheet is the only place they are set.
    expect(SHELL_TERMINAL_PROPERTIES).toEqual({
      background: '--shell-terminal-background',
      foreground: '--shell-terminal-foreground',
      cursor: '--shell-terminal-cursor',
    });
  });
});
