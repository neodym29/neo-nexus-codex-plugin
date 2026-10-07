import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import test from 'node:test';
import {assertSafeGitRemote} from '../plugins/neo-nexus/scripts/git-remote.mjs';

const plugin = new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url).pathname;
const TOKENWATCH = 'https://github.com/neodym29/tokenwatch';
const valid = [
  TOKENWATCH, `${TOKENWATCH}.git`, 'https://github.com/neodym29/TokenWatch/',
  'git@github.com:neodym29/tokenwatch.git', 'ssh://git@github.com/neodym29/tokenwatch.git',
  'ssh://git@github.com:22/neodym29/tokenwatch.git',
  'https://gitlab.com/group/subgroup/tokenwatch.git', 'git@gitlab.com:group/subgroup/tokenwatch.git',
  'https://bitbucket.org/team/tokenwatch', 'https://git.example.com/team/tokenwatch.git',
  'ssh://git@git.example.com:2222/team/tokenwatch', 'ssh://git@[2001:db8::1]/team/tokenwatch.git',
  ...['password-manager', 'passwd', 'token', 'secret', 'credentials', 'api-key-tools', 'private-key-guide', 'sk-product', 'ghp_demo']
    .map(name => `https://github.com/token-team/${name}`),
];
const invalid = [
  '', null, undefined, 123, `${TOKENWATCH}${'a'.repeat(2048)}`,
  ` ${TOKENWATCH}`, `${TOKENWATCH} `, `${TOKENWATCH}\n`, `${TOKENWATCH}\r`, `${TOKENWATCH}\t`,
  'https://user@github.com/neodym29/tokenwatch',
  'https://@github.com/neodym29/tokenwatch',
  'https://user:fake-password@github.com/neodym29/tokenwatch',
  'https://:fake-password@github.com/neodym29/tokenwatch',
  'https://fake-token@github.com/neodym29/tokenwatch',
  'ssh://git:fake-password@github.com/neodym29/tokenwatch',
  'ssh://git:@github.com/neodym29/tokenwatch',
  'ssh://user@github.com/neodym29/tokenwatch', 'ssh://github.com/neodym29/tokenwatch',
  'git:fake-password@github.com:neodym29/tokenwatch',
  'user@github.com:neodym29/tokenwatch',
  `${TOKENWATCH}?token=fake`, `${TOKENWATCH}?`, `${TOKENWATCH}#fake`, `${TOKENWATCH}#`,
  'git@github.com:neodym29/tokenwatch?token=fake', 'git@github.com:neodym29/tokenwatch#fake',
  'http://github.com/neodym29/tokenwatch', 'git://github.com/neodym29/tokenwatch',
  'file:///home/user/tokenwatch', '/home/user/tokenwatch', '../tokenwatch',
  'ext::sh -c fake-command', 'ftp://github.com/neodym29/tokenwatch',
  'https:github.com/neodym29/tokenwatch', 'https:/github.com/neodym29/tokenwatch',
  'https://github.com/neodym29\\tokenwatch',
  'https://github.com/neodym29/../tokenwatch', 'git@github.com:neodym29/../tokenwatch',
  'https://github.com/neodym29/./tokenwatch', 'git@github.com:neodym29/./tokenwatch',
  'https://github.com/neodym29/%2e%2e/tokenwatch', 'https://github.com/neodym29/token%77atch',
  'https://github.com/', 'https://github.com/neodym29',
  'https://github.com/neodym29/tokenwatch/tree/main', 'https://gitlab.com/group/tokenwatch/-/issues',
  'https://gitlab.com/group/tokenwatch/tree/main', 'https://git.example.com/team/tokenwatch',
  'https://localhost/team/tokenwatch.git', 'ssh://git@127.0.0.1/team/tokenwatch',
  'https://git.local/team/tokenwatch.git', 'git@github..com:team/tokenwatch',
  `https://github.com/neodym29/ghp_${'A'.repeat(36)}`,
  `git@github.com:neodym29/sk-${'A'.repeat(36)}`,
];

test('clean TokenWatch HTTPS, SSH and SCP origins and ordinary security-related product names are allowed', () => {
  for (const remote of valid) assert.equal(assertSafeGitRemote(remote), remote);
});

test('credentials, secret-shaped values, queries, fragments and unsupported/malformed remotes stay blocked', () => {
  for (const remote of invalid) {
    assert.throws(() => assertSafeGitRemote(remote), error => {
      assert.match(error.message, /credentials|supported hosted Git remote/);
      assert.doesNotMatch(error.message, /fake-password|fake-token|fake-command|ghp_A|sk-A/);
      return true;
    });
  }
});

async function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nexus-tokenwatch-'));
  const repository = path.join(temporary, 'tokenwatch');
  const state = path.join(temporary, 'state');
  fs.mkdirSync(repository); fs.mkdirSync(state);
  execFileSync('git', ['-C', repository, 'init', '-q']);
  execFileSync('git', ['-C', repository, 'remote', 'add', 'origin', TOKENWATCH]);
  const calls = [];
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); const operation = request.url.split('/').at(-1);
    calls.push({operation, body}); response.setHeader('content-type', 'application/json');
    const project = {id: '51', title: 'TokenWatch'};
    const data = operation === 'codex-profile' ? {id: 'test-engineer', name: 'Test Engineer', nickname: 'Test Engineer · test-device'}
      : operation === 'codex-project-options' ? {projects: [{...project, repositoryMatches: true, connected: true}]}
        : operation === 'codex-context' ? {project, stage: {label: 'Open'}, openClientRequests: []}
          : operation === 'codex-work-update' ? {projectId: '51', update: {id: 'test-update', summary: body.summary}, progressRefresh: {updated: true, percent: 80}}
            : {ok: true};
    response.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({
    serverUrl: `http://127.0.0.1:${server.address().port}`, agentToken: `etn_${'A'.repeat(43)}`, clones: [],
  }), {mode: 0o600});
  const child = spawn(process.execPath, [plugin], {cwd: state, env: {...process.env, EMPLOYEE_TRACE_HOME: state}, stdio: ['pipe', 'pipe', 'pipe']});
  const pending = new Map(); let nextId = 0; let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n'); if (newline < 0) break;
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message.result); pending.delete(message.id);
    }
  });
  t.after(async () => {
    child.kill(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, {recursive: true, force: true});
  });
  const call = (name, args = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Plugin response timed out')); }, 5000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method: 'tools/call', params: {name, arguments: args}})}\n`);
  });
  return {repository, calls, call};
}

test('TokenWatch lookup and project-only milestone reporting succeed end-to-end through the actual MCP process', async t => {
  const {repository, calls, call} = await fixture(t);
  const profile = await call('neo_nexus_whoami'); assert.equal(profile.structuredContent.id, 'test-engineer');
  const projects = await call('neo_nexus_list_projects', {repository_path: repository});
  assert.equal(projects.isError, undefined); assert.equal(projects.structuredContent.projects[0].title, 'TokenWatch');
  const context = await call('neo_nexus_current_project', {repository_path: repository});
  assert.equal(context.isError, undefined); assert.equal(context.structuredContent.project.id, '51');
  const summary = 'Verified the repository-origin fix and passed its focused security regression checks.';
  const work = await call('neo_nexus_record_work', {repository_path: repository, allow_other_work: false, status: 'completed', summary});
  assert.equal(work.isError, undefined); assert.equal(work.structuredContent.projectId, '51');
  assert.match(work.content[0].text, /for TokenWatch/);
  const posted = calls.at(-1); assert.equal(posted.operation, 'codex-work-update');
  assert.equal(posted.body.workspaceId, 51); assert.equal(posted.body.summary, summary);
  assert.equal(posted.body.pluginVersion, '0.6.10');
  assert.match(posted.body.idempotencyKey, /^[a-f0-9-]{36}$/);
  assert.equal(calls.find(call => call.operation === 'codex-project-options').body.repositoryUrl, TOKENWATCH);
  assert.doesNotMatch(JSON.stringify(calls), /repository_path|neo-nexus-tokenwatch-.*\/|sourceCode/);
});

test('unsafe Git origins block both lookup and milestones before sending any HTTP requests', async t => {
  const {repository, calls, call} = await fixture(t);
  for (const remote of [
    'https://user:fake-password@github.com/neodym29/tokenwatch',
    `${TOKENWATCH}?token=fake`, 'file:///home/user/tokenwatch', 'ext::sh -c fake-command',
    `https://github.com/neodym29/ghp_${'A'.repeat(36)}`, `${TOKENWATCH} `, `${TOKENWATCH}\n`,
  ]) {
    execFileSync('git', ['-C', repository, 'remote', 'set-url', 'origin', remote]);
    for (const name of ['neo_nexus_list_projects', 'neo_nexus_record_work']) {
      const result = await call(name, {repository_path: repository, status: 'completed', summary: 'This test must never be posted.'});
      assert.equal(result.isError, true);
      assert.doesNotMatch(JSON.stringify(result), /fake-password|fake-command|ghp_A/);
      assert.equal(calls.length, 0, 'unsafe origins must never leave the device');
    }
  }
});
