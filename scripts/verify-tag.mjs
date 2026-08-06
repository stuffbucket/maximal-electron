#!/usr/bin/env node
/**
 * Refuse a tag that has already been cut, or that is not above every tag that
 * exists. Runs in `tag-check`, before the release workflow spends a minute.
 *
 *   npm run verify:tag                      # the version in package.json
 *   npm run verify:tag -- --tag v0.0.5 --sha <commit>
 *
 * Without `--sha` this is a dry run: the tag does not exist yet, so only the
 * ordering can be checked. `docs/ci.md` holds the rule that made that the
 * default — a check that only runs behind a tag is a check nobody has run.
 *
 * Exit 0 the tag is a new cut · 1 it is a re-cut · 2 the facts could not be
 * read, so nothing was decided.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateTag,
  renderTagReport,
  scopeFailures,
  selfTestFailures,
} from './tag-history.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const flag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const manifest = () => JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function repoSlug() {
  const override = flag('--repo') ?? process.env['GITHUB_REPOSITORY'];
  if (override) return override;
  const match = /github\.com\/([^/]+\/[^/.]+)/.exec(manifest().repository?.url ?? '');
  if (!match) throw new Error('package.json has no GitHub repository URL to check');
  return match[1];
}

/** Every `v*` tag on the remote. The remote, not the checkout: CI clones shallow. */
function remoteTags() {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', 'origin', 'v*'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((line) => line.split('refs/tags/')[1])
    .filter((tag) => tag !== undefined && tag !== '');
}

/**
 * Every workflow run on this exact ref. A tag deletion does not remove them,
 * which is what makes this the one record a re-cut cannot hide from.
 */
async function runsOnRef(repo, tag) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'maximal-electron-tag-guard',
    'x-github-api-version': '2022-11-28',
  };
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN'];
  if (token) headers.authorization = `Bearer ${token}`;

  const route = `/repos/${repo}/actions/runs?branch=${encodeURIComponent(tag)}&per_page=100`;
  const response = await fetch(`https://api.github.com${route}`, { headers });
  if (!response.ok) {
    throw new Error(`GET ${route} answered ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return (body.workflow_runs ?? [])
    .filter((run) => run.head_branch === tag)
    .map((run) => ({ id: run.id, headSha: run.head_sha }));
}

async function main() {
  // Before anything real: replay the incident and prove the rules still catch it.
  const blind = selfTestFailures();
  if (blind.length > 0) {
    console.error('verify-tag: the guard no longer detects a re-cut.');
    for (const line of blind) console.error(`  ${line}`);
    return 2;
  }

  const tag = flag('--tag') ?? `v${manifest().version}`;
  const sha = flag('--sha') ?? null;
  const dryRun = sha === null;
  const repo = repoSlug();

  const tags = remoteTags();
  const runs = dryRun ? [] : await runsOnRef(repo, tag);

  const empty = scopeFailures({ tag, tags, runs, dryRun });
  if (empty.length > 0) {
    console.error(`verify-tag: this run examined nothing it could decide on.`);
    for (const line of empty) console.error(`  ${line}`);
    return 2;
  }

  const report = evaluateTag({ tag, sha, tags, runs, dryRun });
  console.error(renderTagReport(report));
  if (dryRun) {
    console.error(
      'Dry run: the tag does not exist yet, so the run history on its ref was not read.',
    );
  }
  return report.findings.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`verify-tag: ${error.message}`);
    process.exit(2);
  },
);
