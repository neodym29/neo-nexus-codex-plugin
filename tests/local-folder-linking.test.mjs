import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import test from 'node:test';

const plugin = new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url).pathname;

for (const git of [true, false]) test(`${git ? 'a local Git folder without commits or a remote' : 'a folder without Git'} auto-links by its approved device match`, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nexus-local-link-'));
  const repository = path.join(temporary, 'mascot');
  const state = path.join(temporary, 'state');
  fs.mkdirSync(repository);
  fs.mkdirSync(state);
  if (git) {
    execFileSync('git', ['-C', repository, 'init', '-q']);
    assert.equal(execFileSync('git', ['-C', repository, 'rev-list', '--all', '--count'], { encoding: 'utf8' }).trim(), '0');
  }
  const token = `etn_${'A'.repeat(43)}`;
  const identityDirectory = git ? fs.realpathSync(path.join(repository, '.git')) : repository;
  const stat = fs.statSync(identityDirectory);
  const fingerprint = crypto.createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`).digest('hex');
  const key = `local:${crypto.createHmac('sha256', token).update(`${repository}\0${fingerprint}`).digest('hex')}`;
  const calls = [];
  let connected = false;
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    calls.push({ operation: request.url.split('/').at(-1), body });
    response.setHeader('content-type', 'application/json');
    if (request.url.endsWith('/codex-context') && !connected) { response.writeHead(403); response.end('{}'); return; }
    const data = request.url.endsWith('/codex-project-options') ? { projects: [{ id: '64', title: 'Mascot', repositoryMatches: true }] }
      : request.url.endsWith('/codex-project-connect') ? (connected = true, { project: { id: '64', title: 'Mascot' }, attributedUpdates: 2 })
        : request.url.endsWith('/codex-context') ? { project: { id: '64', title: 'Mascot' }, stage: { label: 'Open' }, openClientRequests: [] }
          : request.url.endsWith('/codex-work-update') ? { progressRefresh: { updated: true, percent: 24 } }
            : {};
    response.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({ serverUrl: origin, agentToken: token, clones: [] }), { mode: 0o600 });
  const child = spawn(process.execPath, [plugin], { cwd: repository, env: { ...process.env, EMPLOYEE_TRACE_HOME: state }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(async () => {
    child.kill();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  let nextId = 0;
  const pending = new Map();
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const reply = JSON.parse(line);
      pending.get(reply.id)?.(reply.result);
      pending.delete(reply.id);
    }
  });
  const call = (name, args) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Plugin response timed out')); }, 5000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`);
  });
  const context = await call('neo_nexus_current_project', { repository_path: repository });
  assert.equal(context.structuredContent.project.id, '64');
  assert.equal(context.isError, undefined);
  assert.deepEqual(calls.map(call => call.operation), ['codex-context', 'codex-project-options', 'codex-project-connect', 'codex-context']);
  assert.equal(calls[1].body.repositoryKey, key);
  assert.equal(calls[2].body.repositoryKey, key);
  const work = await call('neo_nexus_record_work', { repository_path: repository, status: 'in_progress', summary: 'Verified a local change without making a Git commit.' });
  assert.equal(work.isError, undefined);
  assert.equal(calls.at(-1).operation, 'codex-work-update');
  assert.equal(calls.at(-1).body.workspaceId, 64);
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
