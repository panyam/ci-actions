import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const report = createRequire(import.meta.url)('../../vulncheck/report.js');

const context = { repo: { owner: 'o', repo: 'r' }, serverUrl: 'https://github.com', runId: 42, sha: 'abcdef1234567' };

function fakeGitHub(openIssues) {
  const calls = { created: [], commented: [] };
  const listForRepo = Symbol('listForRepo');
  return {
    calls,
    paginate: async (method, params) => {
      assert.equal(method, listForRepo);
      assert.equal(params.state, 'open');
      return openIssues;
    },
    rest: {
      issues: {
        listForRepo,
        create: async (args) => { calls.created.push(args); return { data: { number: 99 } }; },
        createComment: async (args) => { calls.commented.push(args); },
      },
    },
  };
}

const args = (github, log = 'Vulnerability #1: GO-2026-0001 found\n\nYour code is affected by 1 vulnerability from the Go standard library.') =>
  ({ github, context, log, command: 'make vulncheck', titlePrefix: 'vulncheck:', labels: ['P1', 'bug'] });

test('files an issue when none with the prefix is open', async () => {
  const gh = fakeGitHub([{ number: 3, title: 'something else' }]);
  assert.deepEqual(await report(args(gh)), { filed: 99 });
  assert.equal(gh.calls.commented.length, 0);
  const [issue] = gh.calls.created;
  assert.equal(issue.owner, 'o');
  assert.equal(issue.repo, 'r');
  assert.match(issue.title, /^vulncheck: /);
  assert.deepEqual(issue.labels, ['P1', 'bug']);
  assert.match(issue.body, /`make vulncheck` failed at `abcdef1`/);
  assert.match(issue.body, /https:\/\/github\.com\/o\/r\/actions\/runs\/42/);
  assert.match(issue.body, /GO-2026-0001 found/);
});

test('comments on the open issue instead of filing a second one', async () => {
  const gh = fakeGitHub([{ number: 7, title: 'vulncheck: advisories reachable from a shipped module' }]);
  assert.deepEqual(await report(args(gh)), { commented: 7 });
  assert.equal(gh.calls.created.length, 0);
  assert.equal(gh.calls.commented[0].issue_number, 7);
  assert.match(gh.calls.commented[0].body, /^Still failing\./);
});

test('ignores a pull request whose title has the prefix', async () => {
  const gh = fakeGitHub([{ number: 8, title: 'vulncheck: advisories reachable from a shipped module', pull_request: {} }]);
  assert.deepEqual(await report(args(gh)), { filed: 99 });
});

test('keeps only the last 8000 characters of the log', async () => {
  const gh = fakeGitHub([]);
  await report(args(gh, 'H'.repeat(5000) + 'T'.repeat(8000)));
  const body = gh.calls.created[0].body;
  assert.ok(body.includes('T'.repeat(8000)));
  assert.ok(!body.includes('H'));
});

const fixture = (name) => readFileSync(new URL(`./logs/${name}.txt`, import.meta.url), 'utf8');

test('classifies govulncheck logs by what stopped the scan', () => {
  assert.equal(report.classify(fixture('findings')), 'findings');
  assert.equal(report.classify(fixture('load')), 'load');
  assert.equal(report.classify(fixture('mixed')), 'findings');
  assert.equal(report.classify(fixture('other')), 'other');
  assert.equal(report.classify(''), 'other');
});

test('a load failure files an issue that says the scan could not load packages', async () => {
  const gh = fakeGitHub([]);
  assert.deepEqual(await report(args(gh, fixture('load'))), { filed: 99 });
  const [issue] = gh.calls.created;
  assert.equal(issue.title, 'vulncheck: the scan could not load packages');
  assert.match(issue.body, /missing go\.sum entry/);
});

test('findings keep the advisories title', async () => {
  const gh = fakeGitHub([]);
  await report(args(gh, fixture('findings')));
  assert.equal(gh.calls.created[0].title, 'vulncheck: advisories reachable from a shipped module');
  assert.doesNotMatch(gh.calls.created[0].body, /also failed to load/);
});

test('findings with load errors keep the advisories title and say some packages failed to load', async () => {
  const gh = fakeGitHub([]);
  await report(args(gh, fixture('mixed')));
  assert.equal(gh.calls.created[0].title, 'vulncheck: advisories reachable from a shipped module');
  assert.match(gh.calls.created[0].body, /Some packages also failed to load/);
});

test('a failure with neither files an issue that says the scan failed', async () => {
  const gh = fakeGitHub([]);
  await report(args(gh, fixture('other')));
  assert.equal(gh.calls.created[0].title, 'vulncheck: the scan failed');
});

test('a load failure files its own issue while an advisories issue is open', async () => {
  const gh = fakeGitHub([{ number: 7, title: 'vulncheck: advisories reachable from a shipped module' }]);
  assert.deepEqual(await report(args(gh, fixture('load'))), { filed: 99 });
  assert.equal(gh.calls.commented.length, 0);
});

test('findings file their own issue while a load-failure issue is open', async () => {
  const gh = fakeGitHub([{ number: 9, title: 'vulncheck: the scan could not load packages' }]);
  assert.deepEqual(await report(args(gh, fixture('findings'))), { filed: 99 });
});

test('a load failure comments on the open load-failure issue', async () => {
  const gh = fakeGitHub([{ number: 9, title: 'vulncheck: the scan could not load packages' }]);
  assert.deepEqual(await report(args(gh, fixture('load'))), { commented: 9 });
});
