'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { format } = require('node:util');

const DEFAULT_LOG_MAX_MB = 50;
function parseLogMaxMB(value) {
  const text = String(value ?? '').trim();
  const size = Number(text);
  return /^\d+$/.test(text) && Number.isInteger(size) && size >= 1 && size <= 1024
    ? size : DEFAULT_LOG_MAX_MB;
}

// Only runtime logs belonging to this application; subscriptions/configuration are excluded.
function isRuntimeLog(name) {
  return /^(?:runtime|directadmin|ttyd|sshx|boot)\.log(?:\.out)?$/.test(name)
    || /^[a-z]{6}_(?:ttyd|argo)\.log(?:\.out)?$/.test(name);
}

function createLogGuard(directory, value, intervalMs = 10000) {
  const maxMB = parseLogMaxMB(value);
  const maxBytes = maxMB * 1024 * 1024;
  fs.mkdirSync(directory, { recursive: true });

  function withLog(name, create, action) {
    if (!isRuntimeLog(name)) return false;
    let fd;
    try {
      fd = fs.openSync(path.join(directory, name), fs.constants.O_WRONLY
        | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
        | (create ? fs.constants.O_CREAT : 0), 0o600);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1) return false;
      action(fd, stat.size);
      return true;
    } catch (_) {
      // Missing/readonly logs must not stop the application or block a child process.
      return false;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }

  function append(name, chunk) {
    let data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (data.length > maxBytes) data = data.subarray(data.length - maxBytes);
    return withLog(name, true, (fd, size) => {
      if (size + data.length > maxBytes) fs.ftruncateSync(fd, 0);
      let offset = 0;
      while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset);
    });
  }

  function sweep() {
    let names;
    try { names = fs.readdirSync(directory); } catch (_) { return; }
    names.filter(isRuntimeLog).forEach(name => withLog(name, false, (fd, size) => {
      if (size > maxBytes) fs.ftruncateSync(fd, 0);
    }));
  }

  function spawnLogged(command, name) {
    if (!isRuntimeLog(name)) throw new Error('Invalid runtime log name');
    withLog(name, true, fd => fs.ftruncateSync(fd, 0));
    const child = spawn(command, { shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => append(name, chunk));
    child.stderr.on('data', chunk => append(name, chunk));
    child.on('error', error => append(name, error.message + '\n'));
    child.unref();
    return child;
  }

  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return { maxMB, maxBytes, append, sweep, spawn: spawnLogged, stop: () => clearInterval(timer) };
}

function mirrorConsole(guard, name) {
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      guard.append(name, format(...args) + '\n');
      original(...args);
    };
  }
}

module.exports = { DEFAULT_LOG_MAX_MB, parseLogMaxMB, isRuntimeLog, createLogGuard, mirrorConsole };
