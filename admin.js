// HR Admin setup, bill collections, overall analysis.
const DEF={...window.DPPL_CONFIG};const ROLES=[['hr_admin','HR Admin'],['md','MD'],['ceo','CEO'],['marketing','Marketing'],['costing','Costing'],['factory_manager','Factory'],['planning','Planning'],['dispatch','Dispatch']];
const SETKEYS=['MIN_NEW_CUSTOMER_VISITS_PER_MONTH','MIN_NEW_CUSTOMERS_PER_3_MONTHS','AT_RISK_DAYS_LEFT','MIN_VISITS_PER_DAY','SKIP_SUNDAYS','HOLIDAYS','VISIT_PURPOSES','MARGIN_MIN_PCT'];
function settingsRow(){return (D.settings||[])[0]}
window.applySettings=()=>{const s=settingsRow();Object.assign(CF,DEF);if(s)SETKEYS.forEach(k=>{if(s[k.toLowerCase()]!=null&&s[k.toLowerCase()]!=='')CF[k]=s[k.toLowerCase()]});if(typeof CF.HOLIDAYS==='string')CF.HOLIDAYS=CF.HOLIDAYS.split(/[\s,]+/).filter(Boolean);if(typeof CF.VISIT_PURPOSES==='string')CF.VISIT_PURPOSES=CF.VISIT_PURPOSES.split('\n').map(x=>x.trim()).filter(Boolean);CF.SKIP_SUNDAYS=CF.SKIP_SUNDAYS===true||CF.SKIP_SUNDAYS==='true';window.DPPL_CONFIG.MARGIN_MIN_PCT=+CF.MARGIN_MIN_PCT};
const isWork=d=>!((CF.SKIP_SUNDAYS&&d.getDay()===0)||(CF.HOLIDAYS||[]).includes(ymd(d)));
window.workToday=()=>isWork(new Date());window.prevWorkDay=()=>{let d=new Date(Date.now()-864e5);for(let i=0;i<14&&!isWork(d);i++)d=new Date(d-864e5);return ymd(d)};
const qOf=m=>m.slice(0,4)+'-Q'+(Math.floor((+m.slice(5,7)-1)/3)+1);
window.tgt=(x,month,k)=>{const r=(D.targets||[]).find(t=>t.exec_id===x&&t.period===month)||null;return r&&r[k]!==''&&r[k]!=null?+r[k]:null};
window.extraTabs=()=>[...(can(U,'coll')?[['coll','Collections']]:[]),...(can(U,'admin_view')?[['ana','Analysis'],['setup','Setup']]:[])];
const RO=()=>can(U,'admin')?'':'disabled';
const marketingExecs=()=>[...new Set((D.profiles||[]).filter(p=>p.role==='marketing'&&p.active!==false).map(p=>p.id).concat(execs()))];
// ----- Setup
let stab='users';
function setupV(){const ro=RO(),T=[['users','Users & employees'],['targets','Targets'],['visit','Visit settings']];
 return `${ro?'<p class="warn">View only — HR Admin manages setup.</p>':''}<div class="card">${T.map(([k,l])=>`<button class="${stab===k?'':'lt'}" data-st="${k}">${l}</button> `).join('')}</div>${{users:usersV,targets:targetsV,visit:visitSetV}[stab](ro)}`}
function usersV(ro){const F=['email','full_name','role','emp_code','mobile','territory','reporting_manager','active'];
 return `<div class="card tw"><h2>Users & employees</h2>${DB.mode==='Supabase'?'<p class="warn">New logins are created in the Supabase dashboard (Authentication → Add user / Invite). They appear here automatically; then set role and details.</p>':'<p><small>Demo mode: set a demo password for users you add here.</small></p>'}
 <table><tr><th>Email</th><th>Name</th><th>Role</th><th>Emp code</th><th>Mobile</th><th>Territory</th><th>Reports to</th><th>Active</th>${DB.mode!=='Supabase'?'<th>Demo pw</th>':''}<th></th></tr>
 ${(D.profiles||[]).map(p=>`<tr data-pr="${p.id}"><td><input name="email" value="${esc(p.email)}" ${DB.mode==='Supabase'?'disabled':ro}></td><td><input name="full_name" value="${esc(p.full_name)}" ${ro}></td>
 <td><select name="role" ${ro}>${ROLES.map(([k,l])=>`<option value="${k}" ${p.role===k?'selected':''}>${l}</option>`).join('')}</select></td>${['emp_code','mobile','territory'].map(k=>`<td><input name="${k}" value="${esc(p[k])}" ${ro}></td>`).join('')}
 <td><select name="reporting_manager" ${ro}><option value="">—</option>${(D.profiles||[]).filter(q=>q.id!==p.id).map(q=>`<option value="${q.id}" ${p.reporting_manager===q.id?'selected':''}>${esc(q.full_name||q.email)}</option>`).join('')}</select></td><td><select name="active" ${ro}><option value="true" ${p.active!==false?'selected':''}>Active</option><option value="false" ${p.active===false?'selected':''}>Deactivated</option></select></td>${DB.mode!=='Supabase'?`<td><input name="demo_pw" type="password" placeholder="${p.demo_pw?'set':''}" ${ro}></td>`:''}<td>${ro?'':`<button class="sec" data-psv="${p.id}">Save</button>`}</td></tr>`).join('')}</table>
 ${ro||DB.mode==='Supabase'?'':'<button id="addu">Add user</button>'}</div>`}
function targetsV(ro){const K=[['sales_value','Sales ₹'],['qty','Qty'],['new_customers','New customers'],['new_cust_visits','New-cust visits'],['collections','Collections ₹']];
 return `<div class="card tw"><h2>Targets</h2><p><small>Period = month (YYYY-MM) or quarter (YYYY-Q1..Q4). A monthly "New-cust visits" target overrides the default discipline rule for that executive.</small></p>
 <table><tr><th>Executive</th><th>Period</th>${K.map(k=>`<th>${k[1]}</th>`).join('')}<th></th></tr>${(D.targets||[]).map(t=>`<tr data-tg="${t.id}"><td><select name="exec_id" ${ro}>${marketingExecs().map(x=>`<option value="${esc(x)}" ${t.exec_id===x?'selected':''}>${esc(pname(x))}</option>`).join('')}</select></td><td><input name="period" value="${esc(t.period)}" ${ro}></td>${K.map(([k])=>`<td><input type="number" name="${k}" value="${esc(t[k])}" ${ro}></td>`).join('')}<td>${ro?'':`<button class="sec" data-tsv="${t.id}">Save</button><button class="lt" data-tdl="${t.id}">Delete</button>`}</td></tr>`).join('')}</table>
 ${ro?'':'<button id="addt">Add target row</button>'}</div>`}
function visitSetV(ro){const s=CF;return `<div class="card"><h2>Visit & discipline settings</h2><p><small>Defaults come from config.js until saved here.</small></p><form id="vs" class="grid">
 <div><label>Min new-customer visits / month</label><input type="number" name="min_new_customer_visits_per_month" value="${s.MIN_NEW_CUSTOMER_VISITS_PER_MONTH}" ${ro}></div>
 <div><label>Min new customers / rolling 3 months</label><input type="number" name="min_new_customers_per_3_months" value="${s.MIN_NEW_CUSTOMERS_PER_3_MONTHS}" ${ro}></div>
 <div><label>Min visits per working day</label><input type="number" name="min_visits_per_day" value="${s.MIN_VISITS_PER_DAY}" ${ro}></div>
 <div><label>"At risk" warning days</label><input type="number" name="at_risk_days_left" value="${s.AT_RISK_DAYS_LEFT}" ${ro}></div>
 <div><label>Quote margin limit %</label><input type="number" name="margin_min_pct" value="${s.MARGIN_MIN_PCT}" ${ro}></div>
 <div><label>Skip Sundays</label><select name="skip_sundays" ${ro}><option value="true" ${s.SKIP_SUNDAYS?'selected':''}>Yes</option><option value="false" ${s.SKIP_SUNDAYS?'':'selected'}>No</option></select></div>
 <div><label>Holidays (YYYY-MM-DD, comma separated)</label><textarea name="holidays" ${ro}>${esc((s.HOLIDAYS||[]).join(', '))}</textarea></div>
 <div><label>Visit purposes / types (one per line)</label><textarea name="visit_purposes" rows="6" ${ro}>${esc((s.VISIT_PURPOSES||[]).join('\n'))}</textarea></div>
 ${ro?'':'<div><button>Save settings</button></div>'}</form></div>`}
const num=v=>v===''?null:+v;
window.bind_setup=()=>{const go=async()=>{await load();render()};document.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{stab=b.dataset.st;render()});if(!can(U,'admin'))return;
 const rowv=tr=>{const v={};tr.querySelectorAll('input,select').forEach(i=>{if(!i.disabled&&!(i.name==='demo_pw'&&!i.value))v[i.name]=i.value});return v};
 document.querySelectorAll('[data-psv]').forEach(b=>b.onclick=async()=>{const v=rowv(b.closest('tr'));v.active=v.active==='true';if(v.email)v.email=v.email.toLowerCase();await DB.update('profiles',b.dataset.psv,v);delete v.demo_pw;await audit('update','profiles',b.dataset.psv,v);go()});
 const au=$('#addu');if(au)au.onclick=async()=>{await DB.insert('profiles',{email:'new.user@dppl.demo',full_name:'New user',role:'marketing',active:true});go()};
 const at=$('#addt');if(at)at.onclick=async()=>{await DB.insert('targets',{exec_id:marketingExecs()[0]||'',period:today().slice(0,7)});go()};
 document.querySelectorAll('[data-tsv]').forEach(b=>b.onclick=async()=>{const v=rowv(b.closest('tr'));['sales_value','qty','new_customers','new_cust_visits','collections'].forEach(k=>v[k]=num(v[k]));await DB.update('targets',b.dataset.tsv,v);await audit('update','targets',b.dataset.tsv,v);go()});
 document.querySelectorAll('[data-tdl]').forEach(b=>b.onclick=async()=>{await DB.remove('targets',b.dataset.tdl);await audit('delete','targets',b.dataset.tdl);go()});
 const vs=$('#vs');if(vs)vs.onsubmit=async e=>{e.preventDefault();const v=fv(vs);['min_new_customer_visits_per_month','min_new_customers_per_3_months','min_visits_per_day','at_risk_days_left','margin_min_pct'].forEach(k=>v[k]=num(v[k]));
  v.skip_sundays=v.skip_sundays==='true';v.holidays=v.holidays.split(/[\s,]+/).filter(Boolean);v.visit_purposes=v.visit_purposes.split('\n').map(x=>x.trim()).filter(Boolean);
  const s=settingsRow();s?await DB.update('settings',s.id,v):await DB.insert('settings',v);await audit('update','settings',null,v);go()}};
// ----- Collections
const paid=i=>(D.collections||[]).filter(c=>c.invoice_id===i.id).reduce((a,c)=>a+ +c.amount,0);
const outst=i=>Math.max(0,+i.amount-paid(i));const odDays=i=>Math.floor((Date.now()-new Date(i.due_date))/864e5);
const bucket=i=>{const d=odDays(i);return d<=0?'Not due':d<=30?'1-30':d<=60?'31-60':d<=90?'61-90':'90+'};const BK=['Not due','1-30','31-60','61-90','90+'];
const myInv=()=>(D.invoices||[]).filter(i=>can(U,'admin_view')||i.exec_id===U.id);
let invSel=null;
function collV(){const I=myInv(),adm=can(U,'admin');
 return `<div class="card tw"><h2>Outstanding ageing</h2><table><tr>${BK.map(b=>`<th>${b}</th>`).join('')}<th>Total</th></tr><tr>${BK.map(b=>`<td>${inr(I.filter(i=>bucket(i)===b).reduce((a,i)=>a+outst(i),0))}</td>`).join('')}<td><b>${inr(I.reduce((a,i)=>a+outst(i),0))}</b></td></tr></table></div>
 ${adm?`<div class="card"><h2>Add invoice</h2><form id="if" class="grid"><div><label>Invoice no*</label><input name="invoice_no" required></div><div><label>Customer*</label><select name="customer_id">${D.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
 <div><label>Amount ₹*</label><input type="number" name="amount" required></div><div><label>Invoice date</label><input type="date" name="invoice_date" value="${today()}"></div><div><label>Due date*</label><input type="date" name="due_date" required></div>
 <div><label>Responsible executive*</label><select name="exec_id">${marketingExecs().map(x=>`<option value="${esc(x)}">${esc(pname(x))}</option>`).join('')}</select></div><div><button>Save invoice</button></div></form></div>`:''}
 <div class="card tw"><h2>Invoices</h2><table><tr><th>Invoice</th><th>Customer</th><th>Exec</th><th>Amount</th><th>Collected</th><th>Outstanding</th><th>Due</th><th>Promised</th><th>Ageing</th></tr>
 ${I.map(i=>`<tr><td><a href="#" data-inv="${i.id}">${esc(i.invoice_no)}</a></td><td>${esc(cname(i.customer_id))}</td><td>${esc(pname(i.exec_id))}</td><td>${inr(i.amount)}</td><td>${inr(paid(i))}</td><td>${inr(outst(i))}</td><td class="${outst(i)&&odDays(i)>0?'bad':''}">${fd(i.due_date)}</td><td>${fd(i.promised_date)}</td><td>${outst(i)?bucket(i):'Paid'}</td></tr>`).join('')}</table></div>
 ${invSel?invDetail(I.find(i=>i.id===invSel)):''}`}
function invDetail(i){if(!i)return'';const ed=can(U,'admin')||i.exec_id===U.id&&can(U,'coll');const C=(D.collections||[]).filter(c=>c.invoice_id===i.id),F=(D.invoice_followups||[]).filter(f=>f.invoice_id===i.id);
 return `<div class="card"><h2>${esc(i.invoice_no)} — ${esc(cname(i.customer_id))}</h2><p>Outstanding <b>${inr(outst(i))}</b> · due ${fd(i.due_date)}</p>
 ${ed?`<form id="cf2" class="grid"><div><label>Collected ₹*</label><input type="number" name="amount" required></div><div><label>Date*</label><input type="date" name="date" value="${today()}" required></div><div><label>Mode / ref</label><input name="ref"></div><div><button>Record collection</button></div></form>
 <form id="ff" class="grid"><div><label>Follow-up notes*</label><input name="notes" required></div><div><label>Promised payment date</label><input type="date" name="promised_date"></div><div><button class="sec">Log follow-up</button></div></form>`:''}
 <b>Collections</b><table>${C.map(c=>`<tr><td>${fd(c.date)}</td><td>${inr(c.amount)}</td><td>${esc(c.ref)}</td><td>${esc(pname(c.by_id))}</td></tr>`).join('')||'<tr><td>None</td></tr>'}</table>
 <b>Follow-ups</b><table>${F.map(f=>`<tr><td>${fd(f.created_at)}</td><td>${esc(f.notes)}</td><td>${fd(f.promised_date)}</td><td>${esc(pname(f.by_id))}</td></tr>`).join('')||'<tr><td>None</td></tr>'}</table></div>`}
window.bind_coll=()=>{const go=async()=>{await load();render()};document.querySelectorAll('[data-inv]').forEach(a=>a.onclick=e=>{e.preventDefault();invSel=a.dataset.inv;render()});
 const f=$('#if');if(f)f.onsubmit=async e=>{e.preventDefault();const v=fv(f);v.amount=+v.amount;const r=await DB.insert('invoices',v);await audit('insert','invoices',r.id,v);go()};
 const c=$('#cf2');if(c)c.onsubmit=async e=>{e.preventDefault();const v=fv(c);v.amount=+v.amount;v.invoice_id=invSel;v.by_id=U.id;const r=await DB.insert('collections',v);await audit('insert','collections',r.id,v);go()};
 const ff=$('#ff');if(ff)ff.onsubmit=async e=>{e.preventDefault();const v=fv(ff);v.invoice_id=invSel;v.by_id=U.id;const r=await DB.insert('invoice_followups',v);if(v.promised_date)await DB.update('invoices',invSel,{promised_date:v.promised_date});await audit('insert','invoice_followups',r.id,v);go()}};
// ----- Analysis
let af={period:today().slice(0,7),exec_id:''};
function inPer(d){if(!d)return false;d=String(d).slice(0,7);return af.period.includes('Q')?qOf(d)===af.period:d===af.period}
function anaV(){const E=marketingExecs().filter(x=>!af.exec_id||x===af.exec_id);const pct=(a,t)=>t?`${Math.round(a/t*100)}%`:'—';
 const tsum=(x,k)=>{const r=(D.targets||[]).filter(t=>t.exec_id===x&&t.period===af.period);const v=r.filter(t=>t[k]!=null&&t[k]!=='');return v.length?v.reduce((a,t)=>a+ +t[k],0):null};
 const rows=E.map(x=>{const won=D.enquiries.filter(e=>e.owner_id===x&&e.stage==='Won'&&inPer(e.updated_at||e.created_at));
  return {x,sales:won.reduce((a,e)=>a+ +e.value,0),qty:won.reduce((a,e)=>a+(+e.qty||0),0),nc:D.customers.filter(c=>c.created_by===x&&inPer(c.created_at)).length,
  ncv:D.visits.filter(v=>v.by_id===x&&v.customer_type==='New'&&inPer(v.date)).length,vis:D.visits.filter(v=>v.by_id===x&&inPer(v.date)).length,
  col:(D.collections||[]).filter(c=>inPer(c.date)&&(D.invoices||[]).some(i=>i.id===c.invoice_id&&i.exec_id===x)).reduce((a,c)=>a+ +c.amount,0)}});
 const cell=(a,t,m)=>`<td>${m?inr(a):a} / ${t==null?'—':(m?inr(t):t)} <small>${pct(a,t)}</small></td>`;
 const I=(D.invoices||[]).filter(i=>!af.exec_id||i.exec_id===af.exec_id),W=wonDeals().filter(w=>!af.exec_id||w.e.owner_id===af.exec_id),open=D.enquiries.filter(e=>!['Won','Lost'].includes(e.stage)&&(!af.exec_id||e.owner_id===af.exec_id));
 const pers=[...new Set([today().slice(0,7),qOf(today().slice(0,7)),...(D.targets||[]).map(t=>t.period),...D.visits.map(v=>(v.date||'').slice(0,7))])].sort().reverse();
 return `<div class="card grid"><div><label>Period</label><select id="ap">${pers.map(p=>`<option ${af.period===p?'selected':''}>${p}</option>`).join('')}</select></div><div><label>Executive</label><select id="ax"><option value="">All</option>${marketingExecs().map(x=>`<option value="${esc(x)}" ${af.exec_id===x?'selected':''}>${esc(pname(x))}</option>`).join('')}</select></div></div>
 <div class="card tw"><h2>Target vs achievement — ${esc(af.period)}</h2><table><tr><th>Executive</th><th>Sales (won)</th><th>Qty</th><th>New customers</th><th>New-cust visits</th><th>All visits</th><th>Collections</th></tr>
 ${rows.map(r=>`<tr><td>${esc(pname(r.x))}</td>${cell(r.sales,tsum(r.x,'sales_value'),1)}${cell(r.qty,tsum(r.x,'qty'))}${cell(r.nc,tsum(r.x,'new_customers'))}${cell(r.ncv,tsum(r.x,'new_cust_visits'))}<td>${r.vis}</td>${cell(r.col,tsum(r.x,'collections'),1)}</tr>`).join('')}</table><small>Shown as achieved / target.</small></div>
 <div class="grid"><div class="card">Open pipeline<div class="kpi">${inr(open.reduce((a,e)=>a+ +e.value,0))}</div><small>${STAGES.map(s=>`${s}: ${open.filter(e=>e.stage===s).length}`).filter(s=>!s.endsWith(' 0')).join(' · ')}</small></div>
 <div class="card">Outstanding<div class="kpi">${inr(I.reduce((a,i)=>a+outst(i),0))}</div><small>${BK.map(b=>`${b}: ${inr(I.filter(i=>bucket(i)===b).reduce((a,i)=>a+outst(i),0))}`).join(' · ')}</small></div>
 <div class="card">Incentive earned (all won)<div class="kpi">${inr(Math.round(W.reduce((a,w)=>a+w.inc,0)))}</div><small>${[...new Set(W.map(w=>w.e.owner_id))].map(o=>`${esc(pname(o))}: ${inr(Math.round(W.filter(w=>w.e.owner_id===o).reduce((a,w)=>a+w.inc,0)))}`).join(' · ')||'No won deals'}</small></div></div>`}
window.bind_ana=()=>{$('#ap').onchange=e=>{af.period=e.target.value;render()};$('#ax').onchange=e=>{af.exec_id=e.target.value;render()}};
window.VIEWS={setup:setupV,coll:collV,ana:anaV};
(async()=>{try{U=await DB.user()}catch(e){return loginPage(e.message)}U?start():loginPage()})();
