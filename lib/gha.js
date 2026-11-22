// The few pieces of @actions/core the JS actions here use, so they ship with no node_modules.
// The runner downloads the whole repo at the action's ref, so an action can require this file.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

function input(name, fallback = '') {
  const v = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function bool(name, fallback) {
  const v = input(name, String(fallback)).toLowerCase();
  if (v !== 'true' && v !== 'false') throw new Error(`input ${name} must be true or false, got ${v}`);
  return v === 'true';
}

// list splits on newlines, commas and spaces, so a caller can pass one item or a YAML block.
function list(name) {
  return input(name).split(/[\s,]+/).filter(Boolean);
}

function appendCommand(envName, name, value) {
  const file = process.env[envName];
  if (!file) return;
  const d = `ghadelim_${crypto.randomUUID()}`;
  fs.appendFileSync(file, `${name}<<${d}\n${value}\n${d}\n`);
}

const setOutput = (name, value) => appendCommand('GITHUB_OUTPUT', name, value);
const saveState = (name, value) => appendCommand('GITHUB_STATE', name, value);
const getState = (name) => process.env[`STATE_${name}`] || '';

// run inherits stdio, so the command's output goes straight to the job log. It throws when the
// command exits non-zero, unless allowFail is set.
function run(cmd, args, { allowFail = false, ...opts } = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  return r.status;
}

function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}

function group(title, fn) {
  console.log(`::group::${title}`);
  try {
    return fn();
  } finally {
    console.log('::endgroup::');
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// main runs an action's entry point and turns a thrown error into a failed step.
function main(fn) {
  try {
    fn();
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exitCode = 1;
  }
}

module.exports = { input, bool, list, setOutput, saveState, getState, run, capture, group, sleep, main };
