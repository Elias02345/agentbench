import { copy } from './i18n.js';

const icons={
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
  activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  bars:'<path d="M4 19h16M7 15V9m5 6V5m5 10v-4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  plug:'<path d="m9 3 0 4m6-4 0 4M7 7h10v3a5 5 0 0 1-5 5v2a4 4 0 0 1-4 4H5m2-14H5m14 0h-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18m-9-9a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  headphones:'<path d="M4 13v-2a8 8 0 0 1 16 0v2m-16 0h2a2 2 0 0 1 2 2v3H6a2 2 0 0 1-2-2v-3Zm16 0h-2a2 2 0 0 0-2 2v3h2a2 2 0 0 0 2-2v-3Z"/>',
  calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 5h2m3 0h2"/>',
  package:'<path d="m12 3 8 4v10l-8 4-8-4V7l8-4ZM4 7l8 4 8-4m-8 4v10M8 5l8 4"/>',
  table:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-18 5h18m-12-5v9m6-9v9"/>',
  file:'<path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6"/>',
  box:'<path d="m12 3 8 4v10l-8 4-8-4V7l8-4Zm0 0v9m0 0 8 5m-8-5-8 5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
};
const icon=(name,extra='')=>`<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.layers}</svg>`;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const main=document.querySelector('#main');
const dialog=document.querySelector('#run-dialog');
const state={
  lang:localStorage.getItem('agentbench-lang')==='en'?'en':'de', catalog:[], runs:[],
  models:[], legacyEndpoint:'', editingModel:null, version:'', online:false,running:false,
  runFilter:'all',cohort:'', detail:null, trace:[], caseIndex:0,
};
const t=key=>copy[state.lang][key]??key;
const loc=obj=>obj?.[state.lang]??'';
const score=value=>value==null?'—':String(value);
const sc=id=>state.catalog.find(s=>s.id===id);
const modelName=run=>run.config.label||run.model;
const modelLink=run=>`<a class="model-link" href="#run/${esc(run.id)}">${esc(modelName(run))}</a>`;
const status=value=>`<span class="pill ${esc(value)}">${esc(t(value==='queued'?'waiting':value))}</span>`;
const suitability=value=>value?`<span class="pill ${{strong:'pass',mixed:'warn',weak:'warn',critical:'fail'}[value]}">${t(value==='critical'?'criticalFit':value)}</span>`:'—';
const mode=value=>`<span class="pill ${esc(value)}">${esc(t(value))}</span>`;
const uiLocale=()=>state.lang==='de'?'de-DE':'en-GB';
const date=value=>value?new Intl.DateTimeFormat(uiLocale(),{dateStyle:'medium',timeStyle:'short'}).format(value):'—';
const num=value=>value==null?'—':new Intl.NumberFormat(uiLocale()).format(value);
const elapsed=(ms)=>{
  if(ms==null) return '—';
  return ms<1000?`${num(ms)} ms`:`${num(Math.round(ms/100)/10)} s`;
};
function errorText(code,detail='') {
  return [errorLabel(code),detail].filter(Boolean).join(' · ');
}
function errorLabel(code) {
  const exact=copy[state.lang].errors[code];
  if(exact) return exact;
  if(/^provider_http_\d{3}$/.test(code??'')) return `API · HTTP ${code.slice(-3)}`;
  return `${t('unexpected')}${code?' ('+code+')':''}`;
}
async function api(path,data) {
  const options=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)};
  const response=await fetch('/api/'+path,options);
  const value=await response.json();
  if(!response.ok) throw Object.assign(new Error(value.error??'server_error'),{detail:value.detail});
  return value;
}
const nav=[[['dashboard','grid'],['runs','activity'],['compare','bars'],['scenarios','layers']],[['connection','plug']]];
function route() {
  const [name,value]=(location.hash.slice(1)||'dashboard').split('/');
  return ['dashboard','runs','compare','scenarios','connection','run'].includes(name)?{name,value}:{name:'dashboard'};
}
function shell() {
  const {name}=route();
  const current=name==='run'?'runs':name;
  document.documentElement.lang=state.lang;
  document.querySelector('#sidebar').innerHTML=`<a class="brand" href="#dashboard"><img src="/mark.svg" alt=""><strong>AgentBench</strong></a><nav aria-label="${t('workspace')}">
  ${nav.map((group,i)=>`<div class="nav-group"><p class="nav-title">${t(i?'settings':'workspace')}</p>${group.map(([key,symbol])=>`<a class="nav-link" ${current===key?'aria-current="page"':''} href="#${key}">${icon(symbol)}${t(key)}</a>`).join('')}</div>`).join('')}</nav>
  <div class="sidebar-footer"><span>${icon('layers')}${t('versions')}</span><code>v${esc(state.version||'1.0')}</code></div>`;
  document.querySelector('#topbar').innerHTML=`<div class="breadcrumb"><a href="#dashboard">${t('workspace')}</a>${icon('chevron')}<strong>${t(name==='run'?'runDetails':name)}</strong></div><div class="top-actions">
  <span id="system" class="system"></span><div class="segmented" role="group" aria-label="${t('language')}" lang="en">
  ${['en','de'].map(lang=>`<button type="button" data-ui-lang="${lang}" aria-pressed="${state.lang===lang}">${lang.toUpperCase()}</button>`).join('')}</div></div>`;
  worker();
}
function worker() {
  const dot=!state.online?'offline':state.running?'active':'';
  const key=!state.online?'offline':state.running?'working':'ready';
  const system=document.querySelector('#system');
  if(system) system.innerHTML=`<i class="dot ${dot}"></i>${t(key)}`;
}
const button=(label,symbol,attrs='',kind='')=>`<button class="btn ${kind}" type="button" ${attrs}>${symbol?icon(symbol):''}${label}</button>`;
const newButton=()=>state.models.length?button(t('newRun'),'plus','data-new-run','primary')
  : `<a class="btn primary" href="#connection">${icon('plus')}${t('addModel')}</a>`;
const link=(label,href,symbol='arrow')=>`<a class="btn text" href="${href}">${label}${icon(symbol)}</a>`;
const header=(title,subtitle,action='')=>`<section class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</section>`;
const panelHeader=(title,subtitle='',action='')=>`<div class="panel-heading"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</div>`;
const empty=label=>`<div class="empty">${label}</div>`;
function table(rows) {
  if(!rows.length) return empty(t('noRuns'));
  return `<div class="table-wrap"><table><thead><tr>${['model','mode','status','coverage','score','date'].map(k=>`<th scope="col">${t(k)}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(run=>`<tr><td>${modelLink(run)}</td><td>${mode(run.mode)}</td><td>${status(run.status)}${run.failure?`<div class="hint run-error">${esc(errorLabel(run.failure.code))}</div>`:''}</td><td class="num">${run.summary.done} / ${run.summary.total}</td><td class="num"><strong>${score(run.summary.score)}</strong></td><td>${date(run.created)}</td></tr>`).join('')}</tbody></table></div>`;
}
function configKey(run) {
  const {version,scenarios,languages,maxTurns,repeats}=run.config;
  return JSON.stringify([version,scenarios,languages,maxTurns,repeats]);
}
function cohortRows(rows) {
  const unique=new Set();
  return rows.filter(run=>{
    const identity=JSON.stringify([run.model,run.config.endpoint]);
    if(unique.has(identity)) return false;
    unique.add(identity);
    return true;
  });
}
const complete=()=>state.runs.filter(run=>run.status==='completed' && run.summary.scored===run.summary.total);
const tone=index=>['','blue','teal','orange'][index%4];
const scenarioIcon=(sc,index)=>`<span class="scenario-icon ${tone(index)}">${icon(sc.icon)}</span>`;
function chart(rows) {
  if(!rows.length) return empty(t('noScores'));
  return `<div class="legend">${['en','de'].map(lang=>`<span><i class="${lang}"></i>${t(lang)}</span>`).join('')}</div>
    <div class="chart" role="img" aria-label="${esc(rows.map(run=>`${modelName(run)}: ${t('en')} ${score(run.summary.langs.en.score)}, ${t('de')} ${score(run.summary.langs.de.score)}`).join('. '))}">
      <div class="chart-axis" aria-hidden="true">${[100,75,50,25,0].map(n=>`<span>${n}</span>`).join('')}</div>
      <div class="chart-plot" aria-hidden="true"><div class="chart-grid">${Array.from({length:5},()=>'<i></i>').join('')}</div><div class="chart-groups">
        ${rows.map(run=>`<div class="chart-group">${['en','de'].map(lang=>{const value=run.summary.langs[lang].score;return value==null?'':`<div class="bar ${lang}" style="--score:${Number(value)}"><b>${value}</b></div>`;}).join('')}</div>`).join('')}
      </div></div><div class="chart-labels" aria-hidden="true">${rows.map(run=>`<span title="${esc(modelName(run))}">${esc(modelName(run))}</span>`).join('')}</div>
    </div>`;
}
function dashboard() {
  const source=complete();
  const baseline=source.find(run=>run.config.scenarios.length===state.catalog.length && run.config.languages.length===2)??source[0];
  const chartRows=baseline?cohortRows(source.filter(run=>configKey(run)===configKey(baseline))).slice(0,5):[];
  const best=chartRows.length?Math.max(...chartRows.map(r=>r.summary.score)):null;
  const stats=[
    ['checkCircle','finishedRuns',source.length,'serialShort'],['layers','availableScenarios',state.catalog.length,'workflowSet'],
    ['target','bestScore',best==null?'—':`${best}/100`,'liveBest'],['globe','testLanguages',2,'languagesLong'],
  ];
  return header(t('title'),t('subtitle'),newButton())+`
  <section class="hero"><div class="orbits" aria-hidden="true"><i style="--angle:0deg"></i><i style="--angle:60deg"></i><i style="--angle:-60deg"></i><span class="orbit-core">${icon('box')}</span></div>
    <div class="hero-content"><div class="hero-kicker">${icon('layers')}${t('suite')} · v${esc(state.version||'1.0')}</div><h2>${t('hero')}</h2><p>${t('heroText')}</p><a class="hero-link" href="#scenarios">${t('browse')}${icon('arrow')}</a></div>
  </section>
  <section class="stats">${stats.map(([symbol,label,value,note])=>`<article class="stat"><div class="stat-icon">${icon(symbol)}</div><div><h3>${t(label)}</h3><strong class="num">${value}</strong><p>${t(note)}</p></div></article>`).join('')}</section>
  <div class="overview-grid">
    <section class="panel">${panelHeader(t('performance'),t('scoresLanguage')+(baseline?` · ${t(baseline.mode)} · ${baseline.config.scenarios.length}/${state.catalog.length} ${t('scenarios')}`:''),link(t('openComparison'),'#compare'))}${chart(chartRows)}</section>
    <section class="panel">${panelHeader(t('matrix'),'',link(t('all'),'#scenarios'))}
      <div class="mini-list">${state.catalog.slice(0,5).map((item,index)=>`<a class="mini-item" href="#scenarios/${esc(item.id)}">${scenarioIcon(item,index)}<strong>${esc(loc(item.title))}</strong>${icon('chevron','spacer')}</a>`).join('')}</div>
    </section>
  </div>
  <section class="panel">${panelHeader(t('recent'),'',link(t('allRuns'),'#runs'))}${table(state.runs.slice(0,5))}</section>`;
}
function runs() {
  const options=['all','queued','running','completed','partial','failed','cancelled','interrupted'];
  return header(t('runs'),t('runSubtitle'),newButton())+`<div class="filters"><label class="field"><span class="field-title">${t('status')}</span><select class="input" data-filter="runFilter">${options.map(value=>`<option value="${value}" ${state.runFilter===value?'selected':''}>${t(value==='queued'?'waiting':value)}</option>`).join('')}</select></label></div>
  <section class="panel">${table(state.runs.filter(run=>state.runFilter==='all'||run.status===state.runFilter))}</section>`;
}
function compare() {
  const matching=complete();
  const cohorts=new Map(matching.map(run=>[configKey(run),run.config]));
  const active=cohorts.has(state.cohort)?state.cohort:cohorts.keys().next().value;
  const fitOrder={strong:0,mixed:1,weak:2,critical:3};
  const rows=cohortRows(matching.filter(run=>configKey(run)===active)).sort((a,b)=>
    fitOrder[a.summary.suitability]-fitOrder[b.summary.suitability] || b.summary.score-a.summary.score);
  return header(t('compare'),t('compareSubtitle'),newButton())+`<div class="filters">
    ${cohorts.size?`<label class="field"><span class="field-title">${t('cohort')}</span><select class="input" data-filter="cohort">${[...cohorts].map(([key,config])=>`<option value="${esc(key)}" ${active===key?'selected':''}>v${esc(config.version)} · ${config.scenarios.length} ${t('scenarios')} · ${config.languages.join('/').toUpperCase()} · ${config.maxTurns} ${state.lang==='de'?'Runden':'turns'} · ×${config.repeats}${config.scenarios.length<state.catalog.length?' · '+config.scenarios.join(', '):''}</option>`).join('')}</select></label>`:''}</div>
    ${rows.length?`<section class="panel">${panelHeader(t('performance'),t('scoresLanguage'))}${chart(rows.slice(0,6))}
    <div class="table-wrap"><table><thead><tr>${['model','score','suitability','en','de','workflow','languageScore','passed','issues','toolCalls','token','duration'].map(k=>`<th scope="col">${t(k)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(run=>{const s=run.summary;return `<tr><td>${modelLink(run)}${run.config.endpoint?`<div class="hint">${esc(new URL(run.config.endpoint).host)}</div>`:''}</td><td><strong>${score(s.score)}</strong></td><td>${suitability(s.suitability)}</td><td>${score(s.langs.en.score)}</td><td>${score(s.langs.de.score)}</td><td>${score(s.workflow)}</td><td>${score(s.language)}</td><td>${s.passes}/${s.total}</td><td>${s.critical}</td><td>${num(s.calls)}</td><td>${num(s.tokens)}${s.tokens!=null&&!s.usageComplete?' *':''}</td><td>${elapsed(run.ended-run.started)}</td></tr>`;}).join('')}</tbody></table></div>${rows.some(run=>run.summary.tokens!=null&&!run.summary.usageComplete)?`<p class="footnote">${t('tokenNote')}</p>`:''}</section>${workflowComparison(rows)}`:`<section class="panel">${empty(t('noComparable'))}</section>`}`;
}
function workflowComparison(rows) {
  const ids=rows[0].config.scenarios;
  return `<section class="panel" style="margin-top:16px">${panelHeader(t('workflowResults'))}
  <div class="table-wrap"><table><thead><tr><th scope="col">${t('workflow')}</th>${rows.map(run=>`<th scope="col">${modelLink(run)}</th>`).join('')}</tr></thead>
  <tbody>${ids.map(id=>`<tr><th scope="row">${esc(loc(sc(id)?.title)||id)}</th>${rows.map(run=>{
    const r=run.summary.workflows[id];
    return `<td><strong>${score(r?.score)}</strong> <span class="hint">· ${r?.passes ?? 0}/${r?.total ?? 0} ${t('passed').toLowerCase()}</span></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
function scenariosView(selected) {
  return header(t('scenarios'),t('scenarioSubtitle'),newButton())+`<section class="scenario-grid">
    ${state.catalog.map((item,index)=>`<article class="panel scenario-card" id="scenario-${esc(item.id)}">
      <div class="card-title">${scenarioIcon(item,index)}<h2>${esc(loc(item.title))}</h2></div><p>${esc(loc(item.description))}</p>
      <details ${selected===item.id?'open':''}><summary>${t('brief')} &amp; ${t('criteria')}</summary><p>${esc(loc(item.task))}</p><ol>${item.rubric.map(r=>`<li>${esc(loc(r.label))} · ${r.weight} ${t('points')}${r.critical?` · <strong>${t('critical')}</strong>`:''}</li>`).join('')}</ol></details>
      <div>${button(t('newRun'),'plus',`data-scenario-run="${esc(item.id)}"`,'text')}</div>
    </article>`).join('')}</section>`;
}
function settings() {
  const current=state.editingModel??{};
  const defaultEndpoint=state.models.at(-1)?.endpoint||state.legacyEndpoint;
  const item=current.id;
  return header(t('connection'),t('connectionSubtitle'))+`<div class="settings-grid">
    <section class="panel settings-panel">
      <h2>${t(item?'editModel':'addModel')}</h2>
      <form id="model-form" class="stack">
        <label class="field"><span class="field-title">${t('endpoint')}</span><input class="input" name="endpoint" required type="url" value="${esc(current.endpoint||defaultEndpoint)}" placeholder="https://provider.example/v1" autocomplete="off" spellcheck="false"><small>${t('localHint')}</small></label>
        <label class="field"><span class="field-title">${t('apiKey')}</span><input class="input" name="key" type="password" placeholder="${current.hasKey?t('keySaved'):t('waitingKey')}" autocomplete="new-password"><small>${t('keyHint')}</small></label>
        <label class="remember"><input type="checkbox" name="rememberKey" ${current.rememberKey?'checked':''}>${t('rememberKey')}</label>
        <div class="field">
          <label class="field-title" for="model-id">${t('modelId')}</label>
          <div class="model-picker"><input id="model-id" class="input" name="model" list="model-suggestions" required maxlength="180" value="${esc(current.model||'')}" placeholder="provider/model-id" autocomplete="off" spellcheck="false">
          <button type="submit" name="intent" value="discover" class="btn" formnovalidate>${t('testConnection')}</button></div>
          <datalist id="model-suggestions"></datalist>
        </div>
        <label class="field"><span class="field-title">${t('modelLabel')}</span><input name="label" class="input" maxlength="100" value="${esc(current.label||'')}"></label>
        <p class="form-error" role="alert" hidden></p>
        <div class="hint" id="model-feedback" role="status"></div>
        <div class="settings-actions">
          <button type="submit" name="intent" value="save" class="btn primary">${icon(item?'check':'plus')}${t(item?'saveModel':'addModel')}</button>
          <button type="submit" name="intent" value="probe" class="btn">${icon('activity')}${t('probe')}</button>
          ${current.hasKey?`<button type="submit" name="intent" value="clear" class="btn">${t('removeKey')}</button>`:''}
          ${item?button(t('close'),'close','data-end-edit'):''}
        </div>
      </form>
    </section>
    <section class="panel models-panel">
      ${panelHeader(t('savedModels'))}
      ${state.models.length?`<ul class="saved-models">${state.models.map(model=>`<li class="saved-model">
        <div class="saved-model-name"><strong>${esc(model.label||model.model)}</strong>
          ${model.label?`<div>${esc(model.model)}</div>`:''}<div>${esc(model.endpoint)}</div>
          <span class="pill ${model.hasKey?'pass':''}">${t(model.rememberKey?'keyOnDisk':model.hasKey?'keyInMemory':'noKey')}</span>
        </div>
        <div class="settings-actions">${button(t('editModel'),'',
           `data-edit-model="${esc(model.id)}"`,'text')}${button(t('removeModel'),'',
           `data-remove-model="${esc(model.id)}"`,'text danger')}</div>
      </li>`).join('')}</ul>`:empty(t('noSavedModels'))}
    </section>
  </div>`;
}
function detail() {
  const run=state.detail;
  if(!run) return header(t('runDetails'),'')+`<section class="panel">${empty(state.detailError?errorText(state.detailError):'…')}</section>`;
  const pending=['queued','running'].includes(run.status);
  const s=run.summary;
  const item=run.cases.find(c=>c.idx===state.caseIndex)??run.cases[0];
  const chosen=sc(item?.scenario);
  const result=item?.result;
  const action=`<div class="page-actions"><a class="btn" href="/api/runs/${esc(run.id)}/export" download>${icon('download')}${t('export')}</a>${pending?button(t('cancel'),'close','data-cancel','danger'):button(t('reRun'),'plus','data-rerun','primary')}</div>`;
  return header(esc(modelName(run)),`${t('versions')} v${esc(run.config.version)} · ${date(run.created)} · ${t(run.mode)}`,action)+`
    <section class="panel detail-card"><h2>${t('evaluation')} ${status(run.status)} ${s.suitability?suitability(s.suitability):''}</h2>
      <div class="detail-metrics">${[
        [t('score'),score(s.score)], [t('coverage'),`${s.done}/${s.total}`], [t('passed'),`${s.passes}/${s.scored}`],
        [t('issues'),s.critical], [t('en'),score(s.langs.en.score)], [t('de'),score(s.langs.de.score)],
      ].map(([label,value])=>`<span class="pill">${label} · ${value}</span>`).join('')}</div>
      ${pending?`<div class="progress" role="progressbar" aria-label="${t('coverage')}" aria-valuenow="${s.done}" aria-valuemin="0" aria-valuemax="${s.total}"><i style="width:${100*s.done/s.total}%"></i></div>`:''}
      ${run.failure?`<p class="form-error">${esc(errorText(run.failure.code,run.failure.detail))}</p>${link(t('editConnection'),'#connection')}`:''}
      ${run.status==='partial'||run.status==='failed'?`<p>${t('noComplete')}</p>`:''}</section>
    <div class="detail-grid" style="margin-top:16px">
      <section class="panel">${panelHeader(t('cases'))}<div class="case-list">${run.cases.map(entry=>`<button type="button" class="case-button" data-case="${entry.idx}" aria-pressed="${entry.idx===item?.idx}"><span><small>${esc(entry.lang.toUpperCase())}</small>${esc(loc(sc(entry.scenario)?.title) || entry.scenario)}</span>${entry.result?.overall==null?status(entry.status):`<span class="pill ${entry.result.passed?'pass':'warn'}">${entry.result.overall}</span>`}</button>`).join('')}</div></section>
      <section class="panel detail-card" aria-live="polite">
        <h2>${esc(loc(chosen?.title) || item?.scenario)} · ${t(item?.lang)}</h2>
        <p>${esc(chosen?.task[item?.lang]??'')}</p>
        ${result?resultView(result):`<p>${t('noResult')}</p>`}
        <div class="detail-block"><h3>${t('trace')}</h3>${traceView()}</div>
      </section>
    </div>`;
}
function resultView(r) {
  const reason=t('endReasons')[r.endReason]??r.endReason;
  return `<div class="detail-block"><h3>${t('result')} · ${esc(reason)}</h3>
    ${r.code?`<p class="form-error">${esc(errorText(r.code,r.detail))}</p>`:''}
    <div class="detail-metrics">${[[t('workflow'),score(r.workflowScore)],[t('languageScore'),score(r.languageScore)],[t('toolCalls'),r.calls??'—'],[t('token'),num(r.tokens)],[t('duration'),elapsed(r.durationMs)]].map(([label,value])=>`<span class="pill">${label} · ${value}</span>`).join('')}</div>
    ${r.checks?`<ul class="breakdown">${r.checks.map(check=>`<li class="${check.passed?'met':'miss'}">${icon(check.passed?'check':'close')}<span>${esc(loc(check.label))}${check.critical?` · <strong>${t('critical')}</strong>`:''}</span><span>${check.passed?check.weight:0}/${check.weight}</span></li>`).join('')}</ul><p>${t('languageHeuristic')}</p>`:''}
    <h3 style="margin-top:14px">${t('finalReply')}</h3><p class="reply">${esc(r.reply||t('missingReply'))}</p>
  </div>`;
}
function traceView() {
  if(!state.trace.length) return `<p>${t('noTrace')}</p>`;
  return state.trace.map(({id,type,name,minute,time,...data})=>`<details class="trace-entry" data-event="${id}"><summary><time>${new Date(time).toLocaleTimeString(uiLocale())}</time> · ${esc(t('events')[type]??type)}${name?' · '+esc(name):''}${minute!=null?' · t='+minute:''}</summary>
  <pre>${esc(JSON.stringify(data,null,2))}</pre></details>`).join('');
}
let runForm={};
function openRun(prefill={}) {
  if(!state.models.length) { location.hash='#connection'; return; }
  runForm={modelIds:[state.models[0].id],scenarios:state.catalog.map(s=>s.id),languages:['en','de'],maxTurns:20,repeats:1,...prefill};
  renderDialog();
  if(!dialog.open) dialog.showModal();
}
const option=(name,value,label,selected)=>`<label class="option"><input type="checkbox" name="${name}" value="${esc(value)}" ${selected?'checked':''}>${esc(label)}</label>`;
function renderDialog() {
  const r=runForm;
  dialog.setAttribute('aria-labelledby','dialog-title');
  dialog.innerHTML=`<form id="benchmark-form"><div class="dialog-head"><h2 id="dialog-title">${t('configure')}</h2><button class="btn" type="button" data-close aria-label="${t('close')}">${icon('close')}</button></div>
  <div class="dialog-body">
    <p class="hint">${t('configureText')}</p>
    <div class="field"><span class="field-title">${t('savedModels')}</span><div class="check-grid">
      ${state.models.map(model=>option('modelId',model.id,`${model.label||model.model} · ${new URL(model.endpoint).host}`,r.modelIds.includes(model.id))).join('')}
    </div><small>${t('serialHint')}</small></div>
    <div class="field"><span class="field-title">${t('languageSelection')}</span><div class="form-options">${['en','de'].map(l=>option('language',l,t(l),r.languages.includes(l))).join('')}</div></div>
    <div class="field"><span class="field-title">${t('scenarioSelection')}</span><div class="check-grid">${state.catalog.map(s=>option('scenario',s.id,loc(s.title),r.scenarios.includes(s.id))).join('')}</div></div>
    <div class="two-col">
      <label class="field"><span class="field-title">${t('maxTurns')}</span><input name="maxTurns" class="input" type="number" min="4" max="40" required value="${Number(r.maxTurns)}"></label>
      <label class="field"><span class="field-title">${t('repeat')}</span><input name="repeats" class="input" type="number" min="1" max="3" required value="${Number(r.repeats)}"></label>
    </div><p class="form-error" role="alert" hidden></p>
  </div><div class="dialog-foot">${button(t('close'),'','data-close')}<button class="btn primary" type="submit">${icon('activity')}${t('startRun')}</button></div></form>`;
}
function benchmarkRequest(form) {
  const f=new FormData(form);
  return {modelIds:f.getAll('modelId'),scenarios:f.getAll('scenario'),languages:f.getAll('language'),maxTurns:Number(f.get('maxTurns')),repeats:Number(f.get('repeats'))};
}
let toastTimer;
function toast(message) {
  const node=document.querySelector('#toast');
  node.textContent=message;
  node.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{node.hidden=true;},4300);
}
function showError(form,error) {
  const output=form.querySelector('.form-error');
  output.textContent=errorText(error.message,error.detail);
  output.hidden=false;
}
function render() {
  const {name,value}=route();
  const openTrace=[...main.querySelectorAll('[data-event][open]')].map(el=>el.dataset.event);
  main.innerHTML={dashboard,runs,compare,scenarios:scenariosView,connection:settings,run:detail}[name](value);
  for(const event of openTrace) main.querySelector(`[data-event="${event}"]`)?.setAttribute('open','');
}
let runsHash='', detailVersion='', refreshing=false;
async function refresh(force=false) {
  if(refreshing) return;
  refreshing=true;
  const initial=route();
  const initialCase=state.caseIndex;
  try {
    const info=await api('runs');
    const key=JSON.stringify(info.runs);
    const changed=runsHash!==key;
    runsHash=key;
    state.runs=info.runs.filter(run=>run.mode==='live');
    state.online=true;
    state.running=info.running||info.queued>0;
    worker();
    const current=route();
    if(current.name==='run' && initial.name==='run' && initial.value===current.value && current.value) {
      const id=current.value;
      const index=state.caseIndex;
      try {
        const [r,events]=await Promise.all([api('runs/'+encodeURIComponent(id)),api('runs/'+encodeURIComponent(id)+'/events?case='+index).catch(e=>{if(e.message==='not_found')return [];throw e;})]);
        if(route().value!==id || state.caseIndex!==index) return;
        const version=JSON.stringify([r,events]);
        state.detail=r;
        state.trace=events;
        state.detailError='';
        if(force||detailVersion!==version) {detailVersion=version;render();}
      } catch(error) {
        if(route().value!==id || state.caseIndex!==index) return;
        state.detailError=error.message;
        if(!state.detail) render();
      }
    } else if((changed||force) && ['dashboard','runs','compare'].includes(current.name)) render();
  } catch {
    state.online=false;
    worker();
  } finally {
    refreshing=false;
    if(initial.name!==route().name || initial.value!==route().value || initialCase!==state.caseIndex) setTimeout(()=>refresh(true),0);
  }
}
function navigate() {
  state.detail=null;
  state.trace=[];
  state.detailError='';
  state.caseIndex=0;
  detailVersion='';
  shell();
  render();
  const {name,value}=route();
  if(name==='scenarios' && value) document.getElementById('scenario-'+value)?.scrollIntoView({block:'nearest'});
  else window.scrollTo(0,0);
  refresh(true);
}
window.addEventListener('hashchange',navigate);
document.addEventListener('click',async event=>{
  const el=event.target.closest('button');
  if(!el) return;
  if(el.dataset.uiLang) {
    state.lang=el.dataset.uiLang;
    localStorage.setItem('agentbench-lang',state.lang);
    shell();
    render();
    document.querySelector(`[data-ui-lang="${state.lang}"]`)?.focus();
  }
  if(el.hasAttribute('data-new-run')) openRun();
  if(el.dataset.scenarioRun) openRun({scenarios:[el.dataset.scenarioRun]});
  if(el.hasAttribute('data-close')) dialog.close();
  if(el.dataset.case!==undefined) {
    state.caseIndex=Number(el.dataset.case); state.trace=[]; render();
    main.querySelector(`[data-case="${state.caseIndex}"]`)?.focus();
    refresh(true);
  }
  if(el.hasAttribute('data-rerun') && state.detail) {
    const {model,config}=state.detail;
    const saved=state.models.find(m=>m.id===config.modelId || (m.model===model && m.endpoint===config.endpoint));
    openRun({...config,modelIds:saved?[saved.id]:[]});
  }
  if(el.dataset.editModel || el.hasAttribute('data-end-edit')) {
    state.editingModel=state.models.find(model=>model.id===el.dataset.editModel)??null;
    render();
    main.querySelector('[name="endpoint"]')?.focus();
  }
  if(el.dataset.removeModel) {
    try {
      await api('models/remove',{id:el.dataset.removeModel});
      state.models=state.models.filter(model=>model.id!==el.dataset.removeModel);
      if(state.editingModel?.id===el.dataset.removeModel) state.editingModel=null;
      render();
      toast(t('modelRemoved'));
    } catch(error) { toast(errorText(error.message,error.detail)); }
  }
  if(el.hasAttribute('data-cancel') && state.detail) {
    el.disabled=true;
    try { await api('runs/'+state.detail.id+'/cancel',{}); toast(t('cancelledNotice')); }
    catch(error) { toast(errorText(error.message)); }
    finally { el.disabled=false; refresh(true); }
  }
});
dialog.addEventListener('close',()=>{runForm={};dialog.innerHTML='';});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.filter){ state[el.dataset.filter]=el.value; render(); document.querySelector(`[data-filter="${el.dataset.filter}"]`)?.focus(); }
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['model-form','benchmark-form'].includes(form.id)) return;
  event.preventDefault();
  const submit=event.submitter;
  if(submit) submit.disabled=true;
  form.querySelector('.form-error').hidden=true;
  try {
    if(form.id==='model-form') {
      const f=new FormData(form);
      const key=f.get('key').trim();
      const id=state.editingModel?.id;
      const config={...(id?{id}:{}),endpoint:f.get('endpoint').trim(),
        model:f.get('model').trim(),label:f.get('label').trim(),...(key?{key}:{})};
      const intent=submit?.value??'save';
      const output=form.querySelector('#model-feedback');
      output.textContent='';
      if(intent==='discover') {
        const {models}=await api('models/discover',config);
        form.querySelector('datalist').innerHTML=models.map(model=>`<option value="${esc(model)}"></option>`).join('');
        if(models.length===1 && !config.model) form.elements.model.value=models[0];
        output.textContent=models.length?`${models.length} ${t('modelsFound')}`:t('noModels');
        form.elements.model.focus();
      } else if(intent==='probe') {
        output.textContent=t('probing');
        await api('models/probe',config);
        output.textContent=t('probeOk');
      } else {
        const saved=await api('models',{...config,rememberKey:intent!=='clear' && f.has('rememberKey'),
          ...(intent==='clear'?{key:''}:{})});
        if(id) state.models=state.models.map(model=>model.id===id?saved:model);
        else state.models.push(saved);
        state.editingModel=null;
        render();
        toast(t('modelSaved'));
      }
    } else {
      const result=await api('runs',benchmarkRequest(form));
      dialog.close();
      toast(t('runCreated'));
      if(result.ids.length===1) {
        const hash='#run/'+result.ids[0];
        if(location.hash===hash) refresh(true);
        else location.hash=hash;
      } else if(route().name==='runs') refresh(true);
      else location.hash='#runs';
    }
  } catch(error) {
    const feedback=form.querySelector('#model-feedback');
    if(feedback) feedback.textContent='';
    showError(form,error);
  }
  finally { if(submit) submit.disabled=false; }
});
shell();
main.innerHTML=empty('…');
try {
  const [catalog,models]=await Promise.all([api('catalog'),api('models')]);
  state.catalog=catalog.scenarios;
  state.version=catalog.version;
  state.models=models.models;
  state.legacyEndpoint=models.legacyEndpoint;
  navigate();
} catch(error) {
  main.innerHTML=empty(esc(errorText(error.message)));
}
setInterval(()=>refresh(),2700);
