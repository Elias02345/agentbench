import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { catalog, scenarios, VERSION } from './scenarios.mjs';
import { evaluate, listModels, normalizeEndpoint, ProviderError } from './engine.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const data=resolve(process.env.AGENTBENCH_DATA_DIR ?? resolve(root,'data'));
mkdirSync(data,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(data,'agentbench.sqlite'));
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, batch TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, config TEXT NOT NULL, created INTEGER NOT NULL, started INTEGER, ended INTEGER);
  CREATE TABLE IF NOT EXISTS cases (run TEXT NOT NULL, idx INTEGER NOT NULL, scenario TEXT NOT NULL, lang TEXT NOT NULL, status TEXT NOT NULL, result TEXT, PRIMARY KEY(run,idx));
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run TEXT NOT NULL, idx INTEGER NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS events_run_idx ON events(run,idx,id);
  CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
db.prepare("UPDATE runs SET status='interrupted', ended=? WHERE status IN ('queued','running')").run(Date.now());
db.exec("UPDATE cases SET status='interrupted' WHERE status IN ('queued','running')");

const publicFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/i18n.js',['i18n.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/mark.svg',['mark.svg','image/svg+xml']]]);
const queue=[];
let active=null;
let closing=false;
let connectionKey='';
let connectionEndpoint=db.prepare("SELECT value FROM preferences WHERE key='endpoint'").get()?.value ?? '';
const addRun=db.prepare("INSERT INTO runs(id,batch,model,mode,status,config,created) VALUES (?,?,?,?,'queued',?,?)");
const addCase=db.prepare("INSERT INTO cases(run,idx,scenario,lang,status) VALUES (?,?,?,?,'queued')");
const addEvent=db.prepare('INSERT INTO events(run,idx,time,data) VALUES (?,?,?,?)');
const runRow=db.prepare('SELECT * FROM runs WHERE id=?');
const getCases=db.prepare('SELECT idx,scenario,lang,status,result FROM cases WHERE run=? ORDER BY idx');
const toCase=row=>({...row,result:row.result ? JSON.parse(row.result) : null});
const traceFor=(id,index)=>event=>addEvent.run(id,index,Date.now(),JSON.stringify(event));
const metric=(results,key)=>results.length ? Math.round(results.reduce((sum,r)=>sum+r[key],0)/results.length) : null;
function serialize(row, detail=false) {
  const cases=getCases.all(row.id).map(toCase);
  const results=cases.map(c=>c.result).filter(r=>typeof r?.overall==='number');
  const langs=Object.fromEntries(['en','de'].map(lang=>{
    const localized=cases.filter(c=>c.lang===lang);
    const scored=localized.map(c=>c.result).filter(r=>typeof r?.overall==='number');
    return [lang,{total:localized.length,scored:scored.length,score:metric(scored,'overall'),language:metric(scored,'languageScore'),workflow:metric(scored,'workflowScore')}];
  }));
  const passes=results.filter(r=>r.passed).length;
  const critical=results.filter(r=>r.critical).length;
  const score=metric(results,'overall');
  const config=JSON.parse(row.config);
  const workflows=Object.fromEntries(config.scenarios.map(id=>{
    const selected=cases.filter(c=>c.scenario===id);
    const scored=selected.map(c=>c.result).filter(r=>typeof r?.overall==='number');
    return [id,{total:selected.length,scored:scored.length,score:metric(scored,'overall'),passes:scored.filter(r=>r.passed).length}];
  }));
  const suitability=row.status!=='completed'?null:critical?'critical':passes/cases.length>=0.8 && score>=85?'strong':passes/cases.length>=0.5?'mixed':'weak';
  const summary={total:cases.length,done:cases.filter(c=>['completed','failed'].includes(c.status)).length,
    scored:results.length,passes,critical,score,workflow:metric(results,'workflowScore'),language:metric(results,'languageScore'),
    tokens:cases.some(c=>c.result?.tokens!=null)?cases.reduce((sum,c)=>sum+(c.result?.tokens??0),0):null,
    usageComplete:results.length===cases.length && cases.every(c=>c.result?.usageComplete),
    calls:cases.reduce((sum,c)=>sum+(c.result?.calls??0),0), langs, workflows, suitability};
  return {...row,config,summary,...(detail?{cases}: {})};
}
function configFor(body) {
  const mode=body.mode;
  if (!['demo','live'].includes(mode)) throw new ProviderError('invalid_mode');
  const allowed = mode==='demo'?['Demo Operator','Demo Lite']:null;
  if (!Array.isArray(body.models) || body.models.length<1 || body.models.length>5 || body.models.some(m=>typeof m!=='string' || !m.trim() || m.length>180 || (allowed && !allowed.includes(m)))) throw new ProviderError('invalid_models');
  if (!Array.isArray(body.scenarios) || !body.scenarios.length || body.scenarios.some(s=>typeof s!=='string' || !Object.hasOwn(scenarios,s))) throw new ProviderError('invalid_scenarios');
  if (!Array.isArray(body.languages) || !body.languages.length || body.languages.some(l=>!['en','de'].includes(l))) throw new ProviderError('invalid_languages');
  if (!Number.isInteger(body.maxTurns) || body.maxTurns<4 || body.maxTurns>40) throw new ProviderError('invalid_turns');
  const repeats=body.repeats ?? 1;
  if (!Number.isInteger(repeats) || repeats<1 || repeats>3) throw new ProviderError('invalid_repeats');
  const endpoint=mode==='live'?normalizeEndpoint(body.endpoint || connectionEndpoint):null;
  const models=[...new Set(body.models.map(m=>m.trim()))];
  const key=mode==='live'?keyFor(body.key ?? (connectionEndpoint===endpoint?connectionKey:'')):'';
  if (key.length>=8 && (endpoint?.includes(key) || models.some(model=>model.includes(key)))) throw new ProviderError('invalid_key');
  return {models, key, mode, config:{version:VERSION, endpoint, maxTurns:body.maxTurns, repeats,
    scenarios:Object.keys(scenarios).filter(s=>body.scenarios.includes(s)), languages:['en','de'].filter(l=>body.languages.includes(l))}};
}
function keyFor(input) {
  if (typeof input!=='string' || input.length>4000 || /[^\x21-\x7e]/.test(input)) throw new ProviderError('invalid_key');
  return input;
}

function schedule(body, date=Date.now()) {
  const {models,key,mode,config}=configFor(body);
  if (queue.length+models.length>20) throw new ProviderError('queue_full');
  const batch=randomUUID();
  const jobs=models.map(model=>({id:randomUUID(),model,key,mode,config}));
  db.exec('BEGIN');
  try {
    for (const job of jobs) {
      addRun.run(job.id,batch,job.model,mode,JSON.stringify(config),date);
      let index=0;
      for (let i=0;i<config.repeats;i++) for (const scenario of config.scenarios) for (const lang of config.languages) addCase.run(job.id,index++,scenario,lang);
    }
    db.exec('COMMIT');
  } catch(error) {
    db.exec('ROLLBACK');
    throw error;
  }
  queue.push(...jobs);
  setImmediate(drain);
  return {batch,ids:jobs.map(j=>j.id)};
}
function setTerminal(id,status) {
  db.prepare('UPDATE runs SET status=?,ended=? WHERE id=?').run(status,Date.now(),id);
  db.prepare("UPDATE cases SET status=? WHERE run=? AND status IN ('running','queued')").run(status,id);
}
async function drain() {
  if (active || !queue.length || closing) return;
  const job=queue.shift();
  const {id,mode,model,key,config}=job;
  const controller=new AbortController();
  active={id,controller};
  db.prepare("UPDATE runs SET status='running',started=? WHERE id=?").run(Date.now(),id);
  let success=0;
  let fatal=null;
  try {
    for (const item of getCases.all(id)) {
      controller.signal.throwIfAborted();
      db.prepare("UPDATE cases SET status='running' WHERE run=? AND idx=?").run(id,item.idx);
      const trace=traceFor(id,item.idx);
      trace({type:'start',scenario:item.scenario,lang:item.lang});
      const result=fatal?{endReason:'provider_error',code:fatal,reply:''}:await evaluate({
        scenario:scenarios[item.scenario],lang:item.lang,mode,model,key,endpoint:config.endpoint,
        maxTurns:config.maxTurns,signal:controller.signal,trace,
      });
      const scored=result.endReason!=='provider_error';
      if (scored) success++;
      if (fatal) trace({type:'error',code:fatal});
      if (/^provider_http_(400|401|403|404|422)$/.test(result.code ?? '')) fatal=result.code;
      db.prepare('UPDATE cases SET status=?,result=? WHERE run=? AND idx=?').run(scored?'completed':'failed',JSON.stringify(result),id,item.idx);
      trace({type:'end',endReason:result.endReason});
    }
    const total=getCases.all(id).length;
    setTerminal(id,success===total?'completed':success?'partial':'failed');
  } catch(error) {
    if (!controller.signal.aborted) console.error('Benchmark worker failed:',error.name);
    setTerminal(id,controller.signal.aborted?(closing?'interrupted':'cancelled'):'failed');
  } finally {
    active=null;
    setImmediate(drain);
  }
}
function cancel(id) {
  if (active?.id===id) {
    active.controller.abort();
    return true;
  }
  const position=queue.findIndex(j=>j.id===id);
  if (position===-1) return false;
  queue.splice(position,1);
  setTerminal(id,'cancelled');
  return true;
}

function json(response,status,value) {
  response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  response.end(JSON.stringify(value));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ProviderError('invalid_content_type');
  const chunks=[];
  let length=0;
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>32000) throw new ProviderError('body_too_large');
    chunks.push(chunk);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ProviderError('invalid_json'); }
}
function sameOrigin(req) {
  const origin=req.headers.origin;
  const forwarded=req.headers['x-forwarded-host'];
  if (req.headers['sec-fetch-site']==='cross-site') return false;
  if (!origin) return true;
  try { return [req.headers.host,forwarded].includes(new URL(origin).host); } catch { return false; }
}
const server=createServer(async (req,res)=>{
  res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'");
  try {
    const {pathname,searchParams}=new URL(req.url,'http://localhost');
    if (req.method==='POST' && !sameOrigin(req)) return json(res,403,{error:'forbidden_origin'});
    if (req.method==='GET' && publicFiles.has(pathname)) {
      const [file,type]=publicFiles.get(pathname);
      res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});
      return res.end(await readFile(resolve(root,'public',file)));
    }
    if (req.method==='GET' && pathname==='/api/catalog') return json(res,200,{version:VERSION,scenarios:catalog});
    if (req.method==='GET' && pathname==='/api/runs') {
      const rows=db.prepare('SELECT * FROM runs ORDER BY created DESC, rowid DESC LIMIT 250').all();
      return json(res,200,{runs:rows.map(r=>serialize(r)),running:!!active,queued:queue.length});
    }
    if (req.method==='POST' && pathname==='/api/runs') return json(res,202,schedule(await body(req)));
    const runPath=pathname.match(/^\/api\/runs\/([a-f\d-]{36})(?:\/(events|cancel|export))?$/);
    if (runPath) {
      const [,id,action]=runPath;
      const row=runRow.get(id);
      if (!row) return json(res,404,{error:'not_found'});
      if (req.method==='GET' && !action) return json(res,200,serialize(row,true));
      if (req.method==='POST' && action==='cancel') return json(res,cancel(id)?200:409,{ok:row.status==='queued'||row.status==='running'});
      if (req.method==='GET' && action==='events') {
        const idx=Number(searchParams.get('case'));
        if (!Number.isInteger(idx) || idx<0 || idx>100 || !getCases.all(id).some(c=>c.idx===idx)) return json(res,404,{error:'not_found'});
        const events=db.prepare('SELECT id,time,data FROM events WHERE run=? AND idx=? ORDER BY id').all(id,idx);
        return json(res,200,events.map(({id,time,data})=>({id,time,...JSON.parse(data)})));
      }
      if (req.method==='GET' && action==='export') {
        const events=db.prepare('SELECT id,idx,time,data FROM events WHERE run=? ORDER BY id').all(id);
        res.setHeader('content-disposition',`attachment; filename="agentbench-${id}.json"`);
        return json(res,200,{...serialize(row,true),events:events.map(({data,...event})=>({...event,...JSON.parse(data)}))});
      }
    }
    if (req.method==='GET' && pathname==='/api/connection') return json(res,200,{endpoint:connectionEndpoint,hasKey:!!connectionKey});
    if (req.method==='POST' && pathname==='/api/connection') {
      const input=await body(req);
      const endpoint=normalizeEndpoint(input.endpoint);
      const key=input.key==null && endpoint===connectionEndpoint?connectionKey:keyFor(input.key??'');
      if (key.length>=8 && endpoint.includes(key)) throw new ProviderError('invalid_key');
      db.prepare("INSERT INTO preferences VALUES ('endpoint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(endpoint);
      connectionEndpoint=endpoint;
      connectionKey=key;
      return json(res,200,{endpoint,hasKey:!!key});
    }
    if (req.method==='POST' && pathname==='/api/connection/test') {
      const input=await body(req);
      const endpoint=normalizeEndpoint(input.endpoint);
      const key=input.key==null && endpoint===connectionEndpoint?connectionKey:keyFor(input.key??'');
      const models=await listModels(endpoint,key,new AbortController().signal);
      return json(res,200,{models:models.filter(model=>!key || !model.includes(key))});
    }
    return json(res,404,{error:'not_found'});
  } catch(error) {
    if (error instanceof ProviderError) return json(res,error.code.startsWith('provider_')?502:400,{error:error.code});
    console.error('Request failed:',error.name);
    return json(res,500,{error:'server_error'});
  }
});
function seed() {
  if (process.env.AGENTBENCH_SEED==='0' || db.prepare('SELECT id FROM runs LIMIT 1').get()) return;
  schedule({mode:'demo',models:['Demo Lite'],scenarios:Object.keys(scenarios),languages:['en','de'],maxTurns:20},Date.now()-86_400_000);
  schedule({mode:'demo',models:['Demo Operator'],scenarios:Object.keys(scenarios),languages:['en','de'],maxTurns:20});
}
const port=Number(process.env.PORT??4173);
server.listen(port,process.env.HOST??'127.0.0.1',()=>{
  seed();
  console.log('AgentBench listening on port '+server.address().port);
});
for (const event of ['SIGINT','SIGTERM']) process.on(event,()=>{
  closing=true;
  active?.controller.abort();
  for (const job of queue.splice(0)) setTerminal(job.id,'interrupted');
  server.close();
});
