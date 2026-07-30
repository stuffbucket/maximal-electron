import { Check, PanelRight, X } from 'lucide-react';

import { fleetSummary } from '../../lib/demo.js';
import {
  RUNS,
  STATUS_LABELS,
  type AgentRun,
  type RunStatus,
} from '../../lib/demo-runs.js';
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

/** How many runs sit in each bucket, shown when nothing is selected. */
function FleetSummary() {
  const order: RunStatus[] = ['running', 'blocked', 'done', 'failed'];

  return (
    <section className="inspector__section">
      <h3 className="inspector__title">By status</h3>
      {order.map((status) => (
        <div key={status} className="field field--status">
          <span className="field__label">
            <span className="dot" data-status={status} /> {STATUS_LABELS[status]}
          </span>
          <span className="field__value">
            {RUNS.filter((run) => run.status === status).length}
          </span>
        </div>
      ))}
      <p className="card__sub">{fleetSummary()}</p>
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
}: {
  run: AgentRun | undefined;
  onCollapse: () => void;
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
            <FleetSummary />
          </>
        )}
      </div>
    </div>
  );
}
