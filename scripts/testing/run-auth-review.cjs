const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=JSON.parse(fs.readFileSync(path.join(__dirname,'auth-review-tests.json'),'utf8'));
if(!Array.isArray(files)||files.some(file=>typeof file!=='string'||! /^(apps|packages)\/[A-Za-z0-9_.\/-]+\.ts$/.test(file)||file.split('/').includes('..')))throw Error('AUTH_REVIEW_TEST_SELECTION_INVALID');
const result=cp.spawnSync(process.execPath,[path.join(__dirname,'run-disposable.cjs'),'--auth-contracts',...files],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
