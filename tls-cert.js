'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

const SERVER_NAME = 'www.bing.com';
// Public fingerprint of the old shared fallback key; never reuse that key.
const LEGACY_SHARED_PIN = 'i0kuuT1vvjgUKxiY7B7pmRQjB4IWBc1+dZ7hqsCZJwE=';

function readManagedFile(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('证书文件必须是普通文件，不能是链接');
    return fs.readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function certificateInfo(pem, keyPem) {
  const cert = new crypto.X509Certificate(pem);
  const key = crypto.createPrivateKey(keyPem);
  if (!cert.checkPrivateKey(key)) throw new Error('自签证书与私钥不匹配');
  const spki = cert.publicKey.export({ type: 'spki', format: 'der' });
  return {
    pem,
    serverName: SERVER_NAME,
    publicKeyPin: crypto.createHash('sha256').update(spki).digest('base64'),
    certificateSha256: crypto.createHash('sha256').update(cert.raw).digest('hex'),
    cert,
  };
}

async function ensureTlsCertificate(directory, { openssl = 'openssl' } = {}) {
  const root = fs.realpathSync(directory);
  const certPath = path.join(root, 'cert.pem');
  const keyPath = path.join(root, 'private.key');
  const pem = readManagedFile(certPath);
  const keyPem = readManagedFile(keyPath);
  let info;
  let reuseKey = keyPem;
  let rotatedSharedKey = false;
  if (pem && !keyPem) throw new Error('cert.pem 存在但 private.key 缺失，请恢复匹配的私钥');
  if (keyPem) {
    const key = crypto.createPrivateKey(keyPem); // Reject damaged keys without replacing them.
    const spki = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
    if (crypto.createHash('sha256').update(spki).digest('base64') === LEGACY_SHARED_PIN) {
      reuseKey = null;
      rotatedSharedKey = true;
    }
  }
  if (pem) {
    info = certificateInfo(pem, keyPem);
    if (rotatedSharedKey) {
      info = null;
    } else {
      const cert = info.cert;
      const hasSAN = /(?:^|,\s*)DNS:www\.bing\.com(?:,|$)/.test(cert.subjectAltName || '');
      const now = Date.now();
      if (!hasSAN || !cert.checkHost(SERVER_NAME) || Date.parse(cert.validFrom) > now
          || Date.parse(cert.validTo) < now + 30 * 86400000) info = null;
    }
  }

  if (!info) {
    const temp = fs.mkdtempSync(path.join(root, '.tls-'));
    try {
      const tempKey = path.join(temp, 'private.key');
      const tempCert = path.join(temp, 'cert.pem');
      if (reuseKey) fs.writeFileSync(tempKey, reuseKey, { mode: 0o600 });
      const args = ['req', '-new', '-x509', '-days', '3650', '-out', tempCert,
        '-subj', '/CN=' + SERVER_NAME, '-addext', 'subjectAltName=DNS:www.bing.com,DNS:bing.com'];
      if (reuseKey) args.push('-key', tempKey);
      else args.push('-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', tempKey);
      try {
        await execFile(openssl, args, { timeout: 30000 });
      } catch (error) {
        throw new Error('自签证书生成失败：需要 OpenSSL 1.1.1 或更新版本；已有证书与私钥保留', { cause: error });
      }
      info = certificateInfo(fs.readFileSync(tempCert, 'utf8'), fs.readFileSync(tempKey, 'utf8'));
      if (!info.cert.checkHost(SERVER_NAME) || !info.cert.verify(info.cert.publicKey)) {
        throw new Error('新生成的自签证书校验失败');
      }
      fs.chmodSync(tempKey, 0o600);
      fs.chmodSync(tempCert, 0o644);
      // Existing keys stay untouched when only SAN/expiry needs repair, preserving SPKI pins.
      if (!reuseKey) fs.renameSync(tempKey, keyPath);
      fs.renameSync(tempCert, certPath);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  fs.chmodSync(keyPath, 0o600);
  for (const [name, value] of [['PUBKEY_SHA256_B64.txt', info.publicKeyPin], ['SHA256.txt', info.certificateSha256]]) {
    const filename = path.join(root, name);
    if (readManagedFile(filename) !== value + '\n') fs.writeFileSync(filename, value + '\n', { mode: 0o644 });
  }
  return { ...info, rotatedSharedKey };
}

module.exports = { ensureTlsCertificate, certificateInfo, SERVER_NAME };
