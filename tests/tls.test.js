const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { ensureTlsCertificate } = require('../tls-cert');
const { buildTlsNode, makeIosSubscription, buildSingboxConfig, subscriptionFiles, registerSubscriptionRoutes } = require('../tls-links');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodejs-tls-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('fresh certificate is unique, has SAN and stays byte-for-byte stable across restarts', async t => {
  const dir = fixture(t);
  const first = await ensureTlsCertificate(dir);
  assert.equal(first.cert.checkHost('www.bing.com'), 'www.bing.com');
  assert.equal(first.cert.checkHost('bing.com'), 'bing.com');
  assert.equal(first.cert.verify(first.cert.publicKey), true);
  assert.equal(first.cert.publicKey.asymmetricKeyType, 'ec');
  assert.equal(fs.statSync(path.join(dir, 'private.key')).mode & 0o777, 0o600);
  const key = fs.readFileSync(path.join(dir, 'private.key'), 'utf8');
  fs.writeFileSync(path.join(dir, 'PUBKEY_SHA256_B64.txt'), 'stale-cache');
  const second = await ensureTlsCertificate(dir, { openssl: '/missing-openssl' });
  assert.equal(second.pem, first.pem);
  assert.equal(second.publicKeyPin, first.publicKeyPin);
  assert.equal(fs.readFileSync(path.join(dir, 'private.key'), 'utf8'), key);
  assert.equal(fs.readFileSync(path.join(dir, 'PUBKEY_SHA256_B64.txt'), 'utf8'), first.publicKeyPin + '\n');
  assert.equal(fs.readFileSync(path.join(dir, 'SHA256.txt'), 'utf8'), first.certificateSha256 + '\n');
  const another = await ensureTlsCertificate(fixture(t));
  assert.notEqual(another.publicKeyPin, first.publicKeyPin);
});

test('SPKI base64 pin and full-certificate hex hash agree with independent OpenSSL exports', async t => {
  const dir = fixture(t);
  const info = await ensureTlsCertificate(dir);
  const publicPem = execFileSync('openssl', ['x509', '-in', path.join(dir, 'cert.pem'), '-pubkey', '-noout']);
  const spki = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: publicPem });
  const pin = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: spki }).toString('base64');
  const certDER = execFileSync('openssl', ['x509', '-in', path.join(dir, 'cert.pem'), '-outform', 'DER']);
  const hex = crypto.createHash('sha256').update(certDER).digest('hex');
  assert.equal(info.publicKeyPin, pin);
  assert.equal(info.certificateSha256, hex);
  assert.equal(Buffer.from(pin, 'base64').length, 32);
  assert.match(hex, /^[a-f0-9]{64}$/);
});

test('legacy certificates without SAN are repaired using the original key and SPKI pin', async t => {
  const dir = fixture(t);
  execFileSync('openssl', ['req', '-new', '-x509', '-days', '3650', '-newkey', 'ec',
    '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(dir, 'private.key'),
    '-out', path.join(dir, 'cert.pem'), '-subj', '/CN=bing.com'], { stdio: 'ignore' });
  const key = fs.readFileSync(path.join(dir, 'private.key'), 'utf8');
  const old = new crypto.X509Certificate(fs.readFileSync(path.join(dir, 'cert.pem')));
  const oldPin = crypto.createHash('sha256').update(old.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
  const info = await ensureTlsCertificate(dir);
  assert.equal(info.publicKeyPin, oldPin);
  assert.equal(fs.readFileSync(path.join(dir, 'private.key'), 'utf8'), key);
  assert.equal(info.cert.checkHost('www.bing.com'), 'www.bing.com');
  assert.notEqual(info.pem, old.toString());
});

test('a lost certificate can be reissued without changing the existing private key', async t => {
  const dir = fixture(t);
  const first = await ensureTlsCertificate(dir);
  fs.unlinkSync(path.join(dir, 'cert.pem'));
  const second = await ensureTlsCertificate(dir);
  assert.equal(second.publicKeyPin, first.publicKeyPin);
  assert.equal(second.cert.verify(second.cert.publicKey), true);
});

test('mismatched or damaged key material is rejected and preserved', async t => {
  const dir = fixture(t);
  const first = await ensureTlsCertificate(dir);
  const otherDir = fixture(t);
  await ensureTlsCertificate(otherDir);
  const wrongKey = fs.readFileSync(path.join(otherDir, 'private.key'), 'utf8');
  fs.writeFileSync(path.join(dir, 'private.key'), wrongKey);
  await assert.rejects(ensureTlsCertificate(dir), /不匹配/);
  assert.equal(fs.readFileSync(path.join(dir, 'private.key'), 'utf8'), wrongKey);
  assert.equal(fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8'), first.pem);
  fs.writeFileSync(path.join(dir, 'cert.pem'), 'damaged-certificate');
  await assert.rejects(ensureTlsCertificate(dir));
  assert.equal(fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8'), 'damaged-certificate');
});

test('missing OpenSSL fails explicitly without creating a shared key or leaving temporary files', async t => {
  const dir = fixture(t);
  await assert.rejects(ensureTlsCertificate(dir, { openssl: '/missing-openssl' }), /OpenSSL/);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('certificate and fingerprint links cannot change files outside the runtime directory', async t => {
  const dir = fixture(t);
  const outside = path.join(fixture(t), 'user-file');
  fs.writeFileSync(outside, 'keep');
  fs.symlinkSync(outside, path.join(dir, 'cert.pem'));
  await assert.rejects(ensureTlsCertificate(dir), /链接/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
  fs.unlinkSync(path.join(dir, 'cert.pem'));
  await ensureTlsCertificate(dir);
  fs.unlinkSync(path.join(dir, 'SHA256.txt'));
  fs.linkSync(outside, path.join(dir, 'SHA256.txt'));
  await assert.rejects(ensureTlsCertificate(dir), /链接/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
});

const sampleInfo = { publicKeyPin: Buffer.alloc(32, 0xfb).toString('base64'), serverName: 'www.bing.com', pem: 'PUBLIC-PEM' };
const sampleOptions = { uuid: '11111111-1111-4111-8111-111111111111', host: '[2001:db8::1]', port: '20001', name: '中文 #节点+名' };

test('desktop links encode SPKI pins once and disable every insecure flag for all TLS protocols', () => {
  for (const protocol of ['hysteria2', 'tuic', 'anytls']) {
    const node = buildTlsNode(protocol, sampleOptions, sampleInfo);
    const uri = new URL(node.uri);
    assert.equal(uri.hostname, '[2001:db8::1]');
    assert.equal(uri.searchParams.get('pinSHA256'), sampleInfo.publicKeyPin);
    assert.ok(node.uri.includes('%2B') && node.uri.includes('%2F') && node.uri.includes('%3D'));
    assert.equal(decodeURIComponent(uri.hash.slice(1)), sampleOptions.name);
    for (const name of ['insecure', 'allowInsecure', 'allow_insecure']) {
      if (uri.searchParams.has(name)) assert.equal(uri.searchParams.get(name), '0');
    }
    assert.equal(node.outbound.server, '2001:db8::1');
    assert.equal(node.outbound.tls.insecure, false);
    assert.deepEqual(node.outbound.tls.certificate_public_key_sha256, [sampleInfo.publicKeyPin]);
    assert.equal(node.outbound.tls.server_name, 'www.bing.com');
    if (protocol === 'tuic') {
      assert.match(node.uri, new RegExp('^tuic://' + sampleOptions.uuid + ':' + sampleOptions.uuid + '@'));
      assert.equal(uri.searchParams.get('version'), '5');
    }
  }
  assert.throws(() => buildTlsNode('tuic', sampleOptions, { ...sampleInfo, publicKeyPin: 'wrong-pin' }), /指纹/);
});

test('iOS conversion removes pins, keeps TUIC credentials and leaves Reality and Argo untouched', () => {
  const original = ['hysteria2', 'tuic', 'anytls'].map(protocol => buildTlsNode(protocol, sampleOptions, sampleInfo).uri);
  const other = ['anytls://uuid@127.0.0.1:443?security=reality&pbk=public#test', 'vless://uuid@cf.example:443?security=tls&insecure=0#name'];
  const desktop = [...original, ...other].join('\n');
  const ios = makeIosSubscription(desktop).split('\n');
  for (let i = 0; i < original.length; i++) {
    const uri = new URL(ios[i]);
    assert.equal(uri.searchParams.has('pinSHA256'), false);
    assert.equal(uri.searchParams.has('allowInsecure'), false);
    assert.equal(uri.searchParams.get(uri.protocol === 'tuic:' ? 'allow_insecure' : 'insecure'), '1');
    assert.equal(uri.username, sampleOptions.uuid);
    if (uri.protocol === 'tuic:') {
      assert.equal(uri.password, sampleOptions.uuid);
      assert.equal(uri.searchParams.get('version'), '5');
    }
    if (uri.protocol === 'hysteria2:') assert.equal(uri.searchParams.get('peer'), 'www.bing.com');
  }
  assert.deepEqual(ios.slice(3), other);
  for (const uri of original) assert.equal(new URL(uri).searchParams.get('pinSHA256'), sampleInfo.publicKeyPin);
});

test('Gist stores separate importable subscriptions, public PEM and native pinned configuration', () => {
  const desktop = buildTlsNode('hysteria2', sampleOptions, sampleInfo);
  const ios = makeIosSubscription(desktop.uri);
  const config = buildSingboxConfig([desktop.outbound]);
  const files = subscriptionFiles('sub_node.txt', desktop.uri, ios, sampleInfo, config);
  assert.equal(files['sub_node.txt'], desktop.uri + '\n');
  assert.equal(files['sub_node-ios.txt'], ios + '\n');
  assert.equal(files['sub_node-cert.pem'], sampleInfo.pem);
  assert.equal(JSON.parse(files['sub_node-singbox.json']).outbounds[1].tls.insecure, false);
  assert.deepEqual(subscriptionFiles('sub.txt', 'desktop', 'ios', null, null), { 'sub.txt': 'desktop\n', 'sub-ios.txt': 'ios\n' });
});

test('subscription routes serve independent variants, current public certificate and readiness status', () => {
  const routes = new Map();
  let snapshot = null;
  registerSubscriptionRoutes({ get: (route, handler) => routes.set(route, handler) }, 'private/sub', () => snapshot);
  function request(route) {
    const result = { statusCode: 200, headers: {} };
    const res = {
      status: code => { result.statusCode = code; return res; },
      set: (key, value) => { result.headers[key] = value; return res; },
      send: body => { result.body = body; return res; },
    };
    routes.get(route)({}, res);
    return result;
  }
  assert.equal(request('/private/sub').statusCode, 503);
  snapshot = { desktop: 'secure', ios: 'compatible', info: sampleInfo, singbox: { outbounds: [] } };
  assert.equal(Buffer.from(request('/private/sub').body, 'base64').toString(), 'secure');
  assert.equal(Buffer.from(request('/private/sub-ios').body, 'base64').toString(), 'compatible');
  assert.equal(request('/private/sub-cert.pem').body, 'PUBLIC-PEM');
  assert.equal(request('/private/sub-cert.pem').headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(request('/private/sub-singbox.json').body), { outbounds: [] });
  snapshot = { desktop: 'updated', ios: 'updated-ios', info: null, singbox: null };
  assert.equal(Buffer.from(request('/private/sub').body, 'base64').toString(), 'updated');
  assert.equal(request('/private/sub-cert.pem').statusCode, 404);
});
