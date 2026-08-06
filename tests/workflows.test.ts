import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Decidable rules over the workflow files.
 *
 * The release pipeline runs only when a tag is pushed, so a defect in it is
 * found on the one path that cannot be re-run. Three shipped that way: an XML
 * comment that stopped the MSI existing, `npm pack` into a directory nobody
 * created, and a download that cannot resolve a draft. Every one of them was a
 * job that had never executed.
 *
 * These are the rules a compiler would apply if YAML went through one. No
 * style, no judgement: a name pairs up or it does not.
 */

const WORKFLOWS = new URL('../.github/workflows/', import.meta.url);

/** The condition that makes a step or a job tag-only. */
const TAG_ONLY = "github.event_name != 'workflow_dispatch'";

/** Calls that create, move, or destroy a release. `view` and `download` read. */
const MUTATES_A_RELEASE = /\bgh release (create|upload|edit|delete)\b/;

/**
 * A publish that is not a dry run. A version in a registry cannot be replaced
 * or taken back, so this is the one step in the pipeline whose guard has no
 * second chance.
 */
const PUBLISHES_A_PACKAGE = /\bnpm publish\b(?![^\n]*--dry-run)/;

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, string>;
}

interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string> | string;
  steps?: Step[];
}

interface Workflow {
  jobs?: Record<string, Job>;
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
}

function read(name: string): Workflow {
  return parse(readFileSync(path.join(WORKFLOWS.pathname, name), 'utf8')) as Workflow;
}

function jobs(workflow: Workflow): [string, Job][] {
  return Object.entries(workflow.jobs ?? {});
}

function steps(workflow: Workflow): { job: Job; step: Step }[] {
  return jobs(workflow).flatMap(([, job]) => (job.steps ?? []).map((step) => ({ job, step })));
}

function needsOf(job: Job): string[] {
  if (job.needs === undefined) return [];
  return typeof job.needs === 'string' ? [job.needs] : job.needs;
}

const files = workflowFiles();
const parsed = new Map(files.map((name) => [name, read(name)]));

describe('the workflow files', () => {
  it('finds files to check, so an empty scan cannot pass', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const [name, workflow] of parsed) {
    it(`${name} declares at least one job`, () => {
      expect(jobs(workflow).length).toBeGreaterThan(0);
    });

    it(`${name} names only jobs that exist in needs`, () => {
      const declared = new Set(jobs(workflow).map(([id]) => id));
      const missing = jobs(workflow).flatMap(([id, job]) =>
        needsOf(job)
          .filter((need) => !declared.has(need))
          .map((need) => `${id} needs ${need}`),
      );
      expect(missing).toEqual([]);
    });
  }
});

/**
 * An artifact passes between jobs by name, and nothing checks the pair.
 * `windows-msi-verify` reads the MSI this way since #81, so a rename on one
 * side leaves a download that finds nothing.
 */
describe('artifact hand-off', () => {
  const pairs: string[] = [];

  for (const [name, workflow] of parsed) {
    const uses = (step: Step, action: string) => step.uses?.startsWith(`actions/${action}@`) === true;
    const uploaded = new Set(
      steps(workflow)
        .filter(({ step }) => uses(step, 'upload-artifact'))
        .map(({ step }) => step.with?.['name'])
        .filter((value): value is string => value !== undefined),
    );

    for (const { step } of steps(workflow)) {
      if (!uses(step, 'download-artifact')) continue;
      // No name downloads every artifact in the run.
      const wanted = step.with?.['name'];
      if (wanted === undefined) continue;

      pairs.push(`${name}:${wanted}`);
      it(`${name} uploads the artifact "${wanted}" that it downloads`, () => {
        expect([...uploaded]).toContain(wanted);
      });
    }
  }

  it('found a hand-off to check', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });
});

/**
 * `npm pack --pack-destination` fails with ENOENT rather than creating the
 * directory. That job could only ever have failed, and did, twice (#80).
 */
describe('npm pack', () => {
  const found: string[] = [];

  for (const [name, workflow] of parsed) {
    for (const { step } of steps(workflow)) {
      const match = /npm pack[^\n]*--pack-destination\s+(\S+)/.exec(step.run ?? '');
      if (match === null) continue;

      const destination = match[1] ?? '';
      found.push(`${name}:${destination}`);
      it(`${name} creates ${destination} before packing into it`, () => {
        expect(step.run).toMatch(new RegExp(`mkdir -p ${destination}\\b`));
      });
    }
  }

  it('found a pack step to check', () => {
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('the release workflow', () => {
  const release = parsed.get('release.yml');

  it('is present', () => {
    expect(release).toBeDefined();
  });

  /**
   * `stuffbucket/maximal` consumes the tarball and signs its own application,
   * so a failed installer must not hold a release. See `docs/release.md`.
   */
  it('gates publish on the tarball alone', () => {
    expect(needsOf(release?.jobs?.['publish'] ?? {})).toEqual(['package-tarball']);
  });

  /**
   * A dispatch run is a dry run. Nothing else distinguishes it, so every call
   * that would touch a release has to carry the condition.
   */
  const unguarded: string[] = [];
  const guarded: string[] = [];

  for (const [id, job] of jobs(release ?? {})) {
    for (const step of job.steps ?? []) {
      if (!MUTATES_A_RELEASE.test(step.run ?? '')) continue;

      const where = `${id}: ${step.name ?? step.run?.slice(0, 40) ?? ''}`;
      const isGuarded = [job.if, step.if].some((condition) => condition?.includes(TAG_ONLY) === true);
      (isGuarded ? guarded : unguarded).push(where);
    }
  }

  it('found a release-mutating step to check', () => {
    expect(guarded.length + unguarded.length).toBeGreaterThan(0);
  });

  it('never mutates a release on a dispatch run', () => {
    expect(unguarded).toEqual([]);
  });

  /**
   * Every attach step is skipped on a dispatch, so a dry run that built
   * nothing would end green. This job is what asserts otherwise, and it is the
   * one thing in the dry run whose deletion nothing else would notice.
   */
  it('ends a dry run with a job that asserts the artifacts exist', () => {
    const job = release?.jobs?.['dry-run-artifacts'];
    expect(job?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(needsOf(job ?? {})).toEqual(
      expect.arrayContaining(['windows-msi-verify', 'package-tarball']),
    );
  });

  /**
   * The registry publish needs the token permission, and nothing else in the
   * pipeline does. Dropping it turns the one irreversible step into a 403 on a
   * tag, which is the run that cannot be repeated.
   */
  it('gives the publishing job packages: write', () => {
    const permissions = release?.jobs?.['publish-package']?.permissions;
    expect(typeof permissions === 'object' ? permissions : {}).toMatchObject({
      packages: 'write',
    });
  });

  /**
   * The dry run's half of the publish. Without a dispatch-only `--dry-run`
   * step, the whole registry path would be exercised for the first time on a
   * tag, which is how three release defects shipped.
   */
  it('rehearses the publish on a dispatch run', () => {
    const rehearsals = (release?.jobs?.['publish-package']?.steps ?? []).filter(
      (step) =>
        /npm publish[^\n]*--dry-run/.test(step.run ?? '') &&
        step.if?.includes("github.event_name == 'workflow_dispatch'") === true,
    );
    expect(rehearsals).toHaveLength(1);
  });
});

/**
 * A published version cannot be replaced, moved, or withdrawn. Every other
 * guard in this file protects something a second run can repair; this one does
 * not, so it scans every workflow rather than `release.yml` alone.
 */
describe('publishing to a registry', () => {
  const unguarded: string[] = [];
  const guarded: string[] = [];

  for (const [name, workflow] of parsed) {
    for (const [id, job] of jobs(workflow)) {
      for (const step of job.steps ?? []) {
        if (!PUBLISHES_A_PACKAGE.test(step.run ?? '')) continue;

        const where = `${name} ${id}: ${step.name ?? step.run?.slice(0, 40) ?? ''}`;
        const isGuarded = [job.if, step.if].some(
          (condition) => condition?.includes(TAG_ONLY) === true,
        );
        (isGuarded ? guarded : unguarded).push(where);
      }
    }
  }

  it('found a publish step to check', () => {
    expect(guarded.length + unguarded.length).toBeGreaterThan(0);
  });

  it('never publishes a package on a dispatch run', () => {
    expect(unguarded).toEqual([]);
  });
});
