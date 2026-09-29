import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('linked-project plugin publishes only explicit bounded usage steps', () => {
  const server = read('plugins/neo-nexus/scripts/mcp-server.mjs');
  assert.match(server, /name: 'neo_nexus_publish_usage_guide'/);
  assert.match(server, /required: \['instructions'\]/);
  assert.match(server, /maxLength: 4000/);
  assert.match(server, /await context\(args\)[\s\S]*'codex-usage-guide'/);
  assert.match(read('plugins/neo-nexus/skills/neo-nexus-engineer/SKILL.md'), /Never send source files, README contents, prompts, secrets/);
});
