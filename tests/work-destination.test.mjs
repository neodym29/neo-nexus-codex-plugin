import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function isUnlinkedWorkError('), source.indexOf('async function dispatch('));
function harness({ linked = false, matched = false, failure } = {}) {
  const posts = [];
  const config = {origin:'https://test.invalid',token:'test-only'};
  const scope = vm.createContext({path, Error, SERVER_INFO:{version:'0.6.8'},
    context: async () => { if (failure) throw new Error(failure); if (!linked) throw new Error('This folder is not connected to a Neo-Nexus project.'); return {config,data:{project:{id:'69',title:'Recruitment'}}}; },
    workRepositoryIdentity: () => ({config,repositoryKey:`local:${'a'.repeat(64)}`}),
    postWorkMilestone: async (_config,operation,body) => { posts.push({operation,body}); return {projectId:matched||linked?'69':null,otherWork:!matched&&!linked}; },
    result: (text,data) => ({text,data}),
  });
  vm.runInContext(functions + '; this.call = callTool;', scope);
  return {call:scope.call, posts};
}
const body = {repository_path:'/test/recruitment',status:'completed',summary:'Verified production sign-in and reviewer access.'};
test('unlinked project work is refused without creating an Other work milestone',async()=>{
  const h=harness();
  await assert.rejects(h.call('neo_nexus_record_work',body),/Work was not posted.*neo_nexus_connect_project/);
  assert.equal(h.posts.length,0);
});
test('project work must supply an explicit absolute folder, not the plugin cwd',async()=>{
  const h=harness({linked:true});
  for(const repository_path of [undefined,'','relative/project']) await assert.rejects(h.call('neo_nexus_record_work',{...body,repository_path}),/explicit absolute project folder/);
  assert.equal(h.posts.length,0);
  const result=await h.call('neo_nexus_record_work',body);
  assert.match(result.text,/for Recruitment/);
  assert.equal(h.posts[0].body.workspaceId,69);
});
test('explicit Other work is supported and reports the actual server destination',async()=>{
  for(const matched of [false,true]) {
    const h=harness({matched});
    const result=await h.call('neo_nexus_record_work',{...body,allow_other_work:true});
    assert.equal(h.posts[0].operation,'codex-other-work-update');
    assert.match(result.text,matched?/under project 69/:/under Other work/);
    assert.equal(result.data.projectId,matched?'69':null);
    assert.equal(h.posts[0].body.repositoryKey,`local:${'a'.repeat(64)}`);
    assert.doesNotMatch(JSON.stringify(h.posts),/test\/recruitment/);
  }
});
test('identity failures cannot be hidden by reporting to Other work',async()=>{
  const h=harness({failure:'Neo-Nexus rejected the device identity. Reconnect this device.'});
  await assert.rejects(h.call('neo_nexus_record_work',{...body,allow_other_work:true}),/rejected the device identity/);
  assert.equal(h.posts.length,0);
});
