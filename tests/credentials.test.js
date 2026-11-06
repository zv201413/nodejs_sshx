const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const credentialScript = html.slice(
  html.indexOf('var agentCredentialPrefix ='),
  html.indexOf("$('toggleAgentCommand').addEventListener"),
);

function fixture(records = []) {
  const elements = new Map();
  const stored = new Map(records.map(record => [record.id, { ...record }]));
  const writes = [];
  let selectedId = null;
  let onGet = () => {};
  let onStore = record => stored.set(record.id, { ...record });
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', hidden: true, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute() {},
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    $, showToast() {}, renderPaper() {},
    location: { protocol: 'https:' },
    window: { isSecureContext: true, PasswordCredential: true },
    document: { querySelector: () => ({ dataset: {} }) },
    PasswordCredential: class { constructor(record) { Object.assign(this, record); } },
    navigator: { credentials: {
      async get(options) {
        assert.deepEqual({ ...options }, { password: true, mediation: 'required' });
        const record = stored.get(selectedId);
        await onGet();
        return record ? { ...record } : null;
      },
      async store(record) {
        writes.push({ ...record });
        await onStore(record);
      },
    } },
  });
  vm.runInContext(credentialScript, context);
  return {
    $, stored, writes, context,
    select(id) { selectedId = id; },
    onGet(callback) { onGet = callback; },
    onStore(callback) { onStore = callback; },
    setAgent(note, command) { $('p-agent-note').value = note; $('p-komari').value = command; },
    setGist(id, token) { $('p-gist-id').value = id; $('p-gist-token').value = token; },
  };
}

test('all inline page scripts parse', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    new vm.Script(match[1]);
  }
});

test('saving a filled legacy probe overwrites its original username', async () => {
  const f = fixture([{ id: '主面板', password: 'bash old.sh' }]);
  f.select('主面板');
  await f.context.fillBrowserCredential(true);
  f.$('p-komari').value = 'bash new.sh --token="new-token"';
  await f.context.submitBrowserCredential(true, false);
  assert.equal(f.stored.size, 1);
  assert.equal(f.stored.get('主面板').password, 'bash new.sh --token="new-token"');
  assert.equal(f.writes[0].id, '主面板');
});

test('saving a modern probe updates the same record; changing its note saves another account', async () => {
  const f = fixture([{ id: '[探针] 主面板', password: 'curl old.sh | bash' }]);
  f.select('[探针] 主面板');
  await f.context.fillBrowserCredential(true);
  f.$('p-komari').value = 'curl new.sh | bash';
  await f.context.submitBrowserCredential(true, false);
  assert.equal(f.stored.size, 1);
  assert.equal(f.stored.get('[探针] 主面板').password, 'curl new.sh | bash');
  f.$('p-agent-note').value = '备用面板';
  await f.context.submitBrowserCredential(true, false);
  assert.equal(f.stored.size, 2);
  assert.equal(f.stored.get('[探针] 备用面板').password, 'curl new.sh | bash');
});

test('explicit update selects the legacy account and keeps the edited command', async () => {
  const f = fixture([{ id: '主面板', password: 'bash old.sh' }]);
  f.setAgent('主面板', 'bash new.sh');
  f.select('主面板');
  await f.context.submitBrowserCredential(true, true);
  assert.equal(f.stored.size, 1);
  assert.equal(f.stored.get('主面板').password, 'bash new.sh');
  assert.equal(f.$('p-komari').value, 'bash new.sh');
});

test('Gist update snapshots new values before the chooser and overwrites the matching record', async () => {
  const f = fixture([{ id: 'gist-1', password: 'old-token' }]);
  f.setGist('gist-1', 'new-token');
  f.select('gist-1');
  f.onGet(() => { f.$('p-gist-token').value = 'old-token'; });
  await f.context.submitBrowserCredential(false, true);
  assert.equal(f.stored.get('gist-1').password, 'new-token');
  assert.equal(f.stored.size, 1);
});

test('canceled, wrong-account and wrong-type selections cannot overwrite credentials', async () => {
  const f = fixture([
    { id: 'gist-2', password: 'other-token' },
    { id: '[探针] 主面板', password: 'bash old.sh' },
  ]);
  f.setGist('gist-1', 'new-token');
  for (const id of [null, 'gist-2', '[探针] 主面板']) {
    f.select(id);
    await f.context.submitBrowserCredential(false, true);
    assert.equal(f.writes.length, 0);
  }
  f.setAgent('其他面板', 'bash new.sh');
  await f.context.submitBrowserCredential(true, true);
  assert.equal(f.writes.length, 0);
});

test('verification detects an ignored update without replacing the edited values', async () => {
  const f = fixture([{ id: 'gist-1', password: 'old-token' }]);
  f.setGist('gist-1', 'new-token');
  f.select('gist-1');
  f.onStore(() => {}); // A resolved store request is not proof of persistence.
  await f.context.submitBrowserCredential(false, true);
  assert.match(f.$('gistCredentialsStatus').textContent, /已提交/);
  await f.context.fillBrowserCredential(false, true);
  assert.match(f.$('gistCredentialsStatus').textContent, /核对未通过/);
  assert.equal(f.$('p-gist-token').value, 'new-token');
  f.stored.get('gist-1').password = 'new-token';
  await f.context.fillBrowserCredential(false, true);
  assert.match(f.$('gistCredentialsStatus').textContent, /核对通过/);
  assert.equal(f.$('p-gist-token').value, 'new-token');
  f.$('p-gist-token').listeners.input();
  assert.equal(f.$('gistCredentialsStatus').hidden, true);
});

test('verification requires the original identity even if another probe has the same note', async () => {
  const f = fixture([
    { id: '主面板', password: 'bash old.sh' },
    { id: '[探针] 主面板', password: 'bash new.sh' },
  ]);
  f.select('主面板');
  await f.context.fillBrowserCredential(true);
  f.$('p-komari').value = 'bash new.sh';
  f.select('[探针] 主面板');
  await f.context.fillBrowserCredential(true, true);
  assert.match(f.$('agentCredentialsStatus').textContent, /不对应/);
});

test('failed requests release the operation lock and allow a retry', async () => {
  const f = fixture();
  f.setGist('gist-1', 'new-token');
  f.onStore(() => { throw new Error('Store disabled'); });
  await f.context.submitBrowserCredential(false, false);
  assert.match(f.$('gistCredentialsStatus').textContent, /请求失败/);
  assert.equal(f.context.credentialRequestPending, false);
  f.onStore(record => f.stored.set(record.id, { ...record }));
  await f.context.submitBrowserCredential(false, false);
  assert.equal(f.stored.get('gist-1').password, 'new-token');
});

test('only one browser chooser operation can run at a time', async () => {
  const f = fixture([{ id: 'gist-1', password: 'old-token' }]);
  f.setGist('gist-1', 'new-token');
  f.select('gist-1');
  let release;
  f.onGet(() => new Promise(resolve => { release = resolve; }));
  const first = f.context.submitBrowserCredential(false, true);
  await f.context.submitBrowserCredential(false, true);
  assert.equal(f.writes.length, 0);
  release();
  await first;
  assert.equal(f.writes.length, 1);
  assert.equal(f.context.credentialRequestPending, false);
});
