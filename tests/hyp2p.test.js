const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { isRealmUri, readHyp2pConfig, prepareHyp2p, createHyp2pService } = require('../hyp2p');
const { createRuntimeFiles } = require('../runtime-files');
const { createLogGuard } = require('../log-limit');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodejs-hyp2p-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const configReader = values => (_env, key, fallback) => values[key] ?? fallback;
const enabled = { 'hyp2p-enable': 'true', 'hyp2p-auth': 'test-auth', 'hyp2p-obfs': 'test-obfs' };
async function eventually(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail('timed out waiting for child process');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('P2P stays off by default and credentials alone do not start or write anything', async t => {
  const directory = fixture(t);
  const service = createHyp2pService({
    directory, getConfig: configReader({ 'hyp2p-auth': 'secret', 'hyp2p-obfs': 'secret' }),
    download: () => assert.fail('disabled P2P downloaded a binary'),
  });
  assert.equal(await service.start(), null);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.deepEqual(readHyp2pConfig(configReader({ 'hyp2p-enable': 'false', 'hyp2p-rv': 'bad' })), { enabled: false });
});

test('explicit enablement requires auth and validates optional obfs and Realm URI without leaking values', () => {
  for (const password of ['', '   ']) {
    assert.throws(() => readHyp2pConfig(configReader({ ...enabled, 'hyp2p-auth': password })), /hyp2p-auth/);
  }
  assert.throws(() => readHyp2pConfig(configReader({ ...enabled, 'hyp2p-obfs': 'abc' })), /4 字节/);
  assert.equal(readHyp2pConfig(configReader({ ...enabled, 'hyp2p-obfs': '' })).obfs, '');
  assert.equal(readHyp2pConfig(configReader({ ...enabled, 'hyp2p-obfs': '中文' })).obfs, '中文');
  for (const uri of ['realm://public@realm.hy2.io/name', 'realm+http://token@127.0.0.1:8443/test',
    'realm://token@host:443/test', 'realm+http://token@[::1]:8443/test', 'realm://a%40b@host/test']) assert.equal(isRealmUri(uri), true, uri);
  for (const uri of ['https://token@host/test', 'realm://host/test', 'realm://token@host',
    'realm://token@host/', 'realm://token@host/a/b', 'realm://token:password@host/test',
    'realm://token@host:99999/test', 'realm://token@host:0/test', 'realm://%@host/test',
    'realm://token@host/test#fragment', 'realm://token@host/te st']) assert.equal(isRealmUri(uri), false, uri);
  assert.throws(() => readHyp2pConfig(configReader({ ...enabled, 'hyp2p-rv': 'https://private-token@host/test' })), error => {
    assert.ok(!error.message.includes('private-token'));
    return true;
  });
});

test('server and client retain complex passwords, matching obfs and the native whole-certificate pin', async t => {
  const directory = fixture(t);
  const auth = 'a"b\\n:c\n中文$`';
  const obfs = 'obfs"\\with:colon';
  const prepared = await prepareHyp2p(directory, { auth, obfs, realm: '' });
  const server = JSON.parse(fs.readFileSync(prepared.configPath, 'utf8'));
  assert.equal(server.listen, prepared.realm);
  assert.equal(server.auth.password, auth);
  assert.equal(server.obfs.salamander.password, obfs);
  assert.ok(path.isAbsolute(server.tls.cert));
  const yaml = fs.readFileSync(prepared.clientPath, 'utf8');
  assert.ok(yaml.includes('auth: ' + JSON.stringify(auth) + '\n'));
  assert.ok(yaml.includes('password: ' + JSON.stringify(obfs) + '\n'));
  assert.ok(yaml.includes('server: ' + JSON.stringify(prepared.realm)));
  assert.ok(yaml.includes('insecure: true'));
  assert.ok(yaml.includes('pinSHA256: ' + JSON.stringify(prepared.pin)));
  const cert = new crypto.X509Certificate(fs.readFileSync(server.tls.cert));
  assert.equal(prepared.pin, crypto.createHash('sha256').update(cert.raw).digest('hex'));
  assert.match(prepared.pin, /^[a-f0-9]{64}$/);
  for (const name of ['private.key', 'config.json', 'client.example.yaml', 'realm_name', 'cert_sha256']) {
    assert.equal(fs.statSync(path.join(directory, 'p2p', name)).mode & 0o777, 0o600);
  }
  assert.equal(fs.statSync(path.join(directory, 'p2p')).mode & 0o777, 0o700);
});

test('restart keeps the public Realm and certificate while allowing password and custom Realm changes', async t => {
  const directory = fixture(t);
  const first = await prepareHyp2p(directory, { auth: 'original', obfs: 'original', realm: '' });
  const key = fs.readFileSync(path.join(directory, 'p2p', 'private.key'));
  const second = await prepareHyp2p(directory, { auth: 'changed', obfs: '', realm: '' });
  assert.equal(first.realm, second.realm);
  assert.equal(first.pin, second.pin);
  assert.deepEqual(key, fs.readFileSync(path.join(directory, 'p2p', 'private.key')));
  assert.equal(JSON.parse(fs.readFileSync(second.configPath)).obfs, undefined);
  assert.ok(!fs.readFileSync(second.clientPath, 'utf8').includes('obfs:'));
  const realm = 'realm+http://private@127.0.0.1:8443/fixed';
  const third = await prepareHyp2p(directory, { auth: 'custom', obfs: '', realm });
  assert.equal(third.realm, realm);
  assert.equal(first.pin, third.pin);
  assert.equal(JSON.parse(fs.readFileSync(third.configPath)).listen, realm);
});

test('unsafe configuration links are rejected without truncating the linked file', async t => {
  const directory = fixture(t);
  const p2p = path.join(directory, 'p2p');
  fs.mkdirSync(p2p);
  const keep = path.join(directory, 'keep');
  fs.writeFileSync(keep, 'keep this content');
  fs.linkSync(keep, path.join(p2p, 'config.json'));
  await assert.rejects(prepareHyp2p(directory, { auth: 'auth', obfs: '', realm: 'realm://token@host/test' }), /普通文件/);
  assert.equal(fs.readFileSync(keep, 'utf8'), 'keep this content');
});

test('managed native launches use argument arrays, redact secrets, restart on exit and stop on request', async t => {
  const directory = fixture(t);
  const runtimeFiles = createRuntimeFiles(directory);
  const logGuard = createLogGuard(directory, 1);
  t.after(logGuard.stop);
  const events = path.join(directory, 'events');
  const script = '#!' + process.execPath + '\n'
    + 'const fs = require("node:fs"); const filename = ' + JSON.stringify(events) + ';'
    + 'fs.appendFileSync(filename, "start\\n");'
    + 'process.stdout.write("test-auth test-obfs private-token\\n");'
    + 'if (fs.readFileSync(filename,"utf8").split("start").length === 2) setTimeout(()=>process.exit(1),30);'
    + 'else setInterval(()=>{},1000);';
  const messages = [];
  const service = createHyp2pService({
    directory, runtimeFiles, logGuard, retryDelayMs: 20, log: message => messages.push(message),
    getConfig: configReader({ ...enabled, 'hyp2p-rv': 'realm://private-token@host/test' }),
    download: async (_url, binary) => fs.writeFileSync(binary, script, { mode: 0o700 }),
  });
  t.after(service.stop);
  const prepared = await service.start();
  assert.equal(await service.start(), prepared, 'repeated start must not duplicate a process');
  await eventually(() => fs.existsSync(events) && fs.readFileSync(events, 'utf8') === 'start\nstart\n');
  await eventually(() => fs.existsSync(path.join(directory, 'hyp2p.log')));
  await service.stop();
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(fs.readFileSync(events, 'utf8'), 'start\nstart\n');
  const output = fs.readFileSync(path.join(directory, 'hyp2p.log'), 'utf8');
  assert.ok(output.includes('[redacted]'));
  for (const secret of ['test-auth', 'test-obfs', 'private-token']) {
    assert.ok(!output.includes(secret));
    assert.ok(!messages.join('\n').includes(secret));
  }
  logGuard.append('hyp2p.log', Buffer.alloc(3 * 1024 * 1024));
  assert.ok(fs.statSync(path.join(directory, 'hyp2p.log')).size <= 1024 * 1024);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.runtime-files.json')));
  assert.ok(manifest.files.includes('hyp2p.log'));
  assert.equal(await createRuntimeFiles(directory).cleanup(), 2);
  assert.ok(fs.existsSync(prepared.configPath), 'restart cleanup must retain P2P credentials');
});

test('stopping during the binary download prevents a later process from starting', async t => {
  const directory = fixture(t);
  const runtimeFiles = createRuntimeFiles(directory);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let downloading = false;
  const service = createHyp2pService({
    directory, runtimeFiles, getConfig: configReader(enabled),
    download: async () => { downloading = true; await pending; },
    spawnProcess: () => assert.fail('process started after stop'),
  });
  const starting = service.start();
  await eventually(() => downloading);
  await service.stop();
  release();
  assert.equal(await starting, null);
});

test('the actual install parser round-trips quoted passwords from properties and command arguments', t => {
  const directory = fixture(t);
  const filename = path.join(directory, 'application.properties');
  const auth = 'quote" and slash\\n and :colon\nnewline';
  const obfs = 'mixed\\"password';
  const line = 'install=hyp2p-enable="true" hyp2p-auth=' + JSON.stringify(auth) + ' hyp2p-obfs=' + JSON.stringify(obfs);
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const parser = source.slice(source.indexOf('function parseInstallParams()'), source.indexOf('const installParams = parseInstallParams();'));
  fs.writeFileSync(filename, line);
  for (const argv of [[], [line]]) {
    if (argv.length) fs.writeFileSync(filename, '');
    const parsed = vm.runInNewContext(parser + '\nparseInstallParams()', { fs, appConfigFile: filename, process: { argv } });
    assert.equal(parsed['hyp2p-enable'], 'true');
    assert.equal(parsed['hyp2p-auth'], auth);
    assert.equal(parsed['hyp2p-obfs'], obfs);
  }
});
