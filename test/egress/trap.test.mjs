import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../egress-trap');

// fileCommands reads what an action wrote to GITHUB_OUTPUT or GITHUB_STATE.
function fileCommands(file) {
  const out = {};
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([^<]+)<<(.+)$/);
    if (!m) continue;
    const value = [];
    for (i++; lines[i] !== m[2]; i++) value.push(lines[i]);
    out[m[1]] = value.join('\n');
  }
  return out;
}

function start(env = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-test-'));
  const output = path.join(tmp, 'output');
  const state = path.join(tmp, 'state');
  fs.writeFileSync(output, '');
  fs.writeFileSync(state, '');
  const r = spawnSync(process.execPath, [path.join(dir, 'main.js')], {
    encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: tmp, GITHUB_OUTPUT: output, GITHUB_STATE: state, ...env },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return { outputs: fileCommands(output), state: fileCommands(state) };
}

function post(state, env = {}) {
  return spawnSync(process.execPath, [path.join(dir, 'post.js')], {
    encoding: 'utf8',
    env: { ...process.env, STATE_pid: state.pid, STATE_log: state.log, ...env },
  });
}

function viaProxy(proxyUrl, options) {
  const p = new URL(proxyUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: p.hostname, port: p.port, ...options });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
}

test('a run with no requests passes', () => {
  const { state } = start();
  const r = post(state);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /no requests reached the trap/);
});

test('logs a plain request and a CONNECT, answers 502, and fails the job naming both hosts', async () => {
  const { outputs, state } = start();
  assert.match(outputs.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(outputs.log, state.log);

  assert.equal(await viaProxy(outputs.url, { method: 'GET', path: 'http://plain.example/x' }), 502);
  assert.equal(await viaProxy(outputs.url, { method: 'CONNECT', path: 'tls.example:443' }), 502);

  const log = fs.readFileSync(outputs.log, 'utf8');
  assert.match(log, /^plain\.example\tGET http:\/\/plain\.example\/x HTTP\/1\.1$/m);
  assert.match(log, /^tls\.example:443\tCONNECT tls\.example:443 HTTP\/1\.1$/m);

  const r = post(state);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /::error title=egress-trap::request to plain\.example$/m);
  assert.match(r.stdout, /::error title=egress-trap::request to tls\.example:443$/m);
  assert.match(r.stdout, /::error::egress-trap: 2 requests reached the trap, for plain\.example, tls\.example:443/);
});

test('fail: false reports without failing', async () => {
  const { outputs, state } = start();
  await viaProxy(outputs.url, { method: 'GET', path: 'http://plain.example/' });
  const r = post(state, { INPUT_FAIL: 'false' });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /::notice::egress-trap: 1 requests reached the trap, for plain\.example/);
});

test('post stops the proxy', async () => {
  const { outputs, state } = start();
  post(state);
  await assert.rejects(viaProxy(outputs.url, { method: 'GET', path: 'http://plain.example/' }));
});

test('a bad address fails the step', () => {
  const r = spawnSync(process.execPath, [path.join(dir, 'main.js')], {
    encoding: 'utf8',
    env: { ...process.env, INPUT_ADDRESS: 'nope', RUNNER_TEMP: os.tmpdir() },
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error::address must be host:port/);
});
