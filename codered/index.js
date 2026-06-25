#!/usr/bin/env node

const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');

// ===== 工具函数 =====

function findPids(name) {
  try {
    const out = execSync(`pgrep -f "${name}" 2>/dev/null`, {encoding:'utf8'}).trim();
    if (out) return out.split('\n').map(Number);
  } catch(e) {}
  try {
    return fs.readdirSync('/proc')
      .filter(d => /^\d+$/.test(d))
      .filter(pid => {
        try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').includes(name); }
        catch(e) { return false; }
      })
      .map(Number);
  } catch(e) { return []; }
}

function killProcesses(name) {
  try { execSync(`pkill -f "${name}" 2>/dev/null`); return; } catch(e) {}
  findPids(name).forEach(pid => {
    try { process.kill(pid, 'SIGTERM'); } catch(e) {}
  });
}

function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port);
    if (isNaN(portNum)) return false;
    if (portNum < 1 || portNum > 65535) return false;
    return true;
  } catch (error) {
    return false;
  }
}

function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  }
  return 'amd';
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

async function downloadFile(fileName, fileUrl, filePath) {
  const writer = fs.createWriteStream(filePath);
  return new Promise((resolve, reject) => {
    axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      timeout: 60000,
    })
      .then(response => {
        response.data.pipe(writer);
        writer.on('finish', () => {
          writer.close();
          console.log(`Download ${fileName} successfully`);
          resolve(filePath);
        });
        writer.on('error', err => {
          fs.unlink(filePath, () => {});
          console.error(`Download ${fileName} failed: ${err.message}`);
          reject(err);
        });
      })
      .catch(err => {
        console.error(`Download ${fileName} failed: ${err.message}`);
        reject(err);
      });
  });
}

// ===== 配置读取 =====

const appConfigFile = path.join(__dirname, 'application.properties');

function parseInstallParams() {
  const installParams = {};
  const installArg = process.argv.find(arg => arg.startsWith('install='));
  if (installArg) {
    const paramsStr = installArg.substring(8);
    const paramRegex = /([a-zA-Z_][a-zA-Z0-9_\-]*)="((?:[^"\\]|\\.)*)"/g;
    let match;
    while ((match = paramRegex.exec(paramsStr)) !== null) {
      let val = match[2];
      val = val.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      installParams[match[1]] = val;
    }
  }
  if (fs.existsSync(appConfigFile)) {
    try {
      const content = fs.readFileSync(appConfigFile, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && trimmed.startsWith('install=')) {
          const paramsStr = trimmed.substring(8);
          const paramRegex = /([a-zA-Z_][a-zA-Z0-9_\-]*)="([^"]*)"/g;
          let match;
          while ((match = paramRegex.exec(paramsStr)) !== null) {
            installParams[match[1]] = match[2];
          }
        }
      });
    } catch (e) {}
  }
  return installParams;
}

const installParams = parseInstallParams();

const fileConfig = {};
if (fs.existsSync(appConfigFile)) {
  try {
    const content = fs.readFileSync(appConfigFile, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('install=')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.substring(0, idx).trim();
          let value = trimmed.substring(idx + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
          fileConfig[key] = value;
        }
      }
    });
  } catch (e) {}
}

Object.keys(installParams).forEach(key => {
  fileConfig[key] = installParams[key];
});

function getConfig(envKey, fileKey, defaultValue) {
  const underscoreKey = fileKey.replace(/-/g, '_');
  return fileConfig[fileKey] || fileConfig[underscoreKey] || process.env[envKey] || defaultValue;
}

// ===== 读取配置 =====
const LITE_MODE = getConfig('LITE_MODE', 'LITE_MODE', 'false').toLowerCase() === 'true';
const ENABLE_TTYD = getConfig('ENABLE_TTYD', 'ENABLE_TTYD', 'false').toLowerCase() === 'true';
const NAME = getConfig('NAME', 'NAME', 'CodeRed');
const PORT = parseInt(getConfig('PORT', 'PORT', '3000'));

const FILE_PATH = getConfig('FILE_PATH', 'FILE_PATH', '.npm');

// ttyd 配置
let TTYD_PORT = parseInt(getConfig('TTYD_PORT', 'ttyd-port', '7681'));
let TTYD_CREDENTIAL = getConfig('TTYD_CREDENTIAL', 'ttyd-credential', '');
if (TTYD_CREDENTIAL && TTYD_CREDENTIAL.includes(':')) {
  const parts = TTYD_CREDENTIAL.split(':');
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    TTYD_PORT = parseInt(parts[0]);
    TTYD_CREDENTIAL = parts.slice(1).join(':');
  }
}
const TTYD_ARGO_AUTH = getConfig('TTYD_ARGO_AUTH', 'ttyd-argo-auth', '');

// Gist
const GIST_ID = getConfig('GIST_ID', 'gist-id', '');
const GH_TOKEN = getConfig('GH_TOKEN', 'gh-token', '');

// Hysteria
const HYSTERIA_ENABLED = getConfig('HYSTERIA_ENABLED', 'HYSTERIA_ENABLED', 'false').toLowerCase() === 'true';
const HYSTERIA_REALM_SERVER = getConfig('HYSTERIA_REALM_SERVER', 'HYSTERIA_REALM_SERVER', 'realm.hysteria.network:8443');
const HYSTERIA_REALM_NAME = getConfig('HYSTERIA_REALM_NAME', 'HYSTERIA_REALM_NAME', '');
const HYSTERIA_PASSWORD = getConfig('HYSTERIA_PASSWORD', 'HYSTERIA_PASSWORD', 'hy123');

// ===== 运行时状态 =====
let argoUrl = '';
let ttydRunning = false;
let ttydActualPort = TTYD_PORT;
let hysteriaRunning = false;
let hysteriaRealm = '';
let hysteriaPublicAddr = '';
let hysteriaRealmStatus = '';

// ===== 主逻辑 =====

async function startTTYD() {
  if (!LITE_MODE || !ENABLE_TTYD) {
    console.log('ttyd: 已禁用 (LITE_MODE=' + LITE_MODE + ', ENABLE_TTYD=' + ENABLE_TTYD + ')');
    return;
  }

  const architecture = getSystemArchitecture();
  const ttydUrl = architecture === 'arm'
    ? 'https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.aarch64'
    : 'https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.x86_64';

  const cloudflaredUrl = architecture === 'arm'
    ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
    : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }

  const ttydName = generateRandomName();
  const ttydPath = path.join(FILE_PATH, ttydName);
  const botName = generateRandomName();
  const botPath = path.join(FILE_PATH, botName);
  const logName = generateRandomName();
  const logPath = path.join(FILE_PATH, logName + '.log');
  const bootLogPath = path.join(FILE_PATH, logName + '_boot.log');

  try {
    console.log('Downloading ttyd...');
    await downloadFile('ttyd', ttydUrl, ttydPath);
    fs.chmodSync(ttydPath, 0o775);

    // 如果端口被占用，自动换端口
    let cmd;
    if (TTYD_CREDENTIAL) {
      cmd = `nohup ${ttydPath} -p ${TTYD_PORT} -W -c '${TTYD_CREDENTIAL}' bash >${logPath} 2>&1 &`;
    } else {
      cmd = `nohup ${ttydPath} -p ${TTYD_PORT} -W bash >${logPath} 2>&1 &`;
    }
    await execPromise(cmd);
    console.log(`ttyd started on port ${TTYD_PORT}`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const pids = findPids(ttydPath);
    if (pids.length > 0) {
      ttydRunning = true;
      ttydActualPort = TTYD_PORT;
      console.log('ttyd running, PID:', pids.join(','));
    } else {
      console.error('ttyd failed to start');
      return;
    }

    console.log('Downloading cloudflared...');
    await downloadFile('cloudflared', cloudflaredUrl, botPath);
    fs.chmodSync(botPath, 0o775);

    if (TTYD_ARGO_AUTH) {
      const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info run --token ${TTYD_ARGO_AUTH}`;
      await execPromise(`nohup ${botPath} ${args} >${bootLogPath}.out 2>&1 &`);
      console.log('cloudflared started (fixed tunnel), target: http://localhost:' + TTYD_PORT);

      try {
        const decoded = JSON.parse(Buffer.from(TTYD_ARGO_AUTH, 'base64').toString());
        if (decoded.t) {
          argoUrl = `https://${decoded.t}.cfargotunnel.com`;
        }
      } catch(e) {
        try {
          const parsed = JSON.parse(TTYD_ARGO_AUTH);
          if (parsed.TunnelID) argoUrl = `https://${parsed.TunnelID}.cfargotunnel.com`;
        } catch(e2) {}
      }
    } else {
      const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${TTYD_PORT}`;
      await execPromise(`nohup ${botPath} ${args} >${bootLogPath}.out 2>&1 &`);
      console.log('cloudflared starting (quick tunnel), target: http://localhost:' + TTYD_PORT);

      await new Promise(resolve => setTimeout(resolve, 8000));

      if (fs.existsSync(bootLogPath)) {
        const content = fs.readFileSync(bootLogPath, 'utf-8');
        const match = content.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (match) {
          argoUrl = `https://${match[1]}`;
          console.log('Argo URL:', argoUrl);
        }
      }
    }

    if (argoUrl && GIST_ID && GH_TOKEN) {
      await syncToGist('ttyd_' + NAME + '.txt',
        `最后更新时间: ${new Date().toLocaleString('zh-CN')}\n---\n${argoUrl}`
      );
    }

    if (argoUrl) {
      console.log('ttyd + Argo tunnel ready!');
      console.log('URL:', argoUrl);
      if (TTYD_CREDENTIAL) console.log('Credential:', TTYD_CREDENTIAL);
    }
  } catch (err) {
    console.error('TTYD startup error:', err.message);
  }
}

async function checkHysteriaLog(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const content = fs.readFileSync(logPath, 'utf-8');

    if (content.includes('realm registered') || content.includes('registered realm')) {
      hysteriaRealmStatus = 'registered';
    }

    const addrMatch = content.match(/public (?:address|addr)(?:es)?[:\s]+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+)/i);
    if (addrMatch) hysteriaPublicAddr = addrMatch[1];

    const errorMatch = content.match(/error|failed|refused/i);
    if (errorMatch && !hysteriaRealmStatus) hysteriaRealmStatus = 'error';
  } catch (e) {}
}

async function startHysteria() {
  if (!LITE_MODE || !HYSTERIA_ENABLED) {
    console.log('hysteria: 已禁用 (LITE_MODE=' + LITE_MODE + ', HYSTERIA_ENABLED=' + HYSTERIA_ENABLED + ')');
    return;
  }

  const architecture = getSystemArchitecture();
  const hysteriaUrl = architecture === 'arm'
    ? 'https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-arm64'
    : 'https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-amd64';

  if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

  const hysName = generateRandomName();
  const hysPath = path.join(FILE_PATH, hysName);
  const hysLogPath = path.join(FILE_PATH, hysName + '.log');
  const configName = generateRandomName();
  const configPath = path.join(FILE_PATH, configName + '.yaml');
  const certPath = path.join(FILE_PATH, 'hy2.crt');
  const certKeyPath = path.join(FILE_PATH, 'hy2.key');

  try {
    console.log('Downloading hysteria2...');
    await downloadFile('hysteria2', hysteriaUrl, hysPath);
    fs.chmodSync(hysPath, 0o775);

    console.log('Generating self-signed TLS cert...');
    try {
      await execPromise(`openssl ecparam -genkey -name prime256v1 -noout -out ${certKeyPath} 2>/dev/null && openssl req -new -x509 -days 3650 -key ${certKeyPath} -out ${certPath} -subj '/CN=hysteria' 2>/dev/null`);
    } catch (e) {
      try {
        await execPromise(`${hysPath} cert --key ${certKeyPath} --cert ${certPath} 2>/dev/null`);
      } catch (e2) {
        console.error('Failed to generate TLS cert, hysteria may not start');
      }
    }

    const realmName = HYSTERIA_REALM_NAME || `codered-${generateRandomName()}`;
    hysteriaRealm = realmName;

    const configYaml = `# Hysteria2 Realm mode
listen: realm://${HYSTERIA_REALM_SERVER}/${realmName}

auth:
  type: password
  password: ${HYSTERIA_PASSWORD}

tls:
  cert: ${certPath}
  key: ${certKeyPath}

realm:
  stunServers:
    - stun.nextcloud.com:3478
    - global.stun.twilio.com:3478
  stunTimeout: 5s
  punchTimeout: 5s
  heartbeatInterval: 30s

bandwidth:
  up: 30 mbps
  down: 200 mbps
`;
    fs.writeFileSync(configPath, configYaml);

    console.log('Starting hysteria realm: ' + realmName);
    await execPromise(`nohup ${hysPath} server -c ${configPath} >${hysLogPath} 2>&1 &`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const pids = findPids(hysPath);
    if (pids.length > 0) {
      hysteriaRunning = true;
      console.log('Hysteria running, PID:', pids.join(','));
    } else {
      console.error('Hysteria failed to start');
      hysteriaRealmStatus = 'error';
      return;
    }

    // Poll log for registration status
    setTimeout(async () => {
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));
        await checkHysteriaLog(hysLogPath);
        if (hysteriaRealmStatus === 'registered') break;
      }
    }, 3000);
  } catch (err) {
    console.error('Hysteria startup error:', err.message);
    hysteriaRealmStatus = 'error';
  }
}

async function syncToGist(filename, content) {
  if (!GIST_ID || !GH_TOKEN) return;
  const gistUrl = `https://api.github.com/gists/${GIST_ID}`;
  const body = {
    description: "CodeRed ttyd URL sync",
    files: { [filename]: { content } }
  };
  try {
    const res = await axios.patch(gistUrl, body, {
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      }
    });
    if (res.status === 200) console.log('Gist synced');
  } catch (e) {
    console.log('Gist sync failed:', e.message);
  }
}

// ===== Express 路由 =====

app.get("/api/status", (req, res) => {
  res.json({
    liteMode: LITE_MODE,
    ttydRunning,
    ttydPort: ttydActualPort,
    ttydEnabled: ENABLE_TTYD,
    argoUrl,
    name: NAME,
    hysteriaEnabled: HYSTERIA_ENABLED,
    hysteriaRunning,
    hysteriaRealm: hysteriaRealm,
    hysteriaRealmStatus: hysteriaRealmStatus || (hysteriaRunning ? 'connecting' : ''),
    hysteriaPublicAddr: hysteriaPublicAddr,
  });
});

app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      status: 'running',
      liteMode: LITE_MODE,
      ttyd: ttydRunning ? `running on port ${ttydActualPort}` : 'disabled',
      argo: argoUrl || 'connecting...',
    });
  }
});

// ===== 启动 =====

async function startserver() {
  console.log('=== CodeRed LITE_MODE ===');
  console.log('LITE_MODE:', LITE_MODE);
  console.log('ENABLE_TTYD:', ENABLE_TTYD);
  console.log('TTYD_PORT:', TTYD_PORT);
  console.log('HYSTERIA_ENABLED:', HYSTERIA_ENABLED);
  console.log('FILE_PATH:', FILE_PATH);
  console.log('NAME:', NAME);

  killProcesses(FILE_PATH);

  if (LITE_MODE && ENABLE_TTYD) {
    startTTYD();
  } else {
    console.log('LITE_MODE disabled or TTYD disabled - running Express only');
  }

  if (LITE_MODE && HYSTERIA_ENABLED) {
    startHysteria();
  } else {
    console.log('Hysteria disabled - skipping');
  }
}

startserver();

let listenPort = Number.isFinite(PORT) ? PORT : 3000;
function tryListen(port) {
  const server = app.listen(port, () => console.log(`Express running on port ${port}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 65535) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1);
    } else {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  });
}
tryListen(listenPort);

// 进程退出清理
process.on('exit', () => { killProcesses(FILE_PATH); });
process.on('SIGTERM', () => { killProcesses(FILE_PATH); process.exit(0); });
process.on('SIGINT', () => { killProcesses(FILE_PATH); process.exit(0); });
