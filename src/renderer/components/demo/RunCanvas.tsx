import { Bot, GitBranch, LayoutGrid, List } from 'lucide-react';

import type { ViewMode } from '../Canvas.js';
import { STATUS_LABELS, type AgentRun } from '../../lib/demo-runs.js';

/** A filled pill carrying the run state. Colour comes from the status tokens. */
export function StatusChip({ run }: { run: AgentRun }) {
  return (
    <span className="chip" data-status={run.status}>
      {STATUS_LABELS[run.status]}
    </span>
  );
}

/** The view-mode switch, plus the count for the current view. */
export function RunToolbar({
  title,
  mode,
  onModeChange,
}: {
  title: string;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="toolbar">
      <h1 className="toolbar__title">{title}</h1>
      <span className="toolbar__grow" />
      <div className="segmented" role="group" aria-label="View mode">
        <button
          type="button"
          aria-pressed={mode === 'grid'}
          aria-label="Grid view"
          onClick={() => onModeChange('grid')}
          data-testid="mode-grid"
        >
          <LayoutGrid size={14} />
        </button>
        <button
          type="button"
          aria-pressed={mode === 'list'}
          aria-label="List view"
          onClick={() => onModeChange('list')}
          data-testid="mode-list"
        >
          <List size={14} />
        </button>
      </div>
    </div>
  );
}

function RunCard({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="card run-card"
      data-status={run.status}
      aria-selected={selected}
      onClick={onSelect}
      data-testid={`run-${run.id}`}
    >
      <span className="run-card__head">
        <StatusChip run={run} />
        <span className="run-card__elapsed">{run.elapsed}</span>
      </span>
      <span className="card__meta run-card__meta">
        <span className="card__name run-card__task">{run.task}</span>
        <span className="card__sub">
          <GitBranch size={11} /> {run.project} · {run.branch}
        </span>
        <span className="run-card__step">{run.step}</span>
      </span>
      <span className="run-card__foot">
        <span className="mono-chip">
          <Bot size={11} /> {run.model}
        </span>
        <span className="run-card__diff">{run.diff}</span>
      </span>
    </button>
  );
}

function RunRow({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="row run-row"
      aria-selected={selected}
      onClick={onSelect}
      data-testid={`run-${run.id}`}
    >
      <span className="dot" data-status={run.status} />
      <span className="row__name">{run.task}</span>
      <span className="row__sub run-row__project">{run.project}</span>
      <span className="row__sub run-row__model">{run.model}</span>
      <span className="row__sub run-row__tokens">{run.tokens}</span>
      <span className="row__sub run-row__elapsed">{run.elapsed}</span>
    </button>
  );
}

/**
 * The demo canvas: agent runs as cards, or as a dense queue.
 *
 * It reuses the production `.card`, `.row`, `.grid`, and `.list` classes, so
 * the two modes keep the same geometry the real shell has. The run-specific
 * classes only add the status colour and the extra columns.
 */
export function RunCanvas({
  runs,
  mode,
  selectedId,
  onSelect,
}: {
  runs: AgentRun[];
  mode: ViewMode;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="canvas">
        <div className="empty">
          <Bot size={24} />
          <p>No agent runs in this view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas" data-testid="canvas">
      <div className={mode === 'grid' ? 'grid grid--runs' : 'list'} data-testid={`view-${mode}`}>
        {runs.map((run) =>
          mode === 'list' ? (
            <RunRow
              key={run.id}
              run={run}
              selected={run.id === selectedId}
              onSelect={() => onSelect(run.id)}
            />
          ) : (
            <RunCard
              key={run.id}
              run={run}
              selected={run.id === selectedId}
              onSelect={() => onSelect(run.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}
