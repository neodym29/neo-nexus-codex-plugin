import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url), 'utf8');

test('unlinked repository work sends a privacy-safe repository identity', () => {
  assert.match(source, /function localRepositoryKey/);
  assert.match(source, /createHmac\('sha256', config\.token\)/);
  assert.match(source, /return `local:\$\{crypto\.createHmac/);
  assert.match(source, /repositoryKey: identity\.repositoryKey/);
  assert.match(source, /repositoryUrl: identity\.repositoryUrl/);
  assert.doesNotMatch(source, /codex-other-work-update'[\s\S]{0,600}repositoryPath/);
});

test('plugin release version is consistent', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../plugins/neo-nexus/.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.6.8');
  assert.match(source, /SERVER_INFO = \{name: 'neo-nexus', version: '0\.6\.8'\}/);
});
