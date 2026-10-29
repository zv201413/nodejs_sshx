const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { once } = require('node:events');
const { parseLogMaxMB, createLogGuard } = require('../log-limit');
const { createRuntimeFiles, createKomariEnv } = require('../runtime-files');

const MiB = 1024 * 1024;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodejs-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('log limits validate integers and default to 50 MB', () => {
  for (const value of [undefined, '', '0', '-1', '1025', '1.5', '1e2', '50; touch x', 'NaN']) assert.equal(parseLogMaxMB(value), 50);
  assert.equal(parseLogMaxMB('1'), 1);
  assert.equal(parseLogMaxMB('0100'), 100);
  assert.equal(parseLogMaxMB('1024'), 1024);
});

test('writes enforce the byte limit and keep recording new output', t => {
  const dir = fixture(t);
  const guard = createLogGuard(dir, 1);
  t.after(guard.stop);
  guard.append('runtime.log', Buffer.alloc(700000, 'a'));
  guard.append('runtime.log', Buffer.alloc(700000, 'b'));
  assert.equal(fs.statSync(path.join(dir, 'runtime.log')).size, 700000);
  assert.equal(fs.readFileSync(path.join(dir, 'runtime.log'))[0], 'b'.charCodeAt(0));
  guard.append('runtime.log', Buffer.alloc(2 * MiB, 'c'));
  assert.equal(fs.statSync(path.join(dir, 'runtime.log')).size, MiB);
  guard.append('runtime.log', 'latest\n');
  assert.equal(fs.readFileSync(path.join(dir, 'runtime.log'), 'utf8'), 'latest\n');
});

test('sweep caps existing files without touching configuration, symlinks or hardlinks', t => {
  const dir = fixture(t);
  for (const name of ['boot.log', 'config.json', 'private.key', 'sub.txt']) {
    fs.writeFileSync(path.join(dir, name), '');
    fs.truncateSync(path.join(dir, name), 51 * MiB);
  }
  const fd = fs.openSync(path.join(dir, 'boot.log'), 'a');
  t.after(() => fs.closeSync(fd));
  fs.symlinkSync(path.join(dir, 'private.key'), path.join(dir, 'sshx.log'));
  fs.linkSync(path.join(dir, 'config.json'), path.join(dir, 'ttyd.log'));
  const guard = createLogGuard(dir, 50);
  t.after(guard.stop);
  assert.equal(fs.statSync(path.join(dir, 'boot.log')).size, 0);
  fs.writeSync(fd, 'next');
  assert.equal(fs.statSync(path.join(dir, 'boot.log')).size, 4, 'append fd does not create sparse holes');
  for (const name of ['config.json', 'private.key', 'sub.txt']) assert.equal(fs.statSync(path.join(dir, name)).size, 51 * MiB);
  assert.equal(guard.append('sshx.log', 'bad'), false);
  assert.equal(guard.append('ttyd.log', 'bad'), false);
  assert.equal(guard.append('../outside.log', 'bad'), false);
});

test('child stdout and stderr remain bounded under sustained output', async t => {
  const dir = fixture(t);
  const guard = createLogGuard(dir, 1);
  t.after(guard.stop);
  const child = guard.spawn('node -e \'process.stdout.write(Buffer.alloc(3*1024*1024, 65));\'', 'boot.log');
  child.ref();
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  const data = fs.readFileSync(path.join(dir, 'boot.log'));
  assert.ok(data.length <= MiB);
  const stderrChild = guard.spawn('node -e \'process.stderr.write("stderr-marker");\'', 'boot.log');
  stderrChild.ref();
  assert.equal((await once(stderrChild, 'close'))[0], 0);
  assert.equal(fs.readFileSync(path.join(dir, 'boot.log'), 'utf8'), 'stderr-marker');
});

test('restart removes registered downloads, interrupted files and logs, preserving user files', async t => {
  const dir = fixture(t);
  const first = createRuntimeFiles(dir);
  for (const name of ['abcdef', 'ghijkl', 'mnopqr_ttyd.log', 'stuvwx_argo.log']) {
    first.register(name);
    fs.writeFileSync(path.join(dir, name), name === 'ghijkl' ? '' : 'fixture');
  }
  for (const name of ['config.json', 'private.key', 'cert.pem', 'sub.txt', 'custom']) fs.writeFileSync(path.join(dir, name), 'keep');
  const next = createRuntimeFiles(dir);
  assert.equal(await next.cleanup(), 4);
  for (const name of ['config.json', 'private.key', 'cert.pem', 'sub.txt', 'custom']) assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'keep');
  next.register('yzabcd');
  fs.writeFileSync(path.join(dir, 'yzabcd'), 'new download');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.runtime-files.json'))).files, ['yzabcd']);
  assert.equal(await createRuntimeFiles(dir).cleanup(), 1);
});

test('legacy migration recognizes bundled binaries across chunk boundaries and preserves unknown files', async t => {
  const dir = fixture(t);
  const binary = Buffer.alloc(128 * 1024);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(binary);
  Buffer.from('github.com/cloudflare/cloudflared').copy(binary, 65530);
  fs.writeFileSync(path.join(dir, 'abcdef'), binary);
  fs.writeFileSync(path.join(dir, 'ghijkl'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]));
  fs.writeFileSync(path.join(dir, 'mnopqr'), '2026 INF https://fixture.trycloudflare.com');
  fs.writeFileSync(path.join(dir, 'stuvwx'), 'user text');
  fs.writeFileSync(path.join(dir, 'aaaaaa'), '2026-10-29 INF Starting tunnel tunnelID=fixture\n2026-10-29 INF GOOS: linux GoVersion: go1.25');
  fs.writeFileSync(path.join(dir, 'zzzzzz'), 'user note: cloudflared https://fixture.trycloudflare.com');
  fs.symlinkSync(path.join(dir, 'abcdef'), path.join(dir, 'yzabcd'));
  assert.equal(await createRuntimeFiles(dir).cleanup(), 3);
  assert.ok(fs.existsSync(path.join(dir, 'ghijkl')));
  assert.ok(fs.existsSync(path.join(dir, 'stuvwx')));
  assert.ok(fs.existsSync(path.join(dir, 'zzzzzz')));
  assert.ok(fs.lstatSync(path.join(dir, 'yzabcd')).isSymbolicLink());
});

test('invalid manifest entries cannot delete paths outside the runtime directory', async t => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, 'config.json'), 'keep');
  fs.writeFileSync(path.join(dir, '.runtime-files.json'), JSON.stringify({version: 1, files: ['../config.json', 'config.json', '/tmp/file', null]}));
  assert.equal(await createRuntimeFiles(dir).cleanup(), 0);
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), 'keep');
});

test('cleanup stops the exact managed executable before removing it', async t => {
  const dir = fixture(t);
  const runtime = createRuntimeFiles(dir);
  runtime.register('abcdef');
  fs.copyFileSync('/bin/sleep', path.join(dir, 'abcdef'));
  fs.chmodSync(path.join(dir, 'abcdef'), 0o700);
  const child = spawn(path.join(dir, 'abcdef'), ['30']);
  const exited = once(child, 'exit');
  t.after(() => child.kill());
  await once(child, 'spawn');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(await runtime.cleanup(), 1);
  const [, signal] = await exited;
  assert.equal(signal, 'SIGTERM');
  assert.equal(fs.existsSync(path.join(dir, 'abcdef')), false);
});

test('probe pipeline and nohup children inherit the virtual home without changing Node environment', async t => {
  const dir = fixture(t);
  const names = ['HOME', 'USER', 'SHELL', 'PATH'];
  const parent = names.map(name => process.env[name]);
  const env = {
    HOME: '/nonexistent/account-home', USER: 'code', SHELL: '/usr/sbin/nologin',
    PATH: '/custom/bin', KOMARI_TEST_NODE: process.execPath,
    KOMARI_TEST_SCRIPT: 'nohup "$KOMARI_TEST_NODE" -e \'process.stdout.write(JSON.stringify({home:process.env.HOME,user:process.env.USER,shell:process.env.SHELL,path:process.env.PATH}));\' & wait "$!"',
  };
  const before = { ...env };
  const preferredHome = path.join(dir, 'www', 'home');
  const passwdFile = path.join(dir, 'passwd');
  fs.writeFileSync(passwdFile, 'code:x:1000:1000::/nonexistent/account-home:/usr/sbin/nologin\n');
  const runEnv = createKomariEnv(dir, { env, preferredHome, passwdFile });
  const { stdout } = await promisify(exec)('printf \'%s\\n\' "$KOMARI_TEST_SCRIPT" | /bin/bash', { env: runEnv });
  const childEnv = JSON.parse(stdout);
  assert.equal(childEnv.home, preferredHome);
  assert.equal(childEnv.user, 'code');
  assert.equal(childEnv.shell, '/bin/bash');
  assert.equal(childEnv.path, '/bin:/usr/bin:/usr/local/bin:/custom/bin');
  assert.equal(fs.statSync(preferredHome).mode & 0o777, 0o700);
  assert.deepEqual(env, before);
  assert.deepEqual(names.map(name => process.env[name]), parent);
});

test('unavailable preferred home falls back to a stable writable runtime directory', t => {
  const dir = fixture(t);
  const preferredHome = path.join(dir, 'not-a-directory');
  fs.writeFileSync(preferredHome, 'keep');
  const options = { preferredHome, passwdFile: path.join(dir, 'missing-passwd') };
  const first = createKomariEnv(dir, options);
  assert.equal(first.HOME, path.join(dir, 'komari-home'));
  fs.writeFileSync(path.join(first.HOME, 'keep'), 'persist');
  assert.equal(createKomariEnv(dir, options).HOME, first.HOME);
  assert.equal(fs.readFileSync(path.join(first.HOME, 'keep'), 'utf8'), 'persist');
  assert.equal(fs.readFileSync(preferredHome, 'utf8'), 'keep');
});

test('passwd substring matches are rejected, including matches outside the home field', t => {
  const dir = fixture(t);
  const preferredHome = path.join(dir, 'www', 'home');
  const passwdFile = path.join(dir, 'passwd');
  fs.writeFileSync(passwdFile, `code:x:1000:1000:${preferredHome}-old:/actual-home:/usr/sbin/nologin\n`);
  const env = createKomariEnv(dir, { preferredHome, passwdFile });
  assert.equal(env.HOME, path.join(dir, 'komari-home'));
  assert.equal(fs.existsSync(preferredHome), false);
});

test('resolved home paths also avoid passwd matches through symlinks', t => {
  const dir = fixture(t);
  const realHome = path.join(dir, 'account-home');
  const preferredHome = path.join(dir, 'virtual-home');
  fs.mkdirSync(realHome);
  fs.symlinkSync(realHome, preferredHome);
  const passwdFile = path.join(dir, 'passwd');
  fs.writeFileSync(passwdFile, `code:x:1000:1000::${realHome}:/usr/sbin/nologin\n`);
  assert.equal(createKomariEnv(dir, { preferredHome, passwdFile }).HOME, path.join(dir, 'komari-home'));
});

test('no unsafe probe environment is returned when both home candidates are unusable', t => {
  const dir = fixture(t);
  const preferredHome = path.join(dir, 'www-home');
  const passwdFile = path.join(dir, 'passwd');
  fs.writeFileSync(passwdFile, `code:x:1000:1000:${preferredHome}:${path.join(dir, 'komari-home')}:/usr/sbin/nologin\n`);
  assert.throws(() => createKomariEnv(dir, { preferredHome, passwdFile }), /Komari 虚拟 HOME/);
  assert.equal(fs.existsSync(preferredHome), false);
  assert.equal(fs.existsSync(path.join(dir, 'komari-home')), false);
});
