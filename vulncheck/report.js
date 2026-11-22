// Files the scan's failure as an issue, or comments on the open issue with the same title, so a
// scan that keeps failing adds comments to one issue instead of filing one a week.
// action.yml runs it through actions/github-script, which passes in github and context.
//
// The title says what stopped the scan, so a reader looks in the right place (issue 13). A failure
// of another kind files its own issue, so a real advisory never ends up as a comment on an issue
// titled for a load failure.

const MAX_LOG = 8000;

const TITLES = {
  findings: 'advisories reachable from a shipped module',
  load: 'the scan could not load packages',
  other: 'the scan failed',
};

// govulncheck v1.10.0 prints "Your code is affected by N vulnerabilities" after each module it
// scans. "Vulnerability #" alone isn't enough, since -show verbose also lists advisories the code
// doesn't call. A module that fails to load prints "govulncheck: loading packages:" with go's
// errors, or "Loading packages failed" when the Go version doesn't match.
const FINDINGS = /Your code is affected by [1-9]\d* vulnerabilit/;
const LOAD = /govulncheck: loading packages:|Loading packages failed|missing go\.sum entry/;

function classify(log) {
  if (FINDINGS.test(log)) return 'findings';
  if (LOAD.test(log)) return 'load';
  return 'other';
}

function tail(log) {
  return log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;
}

module.exports = async ({ github, context, log, command, titlePrefix, labels }) => {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const kind = classify(log);
  const title = `${titlePrefix} ${TITLES[kind]}`;
  const open = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', per_page: 100 });
  const existing = open.find((i) => !i.pull_request && i.title === title);

  const run = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;
  const partial = kind === 'findings' && LOAD.test(log)
    ? ['', 'Some packages also failed to load, so the scan may have missed more.']
    : [];
  const body = [
    `\`${command}\` failed at \`${context.sha.slice(0, 7)}\`.`, ...partial, '', `[Workflow run](${run})`, '',
    '```', tail(log), '```',
  ].join('\n');

  if (existing) {
    await github.rest.issues.createComment({ ...repo, issue_number: existing.number, body: `Still failing.\n\n${body}` });
    return { commented: existing.number };
  }
  const { data } = await github.rest.issues.create({ ...repo, title, labels, body });
  return { filed: data.number };
};

module.exports.classify = classify;
