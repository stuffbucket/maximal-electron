#!/usr/bin/env node
/**
 * Verify the repository rulesets against the floor in `scripts/rulesets.mjs`.
 *
 *   npm run verify:rulesets
 *   npm run verify:rulesets -- --body-file drift.md
 *
 * Exit 0 protected · 1 a protection is missing or weakened · 2 the rulesets
 * could not be read, or this run examined nothing · 3 unverified, because an
 * assertion could not be computed. Four codes rather than pass and fail, so a
 * caller cannot render "nobody could tell" as "verified".
 *
 * It adds no credential. On a developer machine it reads the token
 * `gh auth login` already holds, which is the only way to see `bypass_actors`.
 * See `docs/admin/repository-settings.md`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluate,
  overallState,
  renderIssue,
  renderSummary,
  renderUnreadable,
  scopeFailures,
  selfTestFailures,
} from './rulesets.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const flag = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

/** `owner/name`, from the workflow environment or from the manifest. */
function repoSlug() {
  const override = flag('--repo') ?? process.env['GITHUB_REPOSITORY'];
  if (override) return override;
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const match = /github\.com\/([^/]+\/[^/.]+)/.exec(manifest.repository?.url ?? '');
  if (!match) throw new Error('package.json has no GitHub repository URL to check');
  return match[1];
}

/**
 * The token `gh` is logged in with. A `gh auth login` session stores it in the
 * CLI's own configuration and exports nothing, so without this the local run —
 * the only run that can see `bypass_actors` — reports it unverified.
 */
function ghCliToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

async function fetchRulesets(repo) {
  const token =
    process.env['RULESET_TOKEN'] ||
    process.env['GH_TOKEN'] ||
    process.env['GITHUB_TOKEN'] ||
    ghCliToken();
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'maximal-electron-ruleset-check',
    'x-github-api-version': '2022-11-28',
  };
  // Unauthenticated reads work on a public repository and see everything here
  // except the bypass list. A token only ever adds visibility.
  if (token) headers.authorization = `Bearer ${token}`;

  const read = async (route) => {
    const response = await fetch(`https://api.github.com${route}`, { headers });
    if (!response.ok) {
      throw new Error(`GET ${route} answered ${response.status} ${response.statusText}`);
    }
    return response.json();
  };

  const summaries = await read(`/repos/${repo}/rulesets`);
  const full = [];
  for (const summary of summaries) {
    full.push(await read(`/repos/${repo}/rulesets/${summary.id}`));
  }
  return full;
}

async function main() {
  const repo = repoSlug();
  const bodyFile = flag('--body-file');
  const write = (body) => {
    if (bodyFile) writeFileSync(bodyFile, body);
  };

  // Before the network: prove the floor still detects a gutted ruleset.
  const blind = selfTestFailures();
  if (blind.length > 0) {
    console.error('verify-rulesets: the floor no longer detects a weakening.');
    for (const line of blind) console.error(`  ${line}`);
    return 2;
  }

  let live;
  try {
    live = await fetchRulesets(repo);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`verify-rulesets: could not read ${repo}'s rulesets — ${reason}`);
    write(renderUnreadable(repo, reason));
    return 2;
  }

  const report = evaluate(live);
  const empty = scopeFailures(report);
  if (empty.length > 0) {
    console.error(`Examined ${report.examinedLive} live ruleset(s) against ${report.examinedExpectations} expectation(s)`);
    for (const line of empty) console.error(`  ${line}`);
    write(renderUnreadable(repo, empty.join('\n')));
    return 2;
  }

  console.error(renderSummary(report));
  const state = overallState(report);
  if (state === 'unprotected') {
    write(renderIssue(report, repo));
    console.error(`\nhttps://github.com/${repo}/settings/rules`);
    return 1;
  }
  return state === 'unverified' ? 3 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`verify-rulesets: ${error.message}`);
    process.exit(2);
  },
);
