const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {Client}=require('pg');
const {assertDisposableDatabase}=require('./testing/disposable-target.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  const connectionString=process.env.DATABASE_URL||'';
  await assertDisposableDatabase(connectionString);
  const manifestPath=process.env.JOBSCLICK_TEST_MANIFEST;
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const directory=path.dirname(path.resolve(manifestPath));
  if(path.basename(directory)!==manifest.runId)throw Error('DISPOSABLE_TEST_TARGET_REQUIRED');
  const config=fs.readFileSync(path.join(directory,'supabase/config.toml'),'utf8');
  if(!config.includes('project_id = "'+manifest.runId+'"'))throw Error('DISPOSABLE_TEST_TARGET_REQUIRED');
  const db=new Client({connectionString});await db.connect();let schemas;
  try{await db.query('begin read only');schemas=(await db.query("select nspname from pg_namespace where nspname !~ '^pg_' and nspname not in ('information_schema','test_support') order by nspname")).rows.map(row=>row.nspname);await db.query('rollback');}finally{await db.end();}
  if(schemas.some(schema=>! /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)))throw Error('TYPE_SCHEMA_INVALID');
  const args=[path.join(root,'node_modules/supabase/dist/supabase.js'),'gen','types','--lang','typescript','--schema',schemas.join(','),'--workdir',directory,'--agent','no','--output-format','text'];
  const generated=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:24*1024*1024,env:{...process.env,DO_NOT_TRACK:'1'}});
  if(generated.status!==0)throw Error('DISPOSABLE_TYPE_GENERATION_FAILED');
  const actual=generated.stdout.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').trim()+'\n';
  const ts=require('typescript');
  const parsed=ts.createSourceFile('generated.types.ts',actual,ts.ScriptTarget.Latest,true);
  const aliases=parsed.statements.filter(ts.isTypeAliasDeclaration).map(node=>node.name.text);
  if(parsed.parseDiagnostics.length||!aliases.includes('Json')||!aliases.includes('Database')){
    console.error(JSON.stringify({code:'TYPE_GENERATION_OUTPUT_INVALID',stdoutPrefix:actual.slice(0,200).replace(/postgresql:\/\/[^\s]+/g,'[local DB URL]')}));
    throw Error('TYPE_GENERATION_OUTPUT_INVALID');
  }
  const target=path.join(root,'packages/database/src/generated.types.ts');
  const mode=process.argv[2]||'--check';
  if(mode==='--write')fs.writeFileSync(target,actual);
  else if(mode!=='--check'||fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==actual)throw Error('GENERATED_DATABASE_TYPES_STALE');
  console.log(JSON.stringify({mode,schemas,bytes:Buffer.byteLength(actual),target:'packages/database/src/generated.types.ts',project:manifest.runId}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
