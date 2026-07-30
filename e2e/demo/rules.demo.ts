import { expect, test } from '@playwright/test';

import {
  GAP_SECONDS,
  MAX_FINAL_PAD_SECONDS,
  MIN_HOLD_SECONDS,
  MIN_TOTAL_SECONDS,
  SETTLE_SECONDS,
  scene,
  validateTimeline,
} from './recorder.js';

/**
 * The pacing rules, proved rather than asserted in a comment.
 *
 * These run in milliseconds and launch nothing, so they sit in front of the
 * recording rather than in a suite of their own. A rule that is only enforced
 * when somebody remembers it is not enforced.
 */

const drive = async () => undefined;

test('a scene may not hold for less than the floor', () => {
  expect(() => scene({ name: 'too quick', hold: MIN_HOLD_SECONDS - 0.1, drive })).toThrow(
    /floor/,
  );
  expect(() => scene({ name: 'named', hold: MIN_HOLD_SECONDS, drive })).not.toThrow();
  expect(() => scene({ name: '   ', hold: MIN_HOLD_SECONDS, drive })).toThrow(/name/);
});

test('a timeline that cannot reach the duration floor is rejected', () => {
  const short = scene({ name: 'short', hold: MIN_HOLD_SECONDS, drive });

  // Two minimal scenes cannot get there, even padded to the cap. This is the
  // arithmetic `MAX_FINAL_PAD_SECONDS` is tuned against: raise the cap much
  // above this and the check below stops being reachable at all.
  const perScene = MIN_HOLD_SECONDS + SETTLE_SECONDS + GAP_SECONDS;
  const reachable = 2 * perScene + MAX_FINAL_PAD_SECONDS;
  expect(reachable).toBeLessThan(MIN_TOTAL_SECONDS);
  expect(() => validateTimeline([short, short])).toThrow(/tops out/);

  // One scene is not a timeline, however long it holds.
  expect(() => validateTimeline([scene({ name: 'only', hold: 60, drive })])).toThrow(
    /at least two scenes/,
  );

  // Three minimal scenes can be padded over the line.
  expect(3 * perScene + MAX_FINAL_PAD_SECONDS).toBeGreaterThanOrEqual(
    MIN_TOTAL_SECONDS,
  );
  expect(() => validateTimeline([short, short, short])).not.toThrow();
});
