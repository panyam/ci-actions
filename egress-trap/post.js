const fs = require('fs');
const gha = require('../lib/gha');

gha.main(() => {
  const pid = Number(gha.getState('pid'));
  const log = gha.getState('log');
  if (pid) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
  if (!log || !fs.existsSync(log)) {
    console.log('egress-trap: no log, so the trap never started');
    return;
  }
  const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log('egress-trap: no requests reached the trap');
    return;
  }
  const hosts = [...new Set(lines.map((l) => l.split('\t')[0]))];
  gha.group(`egress-trap: ${lines.length} requests`, () => lines.forEach((l) => console.log(l.replace('\t', '  '))));
  const msg = `egress-trap: ${lines.length} requests reached the trap, for ${hosts.join(', ')}`;
  if (gha.bool('fail', true)) {
    for (const h of hosts) console.log(`::error title=egress-trap::request to ${h}`);
    throw new Error(msg);
  }
  console.log(`::notice::${msg}`);
});
