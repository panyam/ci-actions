import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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

const args = (github, log = 'GO-2026-0001 found') =>
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
  const gh = fakeGitHub([{ number: 8, title: 'vulncheck: bump x', pull_request: {} }]);
  assert.deepEqual(await report(args(gh)), { filed: 99 });
});

test('keeps only the last 8000 characters of the log', async () => {
  const gh = fakeGitHub([]);
  await report(args(gh, 'H'.repeat(5000) + 'T'.repeat(8000)));
  const body = gh.calls.created[0].body;
  assert.ok(body.includes('T'.repeat(8000)));
  assert.ok(!body.includes('H'));
});
