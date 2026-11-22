// The docker compose command line main.js and post.js share. main.js saves it as state, so post.js
// tears down the same project with the same files, even when an input changed between the two.

const gha = require('../lib/gha');

// defaultProject is unique per job and per step, so two compose-up steps, or a rerun, never share
// containers or volumes. Compose wants lowercase letters, digits, dashes and underscores.
function defaultProject(env = process.env) {
  const raw = ['ci', env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, env.GITHUB_JOB, env.GITHUB_ACTION]
    .filter(Boolean)
    .join('-');
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 63);
}

function baseArgs({ project, files, envFile }) {
  const args = ['compose', '-p', project];
  for (const f of files) args.push('-f', f);
  if (envFile) args.push('--env-file', envFile);
  return args;
}

function dumpLogs(base, title) {
  gha.group(title, () => {
    gha.run('docker', [...base, 'ps', '-a'], { allowFail: true });
    gha.run('docker', [...base, 'logs', '--no-color', '--timestamps'], { allowFail: true });
  });
}

module.exports = { defaultProject, baseArgs, dumpLogs };
