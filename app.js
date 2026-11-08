const $=s=>document.querySelector(s),A=document.getElementById('app');
const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=n=>'₹'+Number(n||0).toLocaleString('en-IN');const today=()=>new Date().toISOString().slice(0,10);
const fd=d=>d?new Date(d).toLocaleDateString('en-GB'):'';
const STAGES=['New','Specification','Feasibility','Costing','Quotation','Negotiation','Won','Lost'];
let U=null,D={},view='dash',sel=null,filt={};
async function load(){for(const t of ['customers','enquiries','specs','costings','quotations','activities','tasks','audit_log'])D[t]=await DB.list(t);D.loadedAt=new Date()}
const cname=id=>(D.customers.find(c=>c.id===id)||{}).name||'';
const fv=f=>Object.fromEntries(new FormData(f));
function loginPage(msg){A.innerHTML=`<div class="auth"><img src="assets/dppl_company_logo.png" alt="DPPL - Devendran Plastic Pvt. Ltd."><h2>Sales & Order Tracker</h2>
<form id="lf"><label>Email</label><input name="email" type="email" required><label>Password</label><input name="pw" type="password" required><button style="width:100%">Sign in</button></form>
${msg?`<p class="bad">${esc(msg)}</p>`:''}<p><small>Mode: ${DB.mode}</small></p>
${DB.mode!=='Supabase'?`<div class="card" style="text-align:left;font-size:13px"><b>Demo accounts</b><table>${DEMO_USERS.map(u=>`<tr><td>${u.role}</td><td>${u.email}</td><td>${u.pw}</td></tr>`).join('')}</table></div>`:''}</div>`;
$('#lf').onsubmit=async e=>{e.preventDefault();const f=fv(e.target);try{U=await DB.login(f.email,f.pw);await audit('login','auth',null);start()}catch(x){loginPage(x.message)}}}
function outPage(){A.innerHTML=`<div class="auth"><img src="assets/bala_hr_logo.png" alt="Bala HR" style="max-width:240px"><h2>You have signed out</h2><p>Thank you for using the DPPL Sales & Order Tracker.</p><button onclick="loginPage()">Sign in again</button></div>`}
window.loginPage=loginPage;
async function start(){await load();render()}
function shell(body){const tabs=[['dash','Dashboard'],['tasks','Tasks'],['enq','Enquiries'],['cust','Customers'],...(can(U,'full')?[['audit','Audit log']]:[])];
A.innerHTML=`<header><img src="assets/dppl_company_logo.png" alt="DPPL"><b style="color:var(--navy)">Sales & Order Tracker</b><span class="sp"></span><small>${esc(U.name)} · ${U.role} · ${DB.mode}${can(U,'edit')?'':' · view only'}</small><button class="lt" id="lo">Logout</button></header>
<nav>${tabs.map(([k,l])=>`<a href="#" data-v="${k}" class="${view===k?'on':''}">${l}</a>`).join('')}</nav><main>${body}<p><small>Last updated: ${D.loadedAt.toLocaleString('en-GB')}</small></p></main>`;
document.querySelectorAll('nav a').forEach(a=>a.onclick=e=>{e.preventDefault();view=a.dataset.v;sel=null;render()});
$('#lo').onclick=async()=>{await audit('logout','auth',null);await DB.logout();U=null;outPage()}}
const visible=()=>D.enquiries.filter(e=>U.role!=='marketing'||true); // marketing sees own + team (whole marketing team)
function render(){const fn={dash,tasks,enq,cust,audit:auditV,detail}[view];shell(fn());(window['bind_'+view]||(()=>{}))()}
// Dashboard
function dash(){let E=visible();const ex=[...new Set(D.enquiries.map(e=>e.owner))],cs=D.customers,ms=[...new Set(D.enquiries.map(e=>(e.created_at||'').slice(0,7)))];
 if(filt.owner)E=E.filter(e=>e.owner===filt.owner);if(filt.cust)E=E.filter(e=>e.customer_id===filt.cust);if(filt.month)E=E.filter(e=>(e.created_at||'').startsWith(filt.month));
 const open=E.filter(e=>!['Won','Lost'].includes(e.stage)),age=e=>Math.floor((Date.now()-new Date(e.created_at))/864e5);
 const od=open.filter(e=>e.due_date&&e.due_date<today()),dt=open.filter(e=>e.due_date===today());
 const Q=D.quotations.filter(q=>E.some(e=>e.id===q.enquiry_id));const pend=Q.filter(q=>q.needs_approval&&!q.approved);
 const mx=Math.max(1,...STAGES.map(s=>open.filter(e=>e.stage===s).reduce((a,e)=>a+ +e.value,0)));
 return `<div class="card grid"><div><label>Executive</label><select id="fo"><option value="">All</option>${ex.map(x=>`<option ${filt.owner===x?'selected':''}>${esc(x)}</option>`)}</select></div>
 <div><label>Customer</label><select id="fc"><option value="">All</option>${cs.map(c=>`<option value="${c.id}" ${filt.cust===c.id?'selected':''}>${esc(c.name)}</option>`)}</select></div>
 <div><label>Month</label><select id="fm"><option value="">All</option>${ms.map(m=>`<option ${filt.month===m?'selected':''}>${m}</option>`)}</select></div></div>
 <div class="grid"><div class="card">Open enquiries<div class="kpi">${open.length}</div></div><div class="card">Pipeline value<div class="kpi">${inr(open.reduce((a,e)=>a+ +e.value,0))}</div></div>
 <div class="card">Overdue follow-ups<div class="kpi bad">${od.length}</div></div><div class="card">Due today<div class="kpi">${dt.length}</div></div>
 <div class="card">Quotations (latest rev)<div class="kpi">${new Set(Q.map(q=>q.enquiry_id)).size}</div></div><div class="card">Awaiting margin approval<div class="kpi bad">${pend.length}</div></div></div>
 <div class="card"><h2>Pipeline by stage</h2><div class="tw"><table><tr><th>Stage</th><th>Count</th><th>Value</th><th>Avg age (days)</th><th></th></tr>${STAGES.map(s=>{const x=E.filter(e=>e.stage===s),v=x.reduce((a,e)=>a+ +e.value,0);return `<tr><td>${s}</td><td>${x.length}</td><td>${inr(v)}</td><td>${x.length?Math.round(x.reduce((a,e)=>a+age(e),0)/x.length):'-'}</td><td style="width:30%"><div class="bar" style="width:${v/mx*100}%"></div></td></tr>`}).join('')}</table></div></div>
 <div class="card"><h2>Follow-up discipline by executive</h2><table><tr><th>Executive</th><th>Open</th><th>Overdue</th><th>No activity 7d</th></tr>${ex.map(o=>{const x=open.filter(e=>e.owner===o);return `<tr><td>${esc(o)}</td><td>${x.length}</td><td class="bad">${x.filter(e=>e.due_date<today()).length}</td><td>${x.filter(e=>!D.activities.some(a=>a.enquiry_id===e.id&&Date.now()-new Date(a.created_at)<7*864e5)).length}</td></tr>`}).join('')}</table></div>`}
window.bind_dash=()=>{['fo:owner','fc:cust','fm:month'].forEach(p=>{const[i,k]=p.split(':');$('#'+i).onchange=e=>{filt[k]=e.target.value;render()}})};
// Tasks
function tasks(){const T=D.tasks.filter(t=>!t.done),row=t=>`<tr><td>${esc(t.title)}</td><td>${esc(t.owner)}</td><td class="${t.due_date<today()?'bad':''}">${fd(t.due_date)}</td><td>${can(U,'edit')?`<button class="sec" data-t="${t.id}">Done</button>`:''}</td></tr>`;
 const E=D.enquiries.filter(e=>!['Won','Lost'].includes(e.stage)&&e.due_date<=today());
 return `<div class="card"><h2>Overdue & today — tasks</h2><table>${T.filter(t=>t.due_date<=today()).map(row).join('')||'<tr><td>None</td></tr>'}</table></div>
 <div class="card"><h2>Enquiry next actions due</h2><table>${E.map(e=>`<tr><td><a href="#" data-e="${e.id}">${e.enq_no}</a></td><td>${esc(e.next_action)}</td><td>${esc(e.owner)}</td><td class="${e.due_date<today()?'bad':''}">${fd(e.due_date)}</td></tr>`).join('')}</table></div>
 <div class="card"><h2>Upcoming tasks</h2><table>${T.filter(t=>t.due_date>today()).map(row).join('')}</table></div>`}
window.bind_tasks=()=>{document.querySelectorAll('[data-t]').forEach(b=>b.onclick=async()=>{await DB.update('tasks',b.dataset.t,{done:true});await audit('update','tasks',b.dataset.t,{done:true});await start()});bindE()};
function bindE(){document.querySelectorAll('[data-e]').forEach(a=>a.onclick=e=>{e.preventDefault();sel=a.dataset.e;view='detail';render()})}
// Customers
function cust(){return `${can(U,'edit')?`<div class="card"><h2>Add customer</h2><form id="cf" class="grid"><div><label>Name*</label><input name="name" required></div><div><label>Mobile*</label><input name="mobile" required pattern="[0-9+ ]{8,15}"></div><div><label>City</label><input name="city"></div><div><label>Segment</label><input name="segment"></div><div><label>GSTIN</label><input name="gstin"></div><div><label>Contact person</label><input name="contact"></div><div><button>Save</button></div></form><div id="dw"></div></div>`:''}
 <div class="card tw"><h2>Customers</h2><table><tr><th>Name</th><th>Mobile</th><th>City</th><th>Segment</th></tr>${D.customers.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.mobile)}</td><td>${esc(c.city)}</td><td>${esc(c.segment)}</td></tr>`).join('')}</table></div>`}
window.bind_cust=()=>{const f=$('#cf');if(!f)return;let ok=false;f.onsubmit=async e=>{e.preventDefault();const v=fv(f),n=v.name.trim().toLowerCase(),m=v.mobile.replace(/\D/g,'');
 const dup=D.customers.filter(c=>c.name.trim().toLowerCase()===n||String(c.mobile).replace(/\D/g,'')===m);
 if(dup.length&&!ok){ok=true;$('#dw').innerHTML=`<div class="warn">Possible duplicate: ${dup.map(c=>esc(c.name+' / '+c.mobile)).join(', ')}. Click Save again to add anyway.</div>`;return}
 const r=await DB.insert('customers',v);await audit('insert','customers',r.id,v);await start()}};
// Enquiries
function enq(){const own=[...new Set(D.enquiries.map(e=>e.owner).concat(U.name))];
 return `${can(U,'edit')?`<div class="card"><h2>New enquiry</h2><form id="ef" class="grid"><div><label>Customer*</label><select name="customer_id" required>${D.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`)}</select></div>
 <div><label>Product*</label><input name="product" required></div><div><label>Quantity</label><input name="qty" type="number"></div><div><label>Est. value (INR)</label><input name="value" type="number"></div>
 <div><label>Owner*</label><input name="owner" value="${esc(U.name)}" list="ol" required><datalist id="ol">${own.map(o=>`<option>${esc(o)}`)}</datalist></div><div><label>Stage</label><select name="stage">${STAGES.map(s=>`<option>${s}`)}</select></div>
 <div><label>Next action*</label><input name="next_action" required></div><div><label>Due date*</label><input name="due_date" type="date" required></div><div><button>Register</button></div></form></div>`:''}
 <div class="card tw"><h2>Enquiries</h2><table><tr><th>No</th><th>Customer</th><th>Product</th><th>Owner</th><th>Stage</th><th>Value</th><th>Next action</th><th>Due</th></tr>${D.enquiries.slice().reverse().map(e=>`<tr><td><a href="#" data-e="${e.id}">${e.enq_no}</a></td><td>${esc(cname(e.customer_id))}</td><td>${esc(e.product)}</td><td>${esc(e.owner)}</td><td>${e.stage}</td><td>${inr(e.value)}</td><td>${esc(e.next_action)}</td><td class="${e.due_date<today()?'bad':''}">${fd(e.due_date)}</td></tr>`).join('')}</table></div>`}
window.bind_enq=()=>{bindE();const f=$('#ef');if(f)f.onsubmit=async e=>{e.preventDefault();const v=fv(f);if(!v.next_action.trim())return alert('Next action is mandatory');
 const y=new Date().getFullYear(),n=D.enquiries.filter(x=>(x.enq_no||'').startsWith('ENQ-'+y)).length+1;v.enq_no=`ENQ-${y}-${String(n).padStart(4,'0')}`;
 Object.assign(v,{sales_status:'Open',artwork_status:'Pending',order_status:'-',payment_status:'-'});const r=await DB.insert('enquiries',v);await audit('insert','enquiries',r.id,v);sel=r.id;await load();view='detail';render()}};
// Detail
function detail(){const e=D.enquiries.find(x=>x.id===sel);if(!e)return'Not found';const ed=can(U,'edit'),sp=D.specs.filter(s=>s.enquiry_id===e.id).pop()||{};
 const co=D.costings.filter(c=>c.enquiry_id===e.id),Q=D.quotations.filter(q=>q.enquiry_id===e.id).sort((a,b)=>a.revision-b.revision),acts=D.activities.filter(a=>a.enquiry_id===e.id);
 const dis=ed?'':'disabled';const lc=co[co.length-1]||{};
 return `<div class="card"><h2>${e.enq_no} — ${esc(cname(e.customer_id))}</h2><form id="uf" class="grid"><div><label>Stage</label><select name="stage" ${dis}>${STAGES.map(s=>`<option ${e.stage===s?'selected':''}>${s}`)}</select></div>
 <div><label>Owner</label><input name="owner" value="${esc(e.owner)}" ${dis}></div><div><label>Next action*</label><input name="next_action" required value="${esc(e.next_action)}" ${dis}></div><div><label>Due*</label><input type="date" name="due_date" required value="${e.due_date||''}" ${dis}></div>
 <div><label>Sales status</label><input name="sales_status" value="${esc(e.sales_status)}" ${dis}></div><div><label>Artwork status (Phase 2)</label><input value="${esc(e.artwork_status)}" disabled></div><div><label>Order status (Phase 2)</label><input value="${esc(e.order_status)}" disabled></div><div><label>Payment status (Phase 3)</label><input value="${esc(e.payment_status)}" disabled></div>
 ${ed?'<div><button>Update</button></div>':''}</form><small>${esc(e.product)} · Qty ${e.qty||'-'} · ${inr(e.value)}</small></div>
 <div class="card"><h2>Packaging specification & feasibility</h2><form id="sf" class="grid">${[['structure','Structure (e.g. PET12/ALU9/PE70)'],['pouch_type','Pouch / roll type'],['width_mm','Width mm'],['length_mm','Length mm'],['thickness_mic','Total micron'],['colours','No. of colours'],['print_type','Printing'],['special','Zipper/notch/other']].map(([k,l])=>`<div><label>${l}</label><input name="${k}" value="${esc(sp[k])}" ${dis}></div>`).join('')}
 <div><label>Feasibility</label><select name="feasibility" ${dis}>${['Pending','Feasible','Feasible with changes','Not feasible'].map(o=>`<option ${sp.feasibility===o?'selected':''}>${o}`)}</select></div><div><label>Feasibility remarks</label><input name="feas_remarks" value="${esc(sp.feas_remarks)}" ${dis}></div>${ed?'<div><button>Save spec</button></div>':''}</form></div>
 ${can(U,'cost')?`<div class="card"><h2>Costing sheet</h2>${ed?`<form id="kf" class="grid">${[['material','Material cost / kg'],['conversion','Conversion / kg'],['cylinder','Cylinder / plate (one-time)'],['freight','Freight / kg'],['overheads','Overheads / kg'],...(can(U,'margin')?[['margin_pct','Margin %']]:[])].map(([k,l])=>`<div><label>${l}</label><input type="number" step="0.01" name="${k}" value="${lc[k]||''}"></div>`).join('')}<div><button>Save costing (new version)</button></div></form>`:''}
 <table><tr><th>Ver</th><th>Cost/kg</th>${can(U,'margin')?'<th>Margin %</th>':''}<th>Price/kg</th><th>Date</th></tr>${co.map((c,i)=>`<tr><td>${i+1}</td><td>${inr(c.cost_per_kg)}</td>${can(U,'margin')?`<td>${c.margin_pct}</td>`:''}<td>${inr(c.price_per_kg)}</td><td>${fd(c.created_at)}</td></tr>`).join('')}</table></div>`:''}
 <div class="card"><h2>Quotations (revision history)</h2><table><tr><th>Rev</th><th>Price/kg</th><th>Qty</th><th>Validity</th>${can(U,'margin')?'<th>Margin %</th>':''}<th>Approval</th><th>Date</th><th></th></tr>${Q.map((q,i)=>`<tr style="${i<Q.length-1?'color:#999':''}"><td>R${q.revision}${i<Q.length-1?' (superseded)':''}</td><td>${inr(q.price_per_kg)}</td><td>${q.qty}</td><td>${esc(q.validity)}</td>${can(U,'margin')?`<td>${q.margin_pct??''}</td>`:''}<td>${q.needs_approval?(q.approved?'Approved by '+esc(q.approved_by):'<span class="bad">Needs MD/CEO approval</span>'):'Within limit'}</td><td>${fd(q.created_at)}</td><td>${q.needs_approval&&!q.approved&&can(U,'approve')?`<button data-ap="${q.id}">Approve</button>`:''}</td></tr>`).join('')}</table>
 ${ed?`<form id="qf" class="grid"><div><label>Price/kg (INR)*</label><input name="price_per_kg" type="number" step="0.01" required value="${lc.price_per_kg||''}"></div><div><label>Qty</label><input name="qty" value="${e.qty||''}"></div><div><label>Validity</label><input name="validity" value="15 days"></div><div><label>Terms</label><input name="terms" value="GST extra, 50% advance"></div><div><button>Issue new revision</button></div></form>`:''}</div>
 <div class="card"><h2>Follow-up activity log</h2>${ed?`<form id="af" class="grid"><div><label>Type</label><select name="type"><option>Call<option>Visit<option>WhatsApp<option>Email<option>Sample</select></div><div><label>Notes*</label><input name="notes" required></div><div><label>Next action*</label><input name="next_action" required></div><div><label>Next due*</label><input type="date" name="due_date" required></div><div><button>Log</button></div></form>`:''}
 <table>${acts.slice().reverse().map(a=>`<tr><td>${fd(a.created_at)}</td><td>${esc(a.type)}</td><td>${esc(a.notes)}</td><td>${esc(a.by)}</td></tr>`).join('')}</table></div>`}
window.bind_detail=()=>{const e=D.enquiries.find(x=>x.id===sel),go=async()=>{await load();render()};const sub=(id,fn)=>{const f=$(id);if(f)f.onsubmit=async ev=>{ev.preventDefault();try{await fn(fv(f))}catch(x){alert(x.message)}await go()}};
 sub('#uf',async v=>{await DB.update('enquiries',e.id,v);await audit('update','enquiries',e.id,v)});
 sub('#sf',async v=>{v.enquiry_id=e.id;const r=await DB.insert('specs',v);await audit('insert','specs',r.id,v)});
 sub('#kf',async v=>{const n=k=>+v[k]||0,lc=D.costings.filter(c=>c.enquiry_id===e.id).pop()||{};v.margin_pct=v.margin_pct??lc.margin_pct??15;v.cost_per_kg=(n('material')+n('conversion')+n('freight')+n('overheads')).toFixed(2);v.price_per_kg=(v.cost_per_kg*(1+v.margin_pct/100)).toFixed(2);v.enquiry_id=e.id;const r=await DB.insert('costings',v);await audit('insert','costings',r.id,v)});
 sub('#qf',async v=>{const Q=D.quotations.filter(q=>q.enquiry_id===e.id),lc=D.costings.filter(c=>c.enquiry_id===e.id).pop();v.revision=Q.length;v.enquiry_id=e.id;
  if(lc&&+lc.cost_per_kg){v.margin_pct=+((v.price_per_kg/lc.cost_per_kg-1)*100).toFixed(2)}v.needs_approval=v.margin_pct!=null&&v.margin_pct<(DPPL_CONFIG.MARGIN_MIN_PCT||12);v.approved=false;
  const r=await DB.insert('quotations',v);await audit('insert','quotations',r.id,v);if(['New','Specification','Feasibility','Costing'].includes(e.stage))await DB.update('enquiries',e.id,{stage:'Quotation'})});
 sub('#af',async v=>{v.enquiry_id=e.id;v.by=U.name;const r=await DB.insert('activities',v);await DB.update('enquiries',e.id,{next_action:v.next_action,due_date:v.due_date});await DB.insert('tasks',{enquiry_id:e.id,title:e.enq_no+': '+v.next_action,owner:e.owner,due_date:v.due_date,done:false});await audit('insert','activities',r.id,v)});
 document.querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{await DB.update('quotations',b.dataset.ap,{approved:true,approved_by:U.name});await audit('approve','quotations',b.dataset.ap);go()})};
function auditV(){return `<div class="card tw"><h2>Audit log</h2><table>${D.audit_log.slice(-200).reverse().map(a=>`<tr><td>${new Date(a.created_at).toLocaleString('en-GB')}</td><td>${esc(a.user_email)}</td><td>${a.action}</td><td>${a.table_name}</td></tr>`).join('')}</table></div>`}
(async()=>{U=await DB.user();U?start():loginPage()})();
