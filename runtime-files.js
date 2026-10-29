'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST = '.runtime-files.json';
const managedName = name => typeof name === 'string'
  && /^(?:[a-z]{6}(?:_(?:ttyd|argo)\.log)?(?:\.out)?|boot\.log(?:\.out)?|sshx\.log|s\.txt|list\.txt)$/.test(name);
const binarySignatures = [
  'github.com/sagernet/sing-box', 'github.com/cloudflare/cloudflared',
  'github.com/nezhahq/agent', 'github.com/naiba/nezha', 'libwebsockets',
];

// Migrate old six-letter downloads only when their contents identify a bundled component.
function isLegacyComponent(filename) {
  let fd;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) return false;
    const chunk = Buffer.alloc(64 * 1024);
    const first = fs.readSync(fd, chunk, 0, chunk.length, 0);
    if (!chunk.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      const text = chunk.subarray(0, first).toString();
      const logHeader = /^\s*(?:\{[^\n]*"level"\s*:|\d{4}-\d{2}-\d{2}|\d{4}\s+(?:INF|ERR))/.test(text);
      return logHeader && (/(?:cloudflared|https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i.test(text)
        || (/Starting tunnel|Registered tunnel connection|Initial protocol/.test(text) && /GOOS:|GoVersion:|tunnelID/.test(text)));
    }
    let offset = 0;
    let carry = '';
    while (offset < stat.size) {
      const count = fs.readSync(fd, chunk, 0, chunk.length, offset);
      if (!count) break;
      const text = carry + chunk.subarray(0, count).toString('latin1');
      if (binarySignatures.some(signature => text.includes(signature))) return true;
      carry = text.slice(-128);
      offset += count;
    }
    return false;
  } catch (_) { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function createRuntimeFiles(directory) {
  const root = fs.realpathSync(directory);
  const manifestPath = path.join(root, MANIFEST);
  let current = new Set();

  function save() {
    const temp = manifestPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({ version: 1, files: [...current] }), { mode: 0o600 });
    fs.renameSync(temp, manifestPath);
  }

  function register(name) {
    if (!managedName(name)) throw new Error('Invalid managed runtime filename');
    current.add(name);
    save(); // Register before download, so even interrupted downloads are removed next time.
  }

  async function cleanup() {
    const previous = new Set();
    try {
      const record = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (record.version === 1 && Array.isArray(record.files)) record.files.filter(managedName).forEach(name => previous.add(name));
    } catch (_) {}
    for (const name of fs.readdirSync(root)) {
      if (/^[a-z]{6}$/.test(name) && isLegacyComponent(path.join(root, name))) previous.add(name);
      if (/^[a-z]{6}(?:\.out|_ttyd\.log|_argo\.log(?:\.out)?)$/.test(name)) previous.add(name);
    }
    const paths = new Set([...previous].map(name => path.join(root, name)));
    const pids = [];
    let procEntries = [];
    try { procEntries = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)); } catch (_) {}
    for (const pid of procEntries) {
      if (Number(pid) === process.pid) continue;
      let exe;
      try { exe = fs.readlinkSync('/proc/' + pid + '/exe').replace(/ \(deleted\)$/, ''); } catch (_) { continue; }
      if (!paths.has(exe)) continue;
      try { process.kill(Number(pid), 'SIGTERM'); pids.push(Number(pid)); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (pids.length) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && pids.some(pid => {
        try { process.kill(pid, 0); return true; } catch (_) { return false; }
      })) await new Promise(resolve => setTimeout(resolve, 50));
      pids.forEach(pid => {
        try {
          const exe = fs.readlinkSync('/proc/' + pid + '/exe').replace(/ \(deleted\)$/, '');
          if (paths.has(exe)) process.kill(pid, 'SIGKILL');
        } catch (_) {}
      });
    }
    let removed = 0;
    for (const filename of paths) {
      try {
        const stat = fs.lstatSync(filename);
        if (stat.isFile() && stat.nlink === 1) { fs.unlinkSync(filename); removed++; }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    current = new Set();
    save();
    return removed;
  }

  return { register, cleanup };
}

module.exports = { createRuntimeFiles, isLegacyComponent, managedName };
