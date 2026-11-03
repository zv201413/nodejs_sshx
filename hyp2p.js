'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { ensureTlsCertificate } = require('./tls-cert');

function isRealmUri(value) {
  if (!/^realm(?:\+http)?:\/\//.test(value) || /[\s\\]/.test(value)) return false;
  try {
    const uri = new URL(value);
    decodeURIComponent(uri.username);
    decodeURIComponent(uri.pathname);
    return Boolean(uri.hostname && uri.username && !uri.password && !uri.search && !uri.hash
      && /^\/[^/]+$/.test(uri.pathname)
      && (!uri.port || (/^\d+$/.test(uri.port) && Number(uri.port) >= 1 && Number(uri.port) <= 65535)));
  } catch (_) { return false; }
}

function readHyp2pConfig(getConfig) {
  // A password alone never enables the service; the explicit switch is required.
  const enabled = String(getConfig('ENABLE_HYP2P', 'hyp2p-enable', 'false')).toLowerCase() === 'true';
  if (!enabled) return { enabled: false };
  const auth = String(getConfig('HYP2P_AUTH', 'hyp2p-auth', ''));
  const obfs = String(getConfig('HYP2P_OBFS', 'hyp2p-obfs', ''));
  const realm = String(getConfig('HYP2P_RV', 'hyp2p-rv', '')).trim();
  if (!auth.trim()) throw new Error('启用 P2P 必须填写 hyp2p-auth 认证密码');
  if (obfs && Buffer.byteLength(obfs) < 4) throw new Error('hyp2p-obfs 混淆密码至少需要 4 字节');
  if (realm && !isRealmUri(realm)) throw new Error('hyp2p-rv 必须是 realm://token@主机/名字 或 realm+http://token@主机:端口/名字');
  return { enabled, auth, obfs, realm };
}

function writePrivate(filename, content) {
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT
    | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('P2P 配置必须是独立的普通文件');
    fs.fchmodSync(fd, 0o600);
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, content);
  } finally { fs.closeSync(fd); }
}

async function prepareHyp2p(directory, config) {
  const root = fs.realpathSync(directory);
  const p2p = path.join(root, 'p2p');
  fs.mkdirSync(p2p, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(p2p).isDirectory()) throw new Error('p2p 必须是普通目录');
  fs.chmodSync(p2p, 0o700);
  let realm = config.realm;
  if (!realm) {
    const namePath = path.join(p2p, 'realm_name');
    let name;
    try {
      const stat = fs.lstatSync(namePath);
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('realm_name 必须是独立的普通文件');
      name = fs.readFileSync(namePath, 'utf8').trim();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      name = crypto.randomBytes(12).toString('hex');
      writePrivate(namePath, name + '\n');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('已保存的 realm_name 无效');
    realm = 'realm://public@realm.hy2.io/' + name;
  }
  const certificate = await ensureTlsCertificate(p2p);
  // Native Hysteria pins the whole certificate (hex), not sing-box's SPKI pin (base64).
  const pin = certificate.certificateSha256;
  const server = {
    listen: realm,
    tls: { cert: path.join(p2p, 'cert.pem'), key: path.join(p2p, 'private.key') },
    auth: { type: 'password', password: config.auth },
    realm: {
      stunServers: [
        'stun.nextcloud.com:3478',
        'global.stun.twilio.com:3478',
      ],
      stunTimeout: '15s',
      punchTimeout: '20s',
      heartbeatInterval: '30s',
    },
  };
  const obfs = config.obfs ? { type: 'salamander', salamander: { password: config.obfs } } : null;
  if (obfs) server.obfs = obfs;
  const client = [
    'server: ' + JSON.stringify(realm),
    'auth: ' + JSON.stringify(config.auth),
    'realm:',
    '  punchTimeout: 20s',
    'tls:', '  sni: ' + JSON.stringify(certificate.serverName), '  insecure: true',
    '  pinSHA256: ' + JSON.stringify(pin), '  alpn: [h3]',
  ];
  if (obfs) client.push('obfs:', '  type: salamander', '  salamander:', '    password: ' + JSON.stringify(config.obfs));
  client.push('socks5:', '  listen: 127.0.0.1:1080', 'http:', '  listen: 127.0.0.1:8080');
  const configPath = path.join(p2p, 'config.json');
  const clientPath = path.join(p2p, 'client.example.yaml');
  writePrivate(configPath, JSON.stringify(server, null, 2) + '\n');
  writePrivate(clientPath, client.join('\n') + '\n');
  writePrivate(path.join(p2p, 'cert_sha256'), pin + '\n');
  return { realm, pin, configPath, clientPath };
}

function hysteriaDownloadUrl(arch = os.arch()) {
  const target = { x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' }[arch];
  if (os.platform() !== 'linux' || !target) throw new Error('P2P 不支持当前操作系统或 CPU 架构');
  return 'https://github.com/apernet/hysteria/releases/latest/download/hysteria-linux-' + target;
}

function createHyp2pService({ directory, getConfig, runtimeFiles, logGuard, download,
  spawnProcess = spawn, log = console.log, retryDelayMs = 1000 }) {
  let stopped = false;
  let child = null;
  let retryTimer = null;
  let failures = 0;
  let initialization = null;

  async function start() {
    if (initialization) return initialization;
    initialization = initialize();
    return initialization;
  }

  async function initialize() {
    const config = readHyp2pConfig(getConfig);
    if (!config.enabled || stopped) return null;
    const url = hysteriaDownloadUrl();
    const prepared = await prepareHyp2p(directory, config);
    if (stopped) return null;
    const root = fs.realpathSync(directory);
    let name;
    do { name = Array.from(crypto.randomBytes(6), byte => String.fromCharCode(97 + byte % 26)).join(''); }
    while (fs.existsSync(path.join(root, name)));
    const binary = path.join(root, name);
    runtimeFiles.register(name);
    runtimeFiles.register('hyp2p.log');
    try { await download(url, binary); }
    catch (_) { throw new Error('Hysteria2 核心下载失败，请检查 GitHub 连通性后重启'); }
    if (stopped) return null;
    if (!fs.statSync(binary).size) throw new Error('下载的 Hysteria2 核心为空');
    fs.chmodSync(binary, 0o700);

    const uri = new URL(prepared.realm);
    const secrets = [config.auth, config.obfs, uri.username, decodeURIComponent(uri.username)].filter(Boolean);
    const redact = chunk => secrets.reduce((value, secret) => value.split(secret).join('[redacted]'), String(chunk));
    function launch() {
      if (stopped) return;
      const startedAt = Date.now();
      child = spawnProcess(binary, ['server', '--disable-update-check', '-c', prepared.configPath],
        { stdio: ['ignore', 'pipe', 'pipe'] });
      const running = child;
      running.stdout.on('data', chunk => logGuard.append('hyp2p.log', redact(chunk)));
      running.stderr.on('data', chunk => logGuard.append('hyp2p.log', redact(chunk)));
      running.on('error', () => logGuard.append('hyp2p.log', '[HYP2P] 无法启动 Hysteria2 核心\n'));
      running.once('close', (code, signal) => {
        if (child === running) child = null;
        if (stopped) return;
        if (Date.now() - startedAt > 60000) failures = 0;
        const delay = Math.min(retryDelayMs * 2 ** Math.min(failures++, 5), 30000);
        log(`[HYP2P] 核心退出 (${code ?? signal})，${delay / 1000} 秒后重试；详情见 hyp2p.log`);
        retryTimer = setTimeout(launch, delay);
        retryTimer.unref();
      });
      log('[HYP2P] 已启动独立核心，等待 Realm 牵线；连接状态见 hyp2p.log');
    }
    launch();
    log('[HYP2P] 客户端配置: ' + prepared.clientPath);
    log('[HYP2P] 证书 pinSHA256: ' + prepared.pin);
    return prepared;
  }

  async function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    const running = child;
    if (!running) return;
    await new Promise(resolve => {
      const timeout = setTimeout(() => { running.kill('SIGKILL'); resolve(); }, 2000);
      running.once('close', () => { clearTimeout(timeout); resolve(); });
      running.kill('SIGTERM');
    });
  }
  return { start, stop };
}

module.exports = { isRealmUri, readHyp2pConfig, prepareHyp2p, hysteriaDownloadUrl, createHyp2pService };
