// Files the scan's failure as an issue, or comments on the open issue whose title starts with
// titlePrefix, so a scan that keeps failing adds comments to one issue instead of filing one a week.
// action.yml runs it through actions/github-script, which passes in github and context.

const MAX_LOG = 8000;

function tail(log) {
  return log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;
}

module.exports = async ({ github, context, log, command, titlePrefix, labels }) => {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const open = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', per_page: 100 });
  const existing = open.find((i) => !i.pull_request && i.title.startsWith(titlePrefix));

  const run = `${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}`;
  const body = [
    `\`${command}\` failed at \`${context.sha.slice(0, 7)}\`.`, '', `[Workflow run](${run})`, '',
    '```', tail(log), '```',
  ].join('\n');

  if (existing) {
    await github.rest.issues.createComment({ ...repo, issue_number: existing.number, body: `Still failing.\n\n${body}` });
    return { commented: existing.number };
  }
  const { data } = await github.rest.issues.create({
    ...repo, title: `${titlePrefix} advisories reachable from a shipped module`, labels, body,
  });
  return { filed: data.number };
};
