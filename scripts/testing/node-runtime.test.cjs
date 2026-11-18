const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('one exact Node runtime for local, CI and all production containers',()=>{
 const version=read('.nvmrc').trim(); assert.match(version,/^24\.\d+\.\d+$/);
 assert.equal(process.versions.node,version,'run checks using the pinned runtime');
 assert.equal(JSON.parse(read('package.json')).engines.node,version);
 const workflow=read('.github/workflows/ci.yml');
 assert.equal((workflow.match(/node-version-file: '\.nvmrc'/g)||[]).length,4);
 assert.doesNotMatch(workflow,/node-version:/);
 for(const app of ['api','web','worker'])assert.ok(read('apps/'+app+'/Dockerfile').includes('FROM node:'+version+'-alpine AS base'));
});
