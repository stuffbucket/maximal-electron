import { riskOf, type ToolRisk } from './approval.js';
import { toGrammarSchema } from './grammar.js';
import { getEmbeddedModel, loadLlamaModule } from './llama.js';
import type { RiskyTool } from './toolsets.js';

/**
 * Running a turn on the embedded model.
 *
 * This is a second engine behind the same sink, not a second agent. The pi
 * path speaks HTTP to a proxy and owns its own loop. `node-llama-cpp` runs in
 * this process and owns the loop itself: it constrains sampling to the tool
 * grammar and calls the handler. Bending either one into the other's shape
 * would cost more than sharing the two things that actually matter.
 *
 * What is shared, and must stay shared:
 *
 * - **The gate.** A tool call goes through the same `approve` callback, with
 *   the same risk classification, as the pi path. Two ways to reach a shell
 *   with one way to permit it.
 * - **The sink.** The overlay does not know or care which engine ran.
 *
 * Grammar-constrained sampling is the reason this is worth having rather than
 * merely possible. A 0.6B model free-forms malformed JSON often enough to be
 * useless; constrained to the tool schema it cannot.
 */

/** Everything the run needs from the caller. */
export interface EmbeddedRun {
  prompt: string;
  systemPrompt: string;
  tools: RiskyTool[];
  onDelta: (text: string) => void;
  onTool: (name: string, phase: 'start' | 'end', isError?: boolean) => void;
  /** Resolve true to allow the call. The same gate the pi path uses. */
  approve: (tool: string, risk: ToolRisk, summary: string) => Promise<boolean>;
  signal: AbortSignal;
}

/** Text fed back to the model when a call is refused. */
const DENIED = 'The user denied this tool call. Do not retry it.';

/** Cap a turn so a runaway loop cannot hold the overlay open. */
const MAX_TOKENS = 800;

interface ChatSessionCtor {
  new (options: { contextSequence: unknown; systemPrompt: string }): {
    prompt: (
      text: string,
      options: Record<string, unknown>,
    ) => Promise<string>;
  };
}

/**
 * Run one turn.
 *
 * A fresh context per run, disposed at the end. Conversation history is not
 * carried between summons yet, so there is nothing to keep alive, and holding
 * a sequence open costs memory for no benefit.
 */
export async function runEmbedded(run: EmbeddedRun): Promise<void> {
  const nlc = await loadLlamaModule();
  const model = (await getEmbeddedModel()) as {
    createContext: (options: {
      contextSize: number;
    }) => Promise<{ getSequence: () => unknown; dispose: () => Promise<void> }>;
  };

  const defineFunction = nlc.defineChatSessionFunction as (
    definition: Record<string, unknown>,
  ) => unknown;
  const LlamaChatSession = nlc.LlamaChatSession as unknown as ChatSessionCtor;

  const context = await model.createContext({ contextSize: 4096 });

  try {
    const functions: Record<string, unknown> = {};
    const dropped: string[] = [];

    for (const entry of run.tools) {
      const name = entry.tool.name;
      const risk = riskOf(name, entry.risk);

      // llama.cpp constrains sampling to the tool's grammar, which is most of
      // why a model this small can call tools at all. A schema it cannot
      // express means the tool is dropped, not passed through unconstrained.
      const params = toGrammarSchema(entry.tool.parameters);
      if (!params) {
        dropped.push(name);
        continue;
      }

      functions[name] = defineFunction({
        description: entry.tool.description,
        params,
        handler: async (args: unknown) => {
          if (run.signal.aborted) return 'Cancelled.';

          const allowed = await run.approve(name, risk, summarise(args));
          if (!allowed) return DENIED;

          run.onTool(name, 'start');
          try {
            const result = await entry.tool.execute(
              `${name}-${String(Date.now())}`,
              args as never,
              run.signal,
            );
            run.onTool(name, 'end');
            return textOf(result);
          } catch (error) {
            run.onTool(name, 'end', true);
            // Returned, not thrown. The model can recover from a tool that
            // failed; it cannot recover from the turn ending.
            return `Tool failed: ${
              error instanceof Error ? error.message : String(error)
            }`;
          }
        },
      });
    }

    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: run.systemPrompt,
    });

    if (dropped.length > 0) {
      // Not silent. A dropped tool is the difference between "the model chose
      // not to" and "the model was never offered it", and only one of those is
      // worth debugging the prompt over.
      console.warn(
        `Embedded run: no grammar for ${dropped.join(', ')}. Those tools were not offered.`,
      );
    }

    await session.prompt(run.prompt, {
      functions,
      maxTokens: MAX_TOKENS,
      signal: run.signal,
      stopOnAbortSignal: true,
      onTextChunk: (chunk: string) => run.onDelta(chunk),
    });
  } finally {
    await context.dispose().catch(() => undefined);
  }
}

/** The part of a tool call worth showing in an approval prompt. */
function summarise(args: unknown): string {
  const record =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};
  const command = record.command;
  if (typeof command === 'string') return command;
  const file = record.path;
  if (typeof file === 'string') return file;
  try {
    return JSON.stringify(args ?? null);
  } catch {
    return String(args);
  }
}

/** Flatten a pi tool result into the string the model reads. */
function textOf(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return 'Done.';
  const text = content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: unknown }).type === 'text',
    )
    .map((part) => part.text)
    .join('\n');
  return text.length > 0 ? text : 'Done.';
}
