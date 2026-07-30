/**
 * Pick the shuffle seed once, before any worker starts.
 *
 * Playwright evaluates a spec file more than once: once in the main process to
 * collect tests, and again in each worker to run them. A seed generated inside
 * the spec is therefore generated twice, and the two orders disagree.
 *
 * `globalSetup` runs once, in the main process, before workers spawn. Workers
 * inherit its environment, so writing the seed here makes every load agree.
 */
export default function globalSetup(): void {
  process.env['E2E_SEED'] ??= String(Math.floor(Math.random() * 2 ** 31));
  // eslint-disable-next-line no-console
  console.log(
    `e2e shuffle seed: ${process.env['E2E_SEED']} (set E2E_SEED to replay)`,
  );
}
