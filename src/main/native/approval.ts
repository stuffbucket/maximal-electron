import type { AgentApproval } from '../../shared/ipc.js';

/**
 * Approval policy for the overlay agent's tools.
 *
 * The agent has a shell in the working directory, and it is summoned by a
 * global accelerator. So a tool call can start from anywhere, over any window,
 * without the user having asked this application for anything. That is the
 * reason a gate exists at all.
 *
 * This module is deliberately pure. It imports nothing from `electron`, so it
 * runs under plain Node and is in the `stryker.conf.json` mutate list. The
 * decision of what to gate is exactly the kind of logic a green suite can
 * cover without actually testing.
 */

/**
 * Tools that only read. They still touch the user's disk, so `all` gates them
 * too, but they cannot change anything.
 *
 * This is an allow-list rather than a deny-list. An unrecognised tool needs
 * approval, so adding a tool cannot silently widen what runs unattended.
 */
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(['read']);

/** Longest summary shown in the card. Longer text is truncated. */
export const MAX_SUMMARY = 200;

/** Does this tool call need a decision from the user? */
export function needsApproval(policy: AgentApproval, tool: string): boolean {
  if (policy === 'none') return false;
  if (policy === 'all') return true;
  return !READ_ONLY_TOOLS.has(tool);
}

/** Cut `text` to `MAX_SUMMARY`, marking that something was removed. */
function truncate(text: string): string {
  if (text.length <= MAX_SUMMARY) return text;
  return `${text.slice(0, MAX_SUMMARY - 1)}…`;
}

/**
 * A one-line description of what the agent is about to do.
 *
 * The user is deciding under time pressure, over whatever they were doing. So
 * this shows the part that carries the risk: the command for `bash`, the path
 * for anything touching a file.
 *
 * Arguments arrive validated against the tool's schema, but this must not
 * assume a shape. A model can call a tool this build does not know about.
 */
export function describeToolCall(tool: string, args: unknown): string {
  const record: Record<string, unknown> =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};

  const command = record.command;
  if (typeof command === 'string') return truncate(command);

  const path = record.path;
  if (typeof path === 'string') return truncate(path);

  // Unknown tool, or a known tool called with an unexpected shape. Show the
  // arguments rather than nothing, because an empty prompt reads as harmless.
  try {
    return truncate(JSON.stringify(args ?? null));
  } catch {
    // A cyclic or otherwise unserialisable value. Never let this throw: it
    // runs inside the gate, and a throw here would deny by accident rather
    // than by decision.
    return truncate(String(args));
  }
}
