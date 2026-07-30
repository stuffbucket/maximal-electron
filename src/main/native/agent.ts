import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

import {
  Agent,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type AgentTool,
  type AgentToolResult,
  type AgentToolUpdateCallback,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { stream } from '@earendil-works/pi-ai/compat';
import type { TSchema } from 'typebox';

import type {
  AgentApprovalRequest,
  AgentProvider,
  ApproveRequest,
  ProviderStatus,
} from '../../shared/ipc.js';

import { describeToolCall, needsApproval, riskOf, type ToolRisk } from './approval.js';
import { getPreferences } from './preferences.js';
import { buildToolsetTools } from './toolsets.js';

/**
 * The overlay agent, powered by the pi coding agent.
 *
 * Two pieces do the work, both from `badlogic/pi-mono`:
 *
 * - `@earendil-works/pi-ai` is the provider layer. It streams from an
 *   Anthropic-compatible or OpenAI-compatible endpoint.
 * - `@earendil-works/pi-agent-core` is the agent loop: it decides when to call
 *   a tool, runs it, feeds the result back, and repeats until the model stops.
 *
 * Backend discovery copies `stuffbucket/wiggle`, and the property worth keeping
 * is that there is **nothing to configure to start**:
 *
 * 1. Try maximal on `localhost:4141`. It speaks the Anthropic API.
 * 2. Fall back to Ollama on `localhost:11434`.
 * 3. If neither is up, say so plainly. Never demand a key.
 *
 * So this application holds no API key, and maximal is the default backend
 * without being a hard dependency.
 */

const MAXIMAL_BASE = 'http://localhost:4141';
const OLLAMA_BASE = 'http://localhost:11434';

/** Wiggle pins this model for maximal. Keep them in step. */
const MAXIMAL_MODEL = 'claude-haiku-4-5';
const OLLAMA_MODEL = 'llama3.2';

/** A probe must not hang the overlay, so every request is bounded. */
const PROBE_TIMEOUT_MS = 1500;

/**
 * maximal supplies the real credential, and Ollama wants none. pi-ai still
 * requires the field, so this is a placeholder rather than a secret.
 */
const PLACEHOLDER_KEY = 'supplied-by-local-backend';

const SYSTEM_PROMPT = [
  'You are a concierge embedded in the Stuffbucket desktop application.',
  'Answer in a few sentences unless asked for more.',
  'You can read and change this application through your tools. When asked',
  'about how the application is set up, call get_app_state rather than',
  'guessing. When asked to change the appearance, call set_theme.',
  'You also have read, write, edit, and bash tools for the working directory.',
  'Use a tool only when it is needed to answer or to act. Answer general',
  'questions directly, without calling anything.',
  'Never run a destructive command without being asked to.',
].join(' ');

/* ---------------------------------------------------------------- discovery */

async function reachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return (await fetch(url, { signal: controller.signal })).ok;
  } catch {
    // Connection refused, DNS failure, or the timeout above. All mean "not up".
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Order is deliberate: a running maximal wins over a generic Ollama install. */
export async function discoverProvider(): Promise<ProviderStatus> {
  if (await reachable(`${MAXIMAL_BASE}/v1/models`)) {
    return { state: 'ready', provider: 'maximal', model: MAXIMAL_MODEL };
  }
  if (await reachable(`${OLLAMA_BASE}/api/tags`)) {
    return { state: 'ready', provider: 'ollama', model: OLLAMA_MODEL };
  }
  return {
    state: 'unavailable',
    reason:
      'No local model backend found. Start maximal on port 4141, or Ollama on port 11434.',
  };
}

/**
 * Build the model descriptor pi-ai streams from.
 *
 * maximal speaks the Anthropic messages API. Ollama exposes an
 * OpenAI-compatible endpoint under `/v1`. Costs are zeroed because both run
 * locally, and pi only uses them for reporting.
 */
function buildModel(provider: AgentProvider, id: string) {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  return provider === 'maximal'
    ? {
        id,
        name: id,
        api: 'anthropic-messages' as const,
        provider: 'anthropic' as const,
        baseUrl: MAXIMAL_BASE,
        reasoning: false,
        input: ['text' as const],
        cost: zero,
        contextWindow: 200_000,
        maxTokens: 4096,
      }
    : {
        id,
        name: id,
        api: 'openai-completions' as const,
        provider: 'openai' as const,
        baseUrl: `${OLLAMA_BASE}/v1`,
        reasoning: false,
        input: ['text' as const],
        cost: zero,
        contextWindow: 32_000,
        maxTokens: 4096,
      };
}

/* -------------------------------------------------------------------- tools */

/**
 * Bind the built-in tools to a Node execution context.
 *
 * The harness tools take their context as a fifth argument to `execute`, which
 * the plain `Agent` does not pass. This closes over it, and that closure is the
 * whole bridge between the two layers.
 *
 * The cast is deliberate and narrow. Each factory returns a tool with its own
 * parameter schema, so the four have no common generic instantiation; binding
 * one argument cannot be expressed without erasing that schema. The runtime
 * shape is unchanged, and the schema is still enforced by pi at call time.
 */
type BoundTool = AgentTool<TSchema, unknown>;

/** Tools for a run, plus what each one is allowed to do. */
interface ToolSet {
  tools: BoundTool[];
  risk: Map<string, ToolRisk>;
}

function buildTools(options: {
  cwd: string;
  toolsetIds: readonly string[];
  /** Include the read, write, edit, and bash tools from pi. */
  coding: boolean;
}): ToolSet {
  const risk = new Map<string, ToolRisk>();
  const tools: BoundTool[] = [];

  if (options.coding) {
    const context = { env: new NodeExecutionEnv({ cwd: options.cwd }) };
    const factories = [
      createReadTool(),
      createWriteTool(),
      createEditTool(),
      createBashTool(),
    ];

    for (const tool of factories) {
      const execute = tool.execute.bind(tool) as (
        toolCallId: string,
        params: unknown,
        signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<unknown> | undefined,
        context: { env: NodeExecutionEnv },
      ) => Promise<AgentToolResult<unknown>>;

      tools.push({
        ...tool,
        execute: (toolCallId, params, signal, onUpdate) =>
          execute(toolCallId, params, signal, onUpdate, context),
      } as BoundTool);
      risk.set(tool.name, riskOf(tool.name));
    }
  }

  // Toolsets are resolved here, at run start, which is what makes them
  // swappable. A change lands on the next summon rather than mid-run.
  for (const entry of buildToolsetTools(options.toolsetIds)) {
    tools.push(entry.tool);
    risk.set(entry.tool.name, entry.risk);
  }

  return { tools, risk };
}

/* ------------------------------------------------------------------ running */

/** Callbacks the main process wires to IPC events. */
export interface AgentSink {
  onDelta: (text: string) => void;
  onTool: (name: string, phase: 'start' | 'end', isError?: boolean) => void;
  onApproval: (request: AgentApprovalRequest) => void;
  onEnd: (result: { ok: true } | { ok: false; error: string }) => void;
}

/**
 * How long a tool call waits for a decision before it denies itself.
 *
 * A gate that waits forever is worse than no gate. The card can be dismissed
 * with the scrim while a call is pending, and then nothing would ever answer.
 * The run would hold `active` until the process exits, and every later summon
 * would report that it is still busy.
 */
const APPROVAL_TIMEOUT_MS = 45_000;

/** Text fed back to the model when a call is refused. */
const DENIED = 'The user denied this tool call. Do not retry it.';

interface PendingApproval {
  tool: string;
  settle: (allow: boolean) => void;
  timer?: ReturnType<typeof setTimeout>;
}

interface ActiveRun {
  agent: Agent;
  controller: AbortController;
  /** Tools the user allowed for the rest of this run. Never persisted. */
  allowed: Set<string>;
  pending: Map<string, PendingApproval>;
}

let active: ActiveRun | undefined;

export function isAgentBusy(): boolean {
  return active !== undefined;
}

/** Stop the current run. Safe to call when nothing is running. */
export function abortAgent(): void {
  const run = active;
  if (!run) return;

  // Deny anything waiting first. The agent loop is parked inside the gate, and
  // `abort` alone does not settle that promise.
  for (const entry of [...run.pending.values()]) entry.settle(false);

  run.agent.abort();
  run.controller.abort();
  active = undefined;
}

/**
 * Answer a pending approval.
 *
 * An unknown id is ignored rather than treated as an error. It means the call
 * already timed out, or the run was aborted, and the renderer is answering a
 * prompt that no longer exists.
 */
export function resolveApproval(request: ApproveRequest): void {
  const run = active;
  const entry = run?.pending.get(request.id);
  if (!run || !entry) return;

  // Remember only applies to an allow. "Deny and remember" would silently
  // break the rest of the run with no way to see why.
  if (request.allow && request.remember) run.allowed.add(entry.tool);

  entry.settle(request.allow);
}

/** Ask the renderer, and wait. Resolves false on timeout or abort. */
function requestApproval(
  pending: Map<string, PendingApproval>,
  tool: string,
  summary: string,
  sink: AgentSink,
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = randomUUID();

    const entry: PendingApproval = {
      tool,
      settle: (allow) => {
        // `delete` returns false when this was already settled, which makes
        // the timeout and a late answer race harmlessly.
        if (!pending.delete(id)) return;
        clearTimeout(entry.timer);
        resolve(allow);
      },
    };

    pending.set(id, entry);
    entry.timer = setTimeout(() => entry.settle(false), APPROVAL_TIMEOUT_MS);
    // A pending prompt must not keep the process alive on its own.
    entry.timer.unref?.();

    sink.onApproval({ id, tool, summary });
  });
}

/**
 * Start a run. Returns once the run finishes; progress arrives through `sink`.
 *
 * One run at a time. A second prompt while the first is in flight would
 * interleave two transcripts in one overlay card.
 */
export async function runAgent(prompt: string, sink: AgentSink): Promise<void> {
  if (active) {
    sink.onEnd({ ok: false, error: 'Already working on the previous request.' });
    return;
  }

  const status = await discoverProvider();
  if (status.state !== 'ready') {
    sink.onEnd({
      ok: false,
      error: status.state === 'probing' ? 'Still probing.' : status.reason,
    });
    return;
  }

  const prefs = getPreferences();
  const controller = new AbortController();
  const allowed = new Set<string>();
  const pending = new Map<string, PendingApproval>();

  // The `app` toolset stays on even when coding tools are off. It only reads
  // and changes this application, which is the concierge case, and it is what
  // makes the agent useful without giving it the machine.
  const built = buildTools({
    cwd: prefs.agentCwd || homedir(),
    toolsetIds: prefs.agentToolsets,
    coding: prefs.agentTools,
  });

  const agent = new Agent({
    streamFn: (model, context, options) =>
      stream(model, context, { ...options, apiKey: PLACEHOLDER_KEY }),

    /**
     * The gate. This is the only thing standing between a model and a shell
     * on the user's machine, so it denies rather than throws on every edge:
     * timeout, abort, and an unanswerable prompt all end as a refusal.
     */
    beforeToolCall: async ({ toolCall, args }) => {
      const tool = toolCall.name;
      const risk = riskOf(tool, built.risk.get(tool));
      if (!needsApproval(prefs.agentApproval, risk)) return undefined;
      if (allowed.has(tool)) return undefined;

      const summary = describeToolCall(tool, args);
      const ok = await requestApproval(pending, tool, summary, sink);
      return ok ? undefined : { block: true, reason: DENIED };
    },

    initialState: {
      model: buildModel(status.provider, status.model),
      systemPrompt: SYSTEM_PROMPT,
      tools: built.tools,
    },
  });

  active = { agent, controller, allowed, pending };

  const unsubscribe = agent.subscribe((event) => {
    if (event.type === 'message_update') {
      const inner = event.assistantMessageEvent;
      // Only text deltas reach the card. Tool arguments stream too, and showing
      // those would put raw JSON in front of the user mid-sentence.
      if (inner.type === 'text_delta') sink.onDelta(inner.delta);
      return;
    }
    if (event.type === 'tool_execution_start') {
      sink.onTool(event.toolName, 'start');
      return;
    }
    if (event.type === 'tool_execution_end') {
      sink.onTool(event.toolName, 'end', event.isError);
    }
  });

  try {
    await agent.prompt(prompt);
    sink.onEnd({ ok: true });
  } catch (error) {
    sink.onEnd({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    unsubscribe();
    // A run that failed mid-gate can leave a prompt outstanding. Settle it, or
    // the timer holds a resolver for a run that is already gone.
    for (const entry of [...pending.values()]) entry.settle(false);
    active = undefined;
  }
}
