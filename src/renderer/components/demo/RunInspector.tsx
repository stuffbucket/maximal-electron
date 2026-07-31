import { Check, PanelRight, X } from 'lucide-react';

import { RUNS, type AgentRun } from '../../lib/demo-runs.js';
import { IconButton } from '../Controls.js';

import { StatusChip } from './RunCanvas.js';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{value}</span>
    </div>
  );
}

/**
 * What the inspector shows when nothing is selected.
 *
 * This used to repeat the four status counts, which the left rail already
 * carries and the status bar summarised again. Three renderings of one fact on
 * one screen, and the only reason this one existed was to stop the panel
 * looking empty.
 *
 * A count is not worth repeating. Which runs are blocked is worth knowing, and
 * it is the one thing on this screen a rail of numbers cannot tell you, so the
 * empty state names them and offers a way in.
 */
function WaitingOnYou({ onSelect }: { onSelect: (id: string) => void }) {
  const blocked = RUNS.filter((run) => run.status === 'blocked');
  if (blocked.length === 0) return undefined;

  return (
    <section className="inspector__section">
      <h3 className="inspector__title">Waiting on you</h3>
      {blocked.map((run) => (
        <button
          key={run.id}
          type="button"
          className="waiting__item"
          onClick={() => onSelect(run.id)}
          data-testid={`waiting-${run.id}`}
        >
          <span className="waiting__title">{run.task}</span>
          <span className="waiting__meta">{run.pendingSummary ?? run.step}</span>
        </button>
      ))}
    </section>
  );
}

/**
 * The demo right panel.
 *
 * Same shape as the production `Inspector`: properties of the selection, and a
 * fallback when there is none. Here the selection is an agent run, so the
 * properties are the ones an operator watches — model, step, tool calls, tokens
 * — and a blocked run offers the approval pair the real gate would show.
 */
export function RunInspector({
  run,
  onCollapse,
  onSelect,
}: {
  run: AgentRun | undefined;
  onCollapse: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="inspector" data-testid="inspector">
      <header className="inspector__header">
        <h2 className="inspector__title">{run ? 'Agent run' : 'Fleet'}</h2>
        <span className="titlebar__grow" />
        <IconButton label="Collapse panel" onClick={onCollapse}>
          <PanelRight size={15} />
        </IconButton>
      </header>

      <div className="inspector__body">
        {run ? (
          <>
            <section className="inspector__section">
              <StatusChip run={run} />
              <p className="run-detail__task">{run.task}</p>
              <p className="card__sub">{run.step}</p>
            </section>

            {run.status === 'blocked' && (
              <section className="approval" data-testid="approval">
                <h3 className="inspector__title">Waiting on you</h3>
                <p className="approval__summary">
                  <span className="mono-chip">{run.pendingTool ?? 'tool'}</span>
                  {run.pendingSummary ?? run.step}
                </p>
                <div className="approval__actions">
                  <button type="button" className="approval__allow">
                    <Check size={13} /> Allow
                  </button>
                  <button type="button" className="approval__deny">
                    <X size={13} /> Deny
                  </button>
                </div>
              </section>
            )}

            <section className="inspector__section">
              <h3 className="inspector__title">Details</h3>
              <Field label="Project" value={run.project} />
              <Field label="Branch" value={run.branch} />
              <Field label="Model" value={run.model} />
              <Field label="Elapsed" value={run.elapsed} />
              <Field label="Tokens" value={run.tokens} />
              <Field label="Diff" value={run.diff} />
            </section>

            <section className="inspector__section">
              <h3 className="inspector__title">Tool calls</h3>
              {run.tools.map((tool) => (
                <div key={tool.name} className="tool-use">
                  <span className="mono-chip">{tool.name}</span>
                  <span className="tool-use__bar">
                    <span
                      className="tool-use__fill"
                      style={{ width: `${String(Math.min(100, tool.calls * 2))}%` }}
                    />
                  </span>
                  <span className="row__sub">{tool.calls}</span>
                </div>
              ))}
            </section>
          </>
        ) : (
          <>
            <p className="card__sub">Select a run to inspect it.</p>
            <WaitingOnYou onSelect={onSelect} />
          </>
        )}
      </div>
    </div>
  );
}
