const { spawnSync } = require('child_process');
const gha = require('../lib/gha');
const { defaultProject, baseArgs, dumpLogs } = require('./compose');

// answers is true when curl gets a 2xx or 3xx from url.
function answers(url, caFile) {
  const args = ['-fsS', '-o', '/dev/null', '--max-time', '5'];
  if (caFile) args.push('--cacert', caFile);
  return spawnSync('curl', [...args, url], { stdio: 'ignore' }).status === 0;
}

gha.main(() => {
  const project = gha.input('project', defaultProject());
  const files = gha.list('file');
  if (files.length === 0) files.push('compose.yaml');
  const base = baseArgs({ project, files, envFile: gha.input('env-file') });
  const services = gha.list('services');
  const url = gha.input('wait-url');
  const timeout = Number(gha.input('wait-timeout', '60'));
  const caFile = gha.input('ca-file');
  if (!(timeout > 0)) throw new Error(`wait-timeout must be a number of seconds, got ${gha.input('wait-timeout')}`);

  // Saved before up, so the post step tears down whatever part of the project did start.
  gha.saveState('args', JSON.stringify(base));
  gha.setOutput('project', project);

  if (gha.run('docker', [...base, 'up', '-d', ...services], { allowFail: true }) !== 0) {
    dumpLogs(base, `compose-up: ${project} did not start`);
    throw new Error(`docker compose up failed for ${project}`);
  }

  if (!url) return;
  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    if (answers(url, caFile)) {
      console.log(`compose-up: ${url} answered`);
      return;
    }
    if (Date.now() > deadline) break;
    gha.sleep(1000);
  }
  dumpLogs(base, `compose-up: ${project} logs`);
  throw new Error(`${url} did not answer within ${timeout}s`);
});
