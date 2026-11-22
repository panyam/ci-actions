const gha = require('../lib/gha');
const { dumpLogs } = require('./compose');

gha.main(() => {
  const saved = gha.getState('args');
  if (!saved) return;
  const base = JSON.parse(saved);
  // A post step can't tell whether the job failed, so the logs always go in a collapsed group.
  dumpLogs(base, 'compose-up: logs');
  gha.run('docker', [...base, 'down', '-v', '--remove-orphans']);
});
