import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('plugin refreshes its trusted marketplace and installed copy without blocking MCP startup', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nexus-auto-update-'));
  const executable = path.join(directory, 'codex');
  const calls = path.join(directory, 'calls');
  fs.writeFileSync(executable, '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.NEO_NEXUS_TEST_CALLS, process.argv.slice(2).join(" ")+"\\n");\n', { mode: 0o700 });
  const child = spawn(process.execPath, [new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url).pathname], {
    env: { ...process.env, EMPLOYEE_TRACE_HOME: directory, NEO_NEXUS_TEST_CALLS: calls, PATH: `${directory}${path.delimiter}${process.env.PATH || ''}` },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
  let response = '';
  child.stdout.on('data', (chunk) => { response += chunk; });
  for (let attempt = 0; attempt < 60; attempt++) {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(path.join(directory, 'neo-nexus-plugin-update.json'), 'utf8')); } catch { /* Wait for updater. */ }
    if (fs.existsSync(calls) && fs.readFileSync(calls, 'utf8').trim().split('\n').length === 2 && state.lastSuccess > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(response, /"serverInfo"/);
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), [
    'plugin marketplace upgrade neodym',
    'plugin add neo-nexus@neodym',
  ]);
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'neo-nexus-plugin-update.json'), 'utf8'));
  assert(state.lastSuccess > 0);
});
