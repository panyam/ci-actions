const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const gha = require('../lib/gha');

gha.main(() => {
  const address = gha.input('address', '127.0.0.1:0');
  const i = address.lastIndexOf(':');
  if (i <= 0) throw new Error(`address must be host:port, got ${address}`);
  const host = address.slice(0, i);
  const port = address.slice(i + 1);

  const dir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || require('os').tmpdir(), 'egress-trap-'));
  const log = path.join(dir, 'requests.log');
  const portFile = path.join(dir, 'port');
  const stderr = fs.openSync(path.join(dir, 'proxy.err'), 'w');

  const child = spawn(process.execPath, [path.join(__dirname, 'proxy.js'), host, port, log, portFile], {
    detached: true,
    stdio: ['ignore', 'ignore', stderr],
  });
  child.unref();
  gha.saveState('pid', String(child.pid));
  gha.saveState('log', log);

  for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) gha.sleep(100);
  if (!fs.existsSync(portFile)) {
    throw new Error(`the proxy didn't start on ${address}: ${fs.readFileSync(path.join(dir, 'proxy.err'), 'utf8')}`);
  }
  const url = `http://${host}:${fs.readFileSync(portFile, 'utf8')}`;
  gha.setOutput('url', url);
  gha.setOutput('log', log);
  console.log(`egress-trap listening at ${url}, logging to ${log}`);
});
