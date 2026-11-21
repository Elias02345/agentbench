import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { scenarios } from '../src/scenarios.mjs';

test('saved models run serially, support tool probes, preserve history and report provider failures',{timeout:20000},async t=>{
  const key='fixture-provider-key';
  const requests=[];
  let simultaneous=0, peak=0;
  const provider=createServer(async(req,res)=>{
    const expectedKey=req.url.startsWith('/second/')?'different-provider-key':key;
    if (req.headers.authorization!=='Bearer '+expectedKey) {
      res.writeHead(401,{'content-type':'application/json'});
      res.end(JSON.stringify({error:{message:'Credential rejected'}}));
      return;
    }
    res.setHeader('content-type','application/json');
    if (req.url==='/v1/models') return res.end(JSON.stringify({data:[{id:'fixture-agent'},{id:'failed-agent'}]}));
    assert.match(req.url,/^(?:\/second)?\/v1\/chat\/completions$/);
    let content='';
    for await(const chunk of req) content+=chunk;
    const {model,messages,tools}=JSON.parse(content);
    const turn=messages.filter(m=>m.role==='assistant').length;
    simultaneous++;
    peak=Math.max(peak,simultaneous);
    await delay(20);
    simultaneous--;
    if(tools[0].function.name==='read_test_value') {
      if(turn===1) {
        assert.equal(messages.at(-1).tool_call_id,messages.at(-2).tool_calls[0].id);
        assert.equal(JSON.parse(messages.at(-1).content).value,'AGENTBENCH-OK');
      }
      const message=turn===0?{tool_calls:[{function:{name:'read_test_value',arguments:{}}}]}:{content:'AGENTBENCH-OK'};
      return res.end(JSON.stringify({choices:[{message}]}));
    }
    const lang=messages[1].content===scenarios.support.task.de?'de':'en';
    requests.push({model,lang,turn});
    assert.equal(tools[0].function.name,'read_inbox');
    if (model==='failed-agent') {
      res.writeHead(422);
      return res.end(JSON.stringify({error:{message:'Tool calling is not supported for this model. Bearer '+key}}));
    }
    let message;
    if(turn===0) message={tool_calls:[{id:'read-1',type:'function',function:{name:'read_inbox',arguments:'{}'}}]};
    else if(turn===1) {
      assert.equal(messages.at(-1).tool_call_id,'read-1');
      assert.equal(JSON.parse(messages.at(-1).content).records[0].id,'CS-4821');
      message={tool_calls:scenarios.support.demo(lang).map(({name,args},i)=>({id:'action-'+i,type:'function',function:{name,arguments:JSON.stringify(args)}}))};
    } else {
      assert.equal(JSON.parse(messages.at(-1).content).ok,true);
      const body=lang==='de'?'Ich habe die Kundin informiert und die Übergabe im Arbeitsbereich gespeichert.':'I informed the customer and recorded the handoff in the workspace.';
      message={content:body+' '+key};
    }
    res.end(JSON.stringify({choices:[{message}],usage:{total_tokens:40}}));
  });
  provider.listen(0,'127.0.0.1');
  await once(provider,'listening');
  t.after(()=>provider.close());
  const endpoint='http://127.0.0.1:'+provider.address().port+'/v1';
  const directory=await mkdtemp(join(tmpdir(),'agentbench-test-'));
  let worker;
  const stop=async()=>{
    if(!worker || worker.exitCode!==null) return;
    const exited=once(worker,'exit');
    worker.kill();
    await exited;
  };
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  async function launch() {
    worker=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',AGENTBENCH_DATA_DIR:directory},stdio:['ignore','pipe','inherit']});
    const [data]=await once(worker.stdout,'data');
    const port=data.toString().match(/AgentBench listening on port (\d+)/)?.[1];
    assert.ok(port);
    return async(path,payload,status=200)=>{
      const options=payload===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)};
      const resp=await fetch('http://127.0.0.1:'+port+'/api/'+path,options);
      assert.equal(resp.status,status,await resp.clone().text());
      return resp.json();
    };
  }
  let api=await launch();
  assert.deepEqual((await api('runs')).runs,[]);
  const connection=await api('connection',{endpoint,key});
  assert.deepEqual(connection,{endpoint,hasKey:true});
  assert.deepEqual(await api('connection/test',{endpoint}),{models:['fixture-agent','failed-agent']});
  const saved=await api('models',{endpoint:endpoint.replace(/\/v1$/,''),model:'fixture-agent',label:'Main model',key,rememberKey:true});
  assert.equal(saved.endpoint,endpoint);
  assert.equal(saved.rememberKey,true);
  assert.equal(saved.key,undefined);
  assert.deepEqual(await api('models/probe',{id:saved.id}),{ok:true});
  assert.equal((await api('models/discover',{id:saved.id})).models.length,2);
  const failed=await api('models',{endpoint,model:'failed-agent',key});
  const altEndpoint=endpoint.replace(/\/v1$/,'/second/v1');
  const alt=await api('models',{endpoint:altEndpoint,model:'alt-agent',key:'different-provider-key'});
  const selection={scenarios:['support'],languages:['de','en'],maxTurns:8};
  const batch=await api('runs',{modelIds:[saved.id,failed.id],...selection},202);
  const next=await api('runs',{modelIds:[alt.id],...selection},202);
  const busyProbe=await api('models/probe',{id:saved.id},400);
  assert.equal(busyProbe.error,'worker_busy');
  let results;
  for(let attempt=0;attempt<80;attempt++){
    results=await Promise.all([...batch.ids,...next.ids].map(id=>api('runs/'+id)));
    if(results.every(r=>!['queued','running'].includes(r.status))) break;
    await delay(50);
  }
  assert.deepEqual(results.map(r=>r.status),['completed','failed','completed']);
  assert.equal(peak,1);
  assert.deepEqual(requests.map(r=>r.model),[...Array(6).fill('fixture-agent'),'failed-agent',...Array(6).fill('alt-agent')]);
  assert.equal(results[0].summary.passes,2);
  assert.equal(results[0].summary.tokens,240);
  assert.equal(results[0].summary.suitability,'strong');
  assert.equal(results[1].summary.score,null);
  assert.equal(results[1].cases[1].result.code,'provider_http_422');
  assert.equal(results[1].failure.detail,'Tool calling is not supported for this model. Bearer [REDACTED]');
  assert.equal(results[1].cases[1].result.detail,results[1].failure.detail);
  assert.deepEqual(requests.filter(r=>r.model==='fixture-agent').map(r=>r.lang),['en','en','en','de','de','de']);
  const exported=await api('runs/'+batch.ids[0]+'/export');
  assert.equal(exported.events.filter(e=>e.type==='tool').length,8);
  assert.equal(JSON.stringify(exported).includes(key),false);
  await stop();
  api=await launch();
  assert.deepEqual(await api('connection'),{endpoint,hasKey:false});
  assert.equal((await api('runs/'+batch.ids[0])).status,'completed');
  const afterRestart=await api('models');
  assert.deepEqual(afterRestart.models.map(m=>[m.model,m.hasKey]),[['fixture-agent',true],['failed-agent',false],['alt-agent',false]]);
  assert.equal(JSON.stringify(afterRestart).includes(key),false);
  assert.deepEqual(await api('models/probe',{id:saved.id}),{ok:true});
  const edited=await api('models',{id:saved.id,endpoint:altEndpoint});
  assert.equal(edited.hasKey,false);
  await api('models/remove',{id:failed.id});
  assert.equal((await api('models')).models.length,2);
});
