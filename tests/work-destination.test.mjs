import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../plugins/neo-nexus/scripts/mcp-server.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function isUnlinkedWorkError('), source.indexOf('async function dispatch('));
function harness({ linked = false, matched = false, failure, identified = true } = {}) {
  const posts = [];
  const config = {origin:'https://test.invalid',token:'test-only'};
  const scope = vm.createContext({path, Error, SERVER_INFO:{version:'0.6.9'},
    context: async () => { if (failure) throw new Error(failure); if (!linked) throw new Error('This folder is not connected to a Neo-Nexus project.'); return {config,data:{project:{id:'69',title:'Recruitment'}}}; },
    workRepositoryIdentity: () => ({config,...(identified ? {repositoryKey:`local:${'a'.repeat(64)}`} : {})}),
    postWorkMilestone: async (_config,operation,body) => { posts.push({operation,body}); return {projectId:matched||linked?'69':null,otherWork:!matched&&!linked}; },
    result: (text,data) => ({text,data}),
  });
  vm.runInContext(functions + '; this.call = callTool;', scope);
  return {call:scope.call, posts};
}
const body = {repository_path:'/test/recruitment',status:'completed',summary:'Verified production sign-in and reviewer access.'};
test('unadded coding-project work goes to Other work by default without creating a project',async()=>{
  const h=harness();
  const result=await h.call('neo_nexus_record_work',body);
  assert.equal(h.posts.length,1);
  assert.equal(h.posts[0].operation,'codex-other-work-update');
  assert.equal(h.posts[0].body.repositoryKey,`local:${'a'.repeat(64)}`);
  assert.match(result.text,/under Other work/);
  assert.equal(result.data.otherWork,true);
  assert.doesNotMatch(JSON.stringify(h.posts),/test\/recruitment/);
});
test('explicit project-only reporting refuses an unlinked folder without posting',async()=>{
  const h=harness();
  await assert.rejects(h.call('neo_nexus_record_work',{...body,allow_other_work:false}),/Work was not posted.*neo_nexus_connect_project/);
  assert.equal(h.posts.length,0);
});
test('default reporting must supply an explicit absolute folder, not the plugin cwd',async()=>{
  for(const linked of [false,true]) {
    const h=harness({linked});
    for(const repository_path of [undefined,'','relative/project']) await assert.rejects(h.call('neo_nexus_record_work',{...body,repository_path}),/explicit absolute project folder/);
    assert.equal(h.posts.length,0);
  }
});
test('linked project work still goes to its project even when Other work is allowed',async()=>{
  const h=harness({linked:true});
  const result=await h.call('neo_nexus_record_work',body);
  assert.match(result.text,/for Recruitment/);
  assert.equal(h.posts[0].operation,'codex-work-update');
  assert.equal(h.posts[0].body.workspaceId,69);
  await h.call('neo_nexus_record_work',{...body,allow_other_work:true});
  assert.equal(h.posts[1].operation,'codex-work-update');
});
test('default fallback reports the actual server destination when an approved match is found',async()=>{
  const h=harness({matched:true});
  const result=await h.call('neo_nexus_record_work',body);
  assert.match(result.text,/under project 69/);
  assert.equal(result.data.projectId,'69');
  assert.equal(result.data.otherWork,false);
});
test('default reporting refuses a folder whose identity could not be recovered',async()=>{
  const h=harness({identified:false});
  await assert.rejects(h.call('neo_nexus_record_work',body),/project folder could not be identified/);
  assert.equal(h.posts.length,0);
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
  for(const failure of [
    'Neo-Nexus rejected the device identity. Reconnect this device.',
    'This folder has conflicting Neo-Nexus project matches.',
    'The project folder is not a readable directory.',
    'Neo-Nexus could not complete the request (500).',
    'Neo-Nexus could not connect this repository to that project. The configured Git remote may belong to a different project.',
  ]) {
    for(const allow_other_work of [undefined,true]) {
      const h=harness({failure});
      await assert.rejects(h.call('neo_nexus_record_work',{...body,allow_other_work}),{message:failure});
      assert.equal(h.posts.length,0);
    }
  }
});
