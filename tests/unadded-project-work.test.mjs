import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import test from 'node:test';

const plugin = new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url).pathname;

for (const kind of ['plain folder', 'local Git', 'hosted Git']) {
  test(`unadded ${kind} work reaches Other work through MCP without project creation`, async t => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nexus-other-work-'));
    const repository = path.join(temporary, 'unadded-project');
    const state = path.join(temporary, 'state');
    fs.mkdirSync(repository);
    fs.mkdirSync(state);
    if (kind !== 'plain folder') execFileSync('git', ['-C', repository, 'init', '-q']);
    if (kind === 'hosted Git') execFileSync('git', ['-C', repository, 'remote', 'add', 'origin', 'https://github.com/example/unadded-project.git']);
    const calls = [];
    const updates = [];
    const server = http.createServer(async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      const operation = request.url.split('/').at(-1);
      calls.push({operation, body});
      response.setHeader('content-type', 'application/json');
      if (operation === 'codex-context') { response.writeHead(403); response.end('{}'); return; }
      if (operation === 'codex-project-options') { response.end(JSON.stringify({projects: []})); return; }
      if (operation === 'codex-other-work-update') {
        updates.push(body);
        response.end(JSON.stringify({ok: true, projectId: null, otherWork: true, update: {id: '1', summary: body.summary}}));
        return;
      }
      response.writeHead(400);
      response.end('{}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    fs.writeFileSync(path.join(state, 'config.json'), JSON.stringify({
      serverUrl: `http://127.0.0.1:${server.address().port}`, agentToken: `etn_${'A'.repeat(43)}`, clones: [],
    }), {mode: 0o600});
    const child = spawn(process.execPath, [plugin], {
      cwd: state, env: {...process.env, EMPLOYEE_TRACE_HOME: state}, stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(async () => {
      child.kill();
      await new Promise(resolve => server.close(resolve));
      fs.rmSync(temporary, {recursive: true, force: true});
    });
    let buffer = '';
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Plugin response timed out')), 5000);
      child.once('error', reject);
      child.stdout.on('data', chunk => {
        buffer += chunk;
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        clearTimeout(timer);
        resolve(JSON.parse(buffer.slice(0, newline)).result);
      });
    });
    const summary = 'Completed a coding task and passed its targeted regression checks.';
    child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: 'neo_nexus_record_work', arguments: {repository_path: repository, status: 'completed', summary},
    }})}\n`);
    const result = await reply;
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.otherWork, true);
    assert.equal(result.structuredContent.projectId, null);
    assert.match(result.content[0].text, /under Other work/);
    assert.deepEqual(calls.map(call => call.operation), ['codex-context', 'codex-project-options', 'codex-other-work-update']);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].summary, summary);
    assert.equal(updates[0].status, 'completed');
    assert.match(updates[0].idempotencyKey, /^[a-f0-9-]{36}$/);
    assert.equal(updates[0].pluginVersion, '0.6.10');
    if (kind === 'hosted Git') assert.equal(updates[0].repositoryUrl, 'https://github.com/example/unadded-project.git');
    else assert.match(updates[0].repositoryKey, /^local:[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(calls), /unadded-project-.*\/|neo-nexus-other-work-.*\/|repository_path|conversation|sourceCode/);
  });
}
