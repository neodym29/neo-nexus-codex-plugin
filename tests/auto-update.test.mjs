import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function exerciseUpdater(t, installedVersion, latestVersion, expectedCalls, recentSuccess = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-nexus-auto-update-'));
  const executable = path.join(directory, 'codex');
  const calls = path.join(directory, 'calls');
  const source = path.join(directory, 'marketplace-plugin');
  fs.mkdirSync(path.join(source, '.codex-plugin'), {recursive: true});
  fs.writeFileSync(path.join(source, '.codex-plugin', 'plugin.json'), JSON.stringify({version: latestVersion}));
  if (recentSuccess) fs.writeFileSync(path.join(directory, 'neo-nexus-plugin-update.json'), JSON.stringify({lastAttempt: Date.now() - 60 * 60 * 1000, lastSuccess: Date.now() - 60 * 1000, installedVersion}));
  fs.writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.NEO_NEXUS_TEST_CALLS, args + '\\n');
if (args === 'plugin list --marketplace neodym --json') process.stdout.write(JSON.stringify({installed: [{pluginId: 'neo-nexus@neodym', version: process.env.NEO_NEXUS_INSTALLED_VERSION, source: {path: process.env.NEO_NEXUS_MARKETPLACE_SOURCE}}]}));
if (args === 'plugin add neo-nexus@neodym --json') process.stdout.write(JSON.stringify({version: process.env.NEO_NEXUS_LATEST_VERSION}));
`, {mode: 0o700});
  const child = spawn(process.execPath, [new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url).pathname], {
    env: {...process.env, EMPLOYEE_TRACE_HOME: directory, NEO_NEXUS_TEST_CALLS: calls, NEO_NEXUS_INSTALLED_VERSION: installedVersion, NEO_NEXUS_LATEST_VERSION: latestVersion, NEO_NEXUS_MARKETPLACE_SOURCE: source, PATH: `${directory}${path.delimiter}${process.env.PATH || ''}`},
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); fs.rmSync(directory, { recursive: true, force: true }); });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
  let response = '';
  child.stdout.on('data', (chunk) => { response += chunk; });
  for (let attempt = 0; attempt < 60; attempt++) {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(path.join(directory, 'neo-nexus-plugin-update.json'), 'utf8')); } catch { /* Wait for updater. */ }
    if (fs.existsSync(calls) && fs.readFileSync(calls, 'utf8').trim().split('\n').length === expectedCalls.length && state.lastSuccess > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(response, /"serverInfo"/);
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), expectedCalls);
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'neo-nexus-plugin-update.json'), 'utf8'));
  assert(state.lastSuccess > 0);
  assert.equal(state.installedVersion, latestVersion);
}

test('plugin installs a new marketplace release without blocking MCP startup', async (t) => {
  await exerciseUpdater(t, '0.6.4', '0.6.5', [
    'plugin marketplace upgrade neodym',
    'plugin list --marketplace neodym --json',
    'plugin add neo-nexus@neodym --json',
  ], true);
});

test('plugin checks but does not reinstall an unchanged release', async (t) => {
  await exerciseUpdater(t, '0.6.5', '0.6.5', [
    'plugin marketplace upgrade neodym',
    'plugin list --marketplace neodym --json',
  ]);
});
