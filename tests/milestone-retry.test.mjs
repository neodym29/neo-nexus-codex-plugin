import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const source = fs.readFileSync(new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('async function callNeoNexus('), source.indexOf('let heartbeatStarted'));
function mock(statuses) {
  const calls = [];
  const context = vm.createContext({ crypto, AbortController, setTimeout, clearTimeout, TypeError, fetch: async (_url, options) => {
    calls.push(JSON.parse(options.body)); const status = statuses.shift();
    if (status === 'network') throw new TypeError('network failed');
    return { ok: status === 200, status, text: async () => '{"ok":true}' };
  } });
  vm.runInContext(functions + ';globalThis.post = postWorkMilestone;', context);
  return { post: context.post, calls };
}
test('lost response retries the identical milestone ID once', async () => {
  for (const failure of [503, 'network']) {
    const { post, calls } = mock([failure, 200]);
    await post({ origin: 'https://qa.test', token: 'test' }, 'codex-work-update', { summary: 'Verified work' });
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
    assert.match(calls[0].idempotencyKey, /^[a-f0-9-]{36}$/);
  }
});
test('authorization errors are not retried; transient retries are bounded', async () => {
  for (const [statuses, count] of [[[401], 1], [[403], 1], [[503, 503], 2]]) {
    const { post, calls } = mock(statuses);
    await assert.rejects(post({ origin: 'https://qa.test', token: 'test' }, 'codex-work-update', {}));
    assert.equal(calls.length, count);
  }
});
