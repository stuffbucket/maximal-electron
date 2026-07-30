import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/overlay.css';

import type { AgentApprovalRequest, ProviderStatus } from '../shared/ipc.js';

import { bridge } from './lib/bridge.js';
import { useBridgeEvent } from './lib/bridge.js';

/**
 * The floating command card, backed by the pi coding agent.
 *
 * The window is a full-screen transparent panel. Everything visible here is
 * CSS: a dim scrim, and a card near the bottom of the display. That split
 * comes from `stuffbucket/wiggle`, and it keeps the native surface small.
 *
 * The answer streams. `overlay:ask` returns as soon as the run starts, and
 * text arrives as `agent:delta` events, so a long answer appears as it is
 * written rather than all at once at the end.
 */

function providerLabel(status: ProviderStatus): string {
  switch (status.state) {
    case 'probing':
      return 'Looking for a local model…';
    case 'ready':
      return `${status.provider} · ${status.model}`;
    case 'unavailable':
      return status.reason;
  }
}

function Overlay() {
  const [status, setStatus] = useState<ProviderStatus>({ state: 'probing' });
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [tool, setTool] = useState<string>();
  const [approval, setApproval] = useState<AgentApprovalRequest>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const answerBox = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    void bridge.invoke('overlay:hide');
  }, []);

  // Probe on every summon. A backend can come up while the card is closed, and
  // wiggle's promise is that it connects the moment one appears.
  useEffect(() => {
    const probe = () => {
      void bridge.invoke('overlay:provider').then(setStatus);
    };
    probe();
    window.addEventListener('focus', probe);
    return () => window.removeEventListener('focus', probe);
  }, []);

  useEffect(() => {
    const focus = () => input.current?.focus();
    focus();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

  /* ------------------------------------------------------------- streaming */

  useBridgeEvent('agent:delta', ({ text }) => {
    setAnswer((current) => current + text);
  });

  useBridgeEvent('agent:tool', ({ name, phase }) => {
    // Show the running tool, then clear it. The user cares that the agent is
    // touching their machine, not about the arguments.
    setTool(phase === 'start' ? name : undefined);
  });

  useBridgeEvent('agent:approval', setApproval);

  useBridgeEvent('agent:end', (result) => {
    setBusy(false);
    setTool(undefined);
    setApproval(undefined);
    if (!result.ok) setError(result.error);
  });

  /**
   * Answer the pending prompt.
   *
   * The prompt clears immediately rather than waiting for the reply. The main
   * process settles the gate, and a second answer for the same id is ignored,
   * so an impatient double press cannot approve the next call by accident.
   */
  const decide = useCallback(
    (allow: boolean, remember = false) => {
      if (!approval) return;
      void bridge.invoke('overlay:approve', { id: approval.id, allow, remember });
      setApproval(undefined);
    },
    [approval],
  );

  // Keep the newest text in view while it streams.
  useEffect(() => {
    const box = answerBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [answer]);

  /* ---------------------------------------------------------------- input */

  const submit = useCallback(() => {
    const text = prompt.trim();
    if (!text || busy) return;

    setBusy(true);
    setAnswer('');
    setError(undefined);

    void bridge.invoke('overlay:ask', { prompt: text }).then((accepted) => {
      if (accepted.started) return;
      setBusy(false);
      setError(accepted.reason);
    });
  }, [prompt, busy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A pending prompt owns the keyboard. Enter allows, Escape denies. This
      // comes before the abort branch, so Escape answers the question in front
      // of the user rather than killing the run underneath it.
      if (approval) {
        if (event.key === 'Enter') {
          event.preventDefault();
          decide(true);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          decide(false);
        }
        return;
      }

      if (event.key !== 'Escape') return;
      // Escape stops a run first, and only dismisses once idle. Otherwise a
      // long answer would keep streaming into a card nobody can see.
      if (busy) {
        void bridge.invoke('overlay:abort');
        setBusy(false);
        return;
      }
      hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [approval, busy, decide, hide]);

  const ready = status.state === 'ready';

  return (
    // Clicking the scrim dismisses, the way a modal does. The card stops the
    // event so a click inside never closes it.
    <div
      className="scrim"
      onMouseDown={() => {
        // Dismissing with a question on screen answers it. Leaving the gate
        // open would park the run until the timeout, and every summon in that
        // window would report the agent as busy.
        if (approval) decide(false);
        hide();
      }}
      data-testid="overlay-scrim"
    >
      <div
        className="card"
        onMouseDown={(event) => event.stopPropagation()}
        data-testid="overlay-card"
      >
        <textarea
          ref={input}
          className="card__input"
          rows={2}
          placeholder={ready ? 'Ask anything…' : 'Waiting for a local model…'}
          value={prompt}
          disabled={!ready}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends. Shift and Enter makes a new line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          data-testid="overlay-input"
        />

        {(answer || error) && (
          <div
            className="card__answer"
            ref={answerBox}
            data-testid="overlay-answer"
          >
            {answer}
            {error && <span className="card__error">{error}</span>}
          </div>
        )}

        {approval && (
          <div className="approval" data-testid="overlay-approval">
            <div className="approval__head">
              Run <code className="approval__tool">{approval.tool}</code>?
            </div>
            <pre className="approval__summary" data-testid="overlay-approval-summary">
              {approval.summary}
            </pre>
            <div className="approval__actions">
              <button
                type="button"
                className="approval__button"
                onClick={() => decide(false)}
                data-testid="overlay-deny"
              >
                Deny
              </button>
              <button
                type="button"
                className="approval__button approval__button--primary"
                onClick={() => decide(true)}
                data-testid="overlay-allow"
              >
                Allow
              </button>
              <button
                type="button"
                className="approval__button"
                onClick={() => decide(true, true)}
                data-testid="overlay-allow-always"
              >
                Allow every {approval.tool}
              </button>
            </div>
          </div>
        )}

        <div className="card__footer">
          <span
            className={`card__status card__status--${status.state}`}
            data-testid="overlay-status"
          >
            {approval
              ? `Waiting for you to approve ${approval.tool}`
              : tool
                ? `Running ${tool}…`
                : busy
                  ? 'Thinking…'
                  : providerLabel(status)}
          </span>
          <span className="card__hint">
            {approval
              ? 'Enter to allow · Esc to deny'
              : busy
                ? 'Esc to stop'
                : 'Enter to send · Esc to dismiss'}
          </span>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
