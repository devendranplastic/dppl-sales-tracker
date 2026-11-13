// Customerwise monthly sales (kg): upload card (HR Admin + users with the "Upload sales files" permission, e.g. info@), template,
// last-year vs current-year analysis (Sales analysis tab + MD dashboard) and Excel export.
(function(){
const nk=CWS.nk,sum=(a,f)=>a.reduce((s,x)=>s+(+(typeof f==='function'?f(x):x[f])||0),0),r0=n=>Math.round(n||0);
const kg=n=>tn(n);   // v1.9: all quantities shown in tons (data stays kg)
const lk=n=>tn(n);
const gp=(c,l)=>l?(c-l)/Math.abs(l)*100:null,fp=p=>p==null?'—':(p>=0?'+':'')+p.toFixed(1)+'%',pc=p=>p==null?'':p>=0?'ok':'bad';
const mkt=()=>(D.profiles||[]).filter(p=>(p.role==='marketing'||(p.caps||[]).includes('sales_person'))&&p.active!==false);
const isMk=()=>U&&U.role==='marketing';
// customer-level rows for everyone (non-marketing); marketing only ever has their own customers' rows (RLS)
const cwsAll=()=>!isMk()&&(can(U,'full')||can(U,'sales_view')||can(U,'io_sales')||U.role==='accounts');window.cwsAll=cwsAll;
// person-level team view: non-marketing roles only (v1.8: marketing see only themselves)
const cwsTeam=()=>!isMk();window.cwsTeam=cwsTeam;
// kg views: sales roles (customer level) + every other non-marketing role (person level, read-only, no customer names)
const kgView=()=>can(U,'cws_view')||!isMk();
const prevFy=fy=>{const y=+fy.slice(0,4)-1;return `${y}-${String((y+1)%100).padStart(2,'0')}`};
const FY_OPTS=()=>{const y=new Date().getFullYear();return [...Array(9)].map((_,i)=>{const a=y-6+i;return `${a}-${String((a+1)%100).padStart(2,'0')}`})};
const fyOfToday=()=>{const d=new Date(),y=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;return `${y}-${String((y+1)%100).padStart(2,'0')}`};
let CW={sheets:null,file:'',busy:false,msg:'',res:null,cust:{},exec:{},fy:{},off:{}};
// ---------- template
function dlTpl(type){const fy=fyOfToday(),ws=XLSX.utils.aoa_to_sheet([[`Customerwise Sales Details - ${fy}`],CWS.HEAD,...CWS.EXAMPLES]),wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,ws,fy.slice(2));XLSX.writeFile(wb,'DPPL_Customerwise_Sales_Template.'+type,{bookType:type})}
window.dlCwsTemplate=dlTpl;
// ---------- matching plan (preview; the database re-checks every suggestion)
function plan(){const M=CWS.matcher(D.customers||[]),X=CWS.execMatcher(D.profiles,D.exec_aliases),cm={},xm={};
 for(const p of CW.sheets||[])for(const l of p.lines){const n=l.customer;if(!cm[n]){const ch=CW.cust[n];let m=null;
   if(ch&&ch.startsWith('__ren:')){const c=(D.customers||[]).find(c=>c.id===ch.slice(6));if(c)m={c,how:'rename'}}
   else if(ch&&ch!=='__new'){const c=(D.customers||[]).find(c=>c.id===ch);if(c)m={c,how:'chosen'}}else if(!ch)m=M(n);
   if(m)M.learn(n,m.c);cm[n]=m||{isNew:true}}
  const e=l.exec||'';if(e&&!xm[e]){const ch=CW.exec[e];xm[e]=ch==='__text'?{unmatched:true,how:'text'}:ch?{id:ch,how:'chosen'}:X(e)}}
 return{cm,xm}}
const xname=x=>x&&x.id?pname(x.id):'';
function sheetCard(p,P){const on=!CW.off[p.sheet],fy=CW.fy[p.sheet]||p.fy,old=fy&&(D.customerwise_uploads||[]).find(u=>u.fy===fy),by={};
 p.lines.forEach(l=>{const k=l.exec||'(blank)';by[k]=(by[k]||0)+l.total});const ok=p.fileTotal?Math.abs(p.fileTotal.qty-p.stats.qty)<=Math.max(1,Math.abs(p.stats.qty)*0.0001):null;
 return `<div class="card"><h3><label style="display:inline"><input type="checkbox" style="width:auto" data-cwon="${esc(p.sheet)}" ${on?'checked':''}> Sheet <b>${esc(p.sheet)}</b></label></h3>
 <div class="grid"><div><label>Financial year</label><select data-cwfy="${esc(p.sheet)}"><option value="">— choose —</option>${FY_OPTS().map(f=>`<option ${f===fy?'selected':''}>${f}</option>`).join('')}</select><small>${p.fyAuto?'detected from '+(p.title?'title / sheet name':'sheet name'):'not detected'}</small></div>
 <div class="card">Customer rows<div class="kpi">${p.stats.lines}</div><small>${p.stats.customers} customers · ${Object.keys(p.stats.byProduct).length} products</small></div>
 <div class="card">Quantity<div class="kpi">${lk(p.stats.qty)}</div><small>${ok===null?'no grand-total row':ok?'✔ matches the grand-total row':'<span class="bad">≠ grand-total row '+kg(p.fileTotal.qty)+'</span>'}</small></div>
 <div class="card">Months with data<div class="kpi">${new Set(p.lines.flatMap(l=>Object.keys(l.months))).size}</div><small>${esc(p.monthCols.join(', '))}</small></div>
 <div class="card">Status<div>${!fy?'<span class="bad">choose the FY</span>':old?`<span class="tag risk">replaces FY ${fy} uploaded ${fd(old.created_at)}</span>`:'<span class="tag ok">new FY</span>'}</div></div></div>
 <table><tr><th>Name in file</th><th>Marketing person in app</th><th>Tons</th></tr>${Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{const x=P.xm[k]||{};return `<tr><td>${esc(k)}</td><td>${k==='(blank)'?'<i>Common / unassigned</i>':x.id?`${esc(xname(x))} <small>(${x.how})</small>`:'<span class="bad">no login — kept as name</span>'}</td><td>${kg(v)}</td></tr>`}).join('')}<tr><td><b>Total</b></td><td></td><td><b>${kg(p.stats.qty)}</b></td></tr></table>
 ${p.errors.length?`<p class="bad">${p.errors.length} row(s) rejected: ${p.errors.slice(0,5).map(e=>'row '+e.row+' '+esc(e.issue)).join('; ')}</p>`:''}
 ${p.warnings.length?`<details><summary>${p.warnings.length} warning(s)</summary><table>${p.warnings.slice(0,60).map(w=>`<tr><td>Row ${w.row}</td><td>${esc(w.customer)}</td><td>${esc(w.issue)}</td></tr>`).join('')}</table></details>`:''}</div>`}
function cwsCard(){if(!can(U,'io_sales'))return'';const S=CW.sheets;let h=`<div class="card"><h2>Customerwise monthly sales (kg) <span class="tag ok">Monthly upload</span></h2>
 <p><small>Upload the <b>Customerwise Sales Details</b> sheet exactly as you keep it: <b>S.No · Name</b> (marketing person) <b>· Product · Customer Name · Apr … Mar</b> (kg) · Total · Average. A title row on top is fine; one sheet per financial year (sheet name like <b>26-27</b> or title “… 2026-27”). Upload the growing current-year sheet every month — it <b>replaces</b> that year, so nothing is duplicated. The file also decides each customer's marketing person (register sales are re-tagged).</small></p>
 <div class="grid"><div><label>Template</label><button class="sec" data-cwt="xlsx" type="button">Excel</button> <button class="sec" data-cwt="csv" type="button">CSV</button></div>
 <div><label>Customerwise file (.xlsx / .xls / .csv)</label><input type="file" id="cwf" accept=".csv,.xlsx,.xls"></div>
 <div><label>Uploaded years</label>${(D.customerwise_uploads||[]).slice().sort((a,b)=>a.fy<b.fy?1:-1).map(u=>`<div><small><b>FY ${u.fy}</b> · ${lk(u.total_qty)} · ${(u.months_covered||[]).length} months · ${fd(u.created_at)} by ${esc(pname(u.uploaded_by))}</small></div>`).join('')||'<small>none yet</small>'}</div></div>
 ${CW.msg?`<div class="warn">${CW.msg}</div>`:''}</div>`;
 if(S&&S.error)h+=`<div class="card"><p class="bad">${esc(S.error)}</p></div>`;
 if(S&&!S.error){const P=plan(),names=Object.keys(P.cm),nw=names.filter(n=>P.cm[n].isNew),fz=names.filter(n=>['fuzzy','chosen','rename'].includes(P.cm[n].how)),ex=names.length-nw.length-fz.length;
  const un=Object.keys(P.xm).filter(k=>!P.xm[k].id),fx=Object.keys(P.xm).filter(k=>P.xm[k].id&&['fuzzy','chosen'].includes(P.xm[k].how));
  const PEND=(D.customers||[]).filter(c=>c.needs_review).sort((a,b)=>a.name.localeCompare(b.name)),pl=c=>`${esc(c.name)} — new from ${esc(NC.SRC[c.source]||c.source||'form')}${c.exec_id?' · '+esc(pname(c.exec_id)):''}`;
  const opts=sel=>`<option value="">(automatic)</option><option value="__new" ${sel==='__new'?'selected':''}>➕ create as new customer</option>${PEND.length?`<optgroup label="New customers from enquiries / visits / samples (pending review)">${PEND.map(c=>`<option value="__ren:${c.id}" ${sel==='__ren:'+c.id?'selected':''}>✎ Rename “${pl(c)}” to this file name</option><option value="${c.id}" ${sel===c.id?'selected':''}>→ ${pl(c)} (keep its name)</option>`).join('')}</optgroup><optgroup label="All customers">`:''}${(D.customers||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}" ${sel===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}${PEND.length?'</optgroup>':''}`;
  const pm=new Set(names.map(n=>P.cm[n].c&&P.cm[n].c.needs_review?P.cm[n].c.id:null).filter(Boolean)),pu=PEND.filter(c=>!pm.has(c.id));
  h+=`<div class="card tw"><h2>Preview — ${esc(CW.file)}</h2>${S.map(p=>sheetCard(p,P)).join('')}
  <div class="card"><h3>Customers: ${ex} matched by name · ${fz.length} close matches · ${nw.length} new</h3><p><small>Pick the right customer if a close match is wrong or a “new” one already exists under another name. Choices are remembered for next month's upload.</small></p>
  ${PEND.length?`<p class="note" id="cwPend"><b>${PEND.length} new customer(s) typed by marketing are pending review.</b> ${pm.size?pm.size+' matched to this file (they will be marked reviewed). ':''}If the file spells one differently, choose <b>✎ Rename … to this file name</b> (or <b>→ keep its name</b>) against that file name below, so names stay the same in the app and in next month's file.${pu.length?`<br><small>Not in this file yet: ${pu.map(c=>esc(c.name)).join(', ')}</small>`:''}</p>`:''}
  ${fz.length?`<details open><summary>${fz.length} close match(es) — please check</summary><table><tr><th>Name in file</th><th>Matched to</th></tr>${fz.map(n=>`<tr><td>${esc(n)}</td><td><select data-cwc="${esc(n)}">${opts(CW.cust[n]||P.cm[n].c.id)}</select>${P.cm[n].c.needs_review&&P.cm[n].how!=='rename'?' <small class="tag risk">pending review</small>':''}</td></tr>`).join('')}</table></details>`:''}
  ${nw.length?`<details ${fz.length?'':'open'}><summary>${nw.length} new customer(s) — not found in the app</summary><table><tr><th>Name in file</th><th>Action</th></tr>${nw.map(n=>`<tr><td>${esc(n)}</td><td><select data-cwc="${esc(n)}">${opts(CW.cust[n]||'')}</select></td></tr>`).join('')}</table></details>`:''}</div>
  ${un.length||fx.length?`<div class="card"><h3>Marketing person names</h3><table>${[...fx,...un].map(k=>`<tr><td>${esc(k)}</td><td><select data-cwx="${esc(k)}"><option value="">(automatic${P.xm[k].id?': '+esc(xname(P.xm[k])):''})</option><option value="__text" ${CW.exec[k]==='__text'?'selected':''}>No login yet — keep the name only</option>${mkt().map(x=>`<option value="${x.id}" ${CW.exec[k]===x.id?'selected':''}>${esc(x.full_name||x.email)}</option>`).join('')}</select></td></tr>`).join('')}</table>
   <small>A name without a login (e.g. a new marketing person) is kept in the analysis under that name; HR Admin can create the login later and re-upload.</small></div>`:''}
  <div><button id="cwgo" type="button" ${CW.busy?'disabled':''}>${CW.busy?'Importing…':'Import '+S.filter(p=>!CW.off[p.sheet]).length+' sheet(s)'}</button> <button class="lt" id="cwclr" type="button">Cancel</button></div></div>`}
 if(CW.res)h+=`<div class="card tw"><h2>Last customerwise import</h2><table><tr><th>FY</th><th>Rows</th><th>Tons</th><th>Customers</th><th>New customers</th><th>Owners updated</th><th>Register lines re-tagged</th><th>By marketing person</th></tr>${CW.res.map(r=>`<tr><td>${r.fy}</td><td>${r.lines}</td><td>${kg(r.qty)}</td><td>${r.customers}</td><td>${r.customers_new}</td><td>${r.customers_reassigned??'—'}</td><td>${r.sales_lines_retagged??'—'}</td><td><small>${Object.entries(r.by_exec||{}).map(([k,v])=>esc(k)+': '+kg(v)).join(' · ')}</small></td></tr>`).join('')}</table>${CW.res.some(r=>(r.unmatched_execs||[]).length)?`<p class="warn">Names without a login: ${esc([...new Set(CW.res.flatMap(r=>r.unmatched_execs||[]))].join(', '))}</p>`:''}</div>`;
 return h}
// demo (local) mode: same rules as the database function
async function importLocal(fy,file,sheet,rows){const all=LS._g('customerwise_uploads'),old=all.find(u=>u.fy===fy);if(old){LS._s('customerwise_sales',LS._g('customerwise_sales').filter(r=>r.upload_id!==old.id));await DB.remove('customerwise_uploads',old.id)}
 const C=LS._g('customers'),key={};C.forEach(c=>[c.name,...(c.name_aliases||[])].forEach(n=>key[nk(n)]=c));let nn=0;
 for(const r of rows){let c=r.customer_id&&C.find(c=>c.id===r.customer_id)||key[nk(r.customer)];if(!c){c=await DB.insert('customers',{name:r.customer,mobile:'',source:'customerwise sales',created_by:U.id,name_aliases:[]});C.push(c);key[nk(r.customer)]=c;nn++}r._c=c.id;
  if(nk(c.name)!==nk(r.customer)&&!(c.name_aliases||[]).includes(r.customer)){c.name_aliases=[...(c.name_aliases||[]),r.customer];await DB.update('customers',c.id,{name_aliases:c.name_aliases})}}
 const up=await DB.insert('customerwise_uploads',{fy,file_name:file,sheet,lines:new Set(rows.map(r=>r.src_row)).size,rows:rows.length,total_qty:sum(rows,'qty'),months_covered:[...new Set(rows.map(r=>r.month))].sort(),uploaded_by:U.id});
 await DB.insertMany('customerwise_sales',rows.map(r=>({upload_id:up.id,fy,month:r.month,customer_id:r._c,customer_name:r.customer,product:r.product,exec_id:r.exec_id||null,exec_raw:r.exec,qty:r.qty,unit:'kg',src_row:r.src_row})));
 const S=LS._g('customerwise_sales'),best={};S.filter(r=>r.exec_id).forEach(r=>{const b=best[r.customer_id]=best[r.customer_id]||{};const k=r.fy+'|'+r.exec_id;b[k]=(b[k]||0)+ +r.qty});let ch=0;
 for(const [cid,b] of Object.entries(best)){const top=Object.entries(b).sort((x,y)=>x[0].split('|')[0]===y[0].split('|')[0]?y[1]-x[1]:(x[0]<y[0]?1:-1))[0][0].split('|')[1];const c=LS._g('customers').find(c=>c.id===cid);if(c&&c.exec_id!==top){await DB.update('customers',cid,{exec_id:top});ch++;
  const L=LS._g('sales_lines');L.forEach(l=>{if(l.customer_id===cid&&!['file','file-common'].includes(l.exec_source||'')){l.exec_id=top;l.is_common=false;l.exec_source='customer'}});LS._s('sales_lines',L)}}
 const by={};rows.forEach(r=>{const k=r.exec_id?pname(r.exec_id):(r.exec||'(blank)');by[k]=(by[k]||0)+r.qty});
 return{fy,rows:rows.length,lines:up.lines,qty:sum(rows,'qty'),customers:new Set(rows.map(r=>r._c)).size,customers_new:nn,unmatched_execs:[...new Set(rows.filter(r=>r.exec&&!r.exec_id).map(r=>r.exec))],by_exec:by,customers_reassigned:ch}}
function bind_cws(){document.querySelectorAll('[data-cwt]').forEach(b=>b.onclick=()=>dlTpl(b.dataset.cwt));const f=$('#cwf');if(!f)return;
 f.onchange=async e=>{const x=e.target.files[0];if(!x)return;CW={...CW,msg:'',res:null,cust:{},exec:{},fy:{},off:{},file:x.name};
  try{const wb=XLSX.read(await x.arrayBuffer(),{cellDates:false,raw:/\.csv$/i.test(x.name)});const S=CWS.readWorkbook(XLSX,wb,{file:x.name});CW.sheets=S.length?S:{error:'No sheet with the customerwise layout found (needs Customer Name and month columns Apr…Mar).'}}catch(err){CW.sheets={error:'Could not read file: '+err.message}}render()};
 const c=$('#cwclr');if(c)c.onclick=()=>{CW.sheets=null;render()};
 document.querySelectorAll('[data-cwon]').forEach(i=>i.onchange=()=>{CW.off[i.dataset.cwon]=!i.checked;render()});
 document.querySelectorAll('[data-cwfy]').forEach(s=>s.onchange=()=>{CW.fy[s.dataset.cwfy]=s.value;render()});
 document.querySelectorAll('[data-cwc]').forEach(s=>s.onchange=()=>{if(s.value)CW.cust[s.dataset.cwc]=s.value;else delete CW.cust[s.dataset.cwc];render()});
 document.querySelectorAll('[data-cwx]').forEach(s=>s.onchange=()=>{if(s.value)CW.exec[s.dataset.cwx]=s.value;else delete CW.exec[s.dataset.cwx];render()});
 const g=$('#cwgo');if(g)g.onclick=async()=>{const S=CW.sheets.filter(p=>!CW.off[p.sheet]),P=plan();
  for(const p of S){if(!(CW.fy[p.sheet]||p.fy))return alert('Choose the financial year for sheet '+p.sheet);if(p.errors.length&&!confirm(`Sheet ${p.sheet}: ${p.errors.length} row(s) have errors and will be skipped. Continue?`))return}
  const fys=S.map(p=>CW.fy[p.sheet]||p.fy);if(new Set(fys).size<fys.length)return alert('Two sheets have the same financial year — untick one.');
  const rep=fys.filter(f=>(D.customerwise_uploads||[]).some(u=>u.fy===f));if(rep.length&&!confirm(`These years are already uploaded and will be replaced:\nFY ${rep.join(', FY ')}\n\nContinue?`))return;
  const ren=Object.entries(CW.cust).filter(([n,v])=>v.startsWith('__ren:')).map(([n,v])=>({n,id:v.slice(6)}));
  if(new Set(ren.map(r=>r.id)).size<ren.length)return alert('The same pending customer is chosen for “rename” on two different file names — pick one; map the other with “→ keep its name”.');
  CW.busy=true;CW.res=[];render();
  try{for(const r of ren)await DB.update('customers',r.id,{name:r.n,needs_review:false});
   for(const p of S){const fy=CW.fy[p.sheet]||p.fy,MS=CWS.fyMonths(fy);
    const rows=p.lines.flatMap(l=>Object.entries(l.months).map(([i,q])=>({src_row:l.src_row,exec:l.exec,exec_id:(P.xm[l.exec]||{}).id||null,product:l.product,customer:l.customer,customer_id:CW.cust[l.customer]==='__new'?null:((P.cm[l.customer]||{}).c||{}).id||null,month:MS[i],qty:q})));
    let r;if(DB.mode==='Supabase'){const{data,error}=await sb.rpc('import_customerwise',{p_fy:fy,p_file:CW.file,p_sheet:p.sheet,p_rows:rows,p_sync_owners:true});if(error)throw new Error('FY '+fy+': '+error.message);r=data}else r=await importLocal(fy,CW.file,p.sheet,rows);
    CW.res.push(r);await DB.insert('import_logs',{kind:'customerwise',month:fy,file_name:CW.file+' (sheet '+p.sheet+')',rows_total:p.stats.lines,added:r.rows,updated:0,rejected:p.errors.length,rejected_rows:p.errors.map(e=>({row:e.row,issues:e.issue})),by_id:U.id})}
   const rv=[...new Set(Object.values(P.cm).map(m=>m.c&&m.c.needs_review?m.c.id:null).filter(Boolean))];for(const id of rv)await DB.update('customers',id,{needs_review:false});
   CW.msg=`Imported ${CW.res.map(r=>'FY '+r.fy+': '+kg(r.qty)).join(' · ')}.${rv.length?` ${rv.length} pending customer(s) confirmed by the file${ren.length?' ('+ren.length+' renamed to the file name)':''}.`:''}`;CW.sheets=null}
  catch(err){CW.msg='<span class="bad">Import stopped: '+esc(err.message)+'</span> — years listed below were saved; fix and upload again (no duplicates).'}
  CW.busy=false;await load();render()}}
// ---------- analysis: last year vs current year (kg)
let CA={fy:'',x:'',p:''};const charts={};
const xkey=r=>r.exec_id||(r.exec_raw?'raw:'+r.exec_raw:'(none)');
const xlabel=k=>k.startsWith('raw:')?k.slice(4)+' (no login)':k==='(none)'?'Common / unassigned':pname(k);
const ckey=r=>r.customer_id||'n:'+nk(r.customer_name);
const clabel=(k,rows)=>k.startsWith('n:')?(rows.find(r=>ckey(r)===k)||{}).customer_name:cname(k);
const kpRows=()=>(D.kg_person||[]).map(r=>({fy:r.fy,month:r.month,exec_id:r.exec_id,qty:+r.kg||0,customer_id:null,product:null}));
function caData(agg){const all=cwsAll(),kp=agg&&(isMk()||!cwsAll()),team=kp&&cwsTeam(),R=kp?kpRows().filter(r=>team||r.exec_id===ME()):(D.customerwise_sales||[]).filter(r=>all||r.exec_id===ME()),FY=[...new Set(R.map(r=>r.fy))].sort().reverse();if(!FY.length)return null;if(!CA.fy||!FY.includes(CA.fy))CA.fy=FY[0];
 const cy=CA.fy,ly=prevFy(cy),ly2=prevFy(ly),MS=CWS.fyMonths(cy),ML=CWS.fyMonths(ly),M2=CWS.fyMonths(ly2);
 let A=R;if(CA.x)A=A.filter(r=>xkey(r)===CA.x);if(CA.p)A=A.filter(r=>(r.product||'(blank)')===CA.p);
 const C=A.filter(r=>r.fy===cy),L=A.filter(r=>r.fy===ly),up=(D.customerwise_uploads||[]).find(u=>u.fy===cy);
 const cov=(up&&up.months_covered&&up.months_covered.length?up.months_covered:[...new Set(R.filter(r=>r.fy===cy).map(r=>r.month))]).map(m=>MS.indexOf(m)).filter(i=>i>=0);const n=cov.length?Math.max(...cov)+1:12;
 const ytdC=C.filter(r=>MS.indexOf(r.month)<n),ytdL=L.filter(r=>ML.indexOf(r.month)<n);
 // FY two years back: customerwise if uploaded, else the Tally register's packaging kg (same basis as this file)
 const has2=R.some(r=>r.fy===ly2),reg2=!has2&&!CA.x&&!CA.p&&!team?(D.sales_lines||[]).filter(l=>M2.includes(l.month)&&l.unit==='kg'&&(l.category||'Packaging')==='Packaging'):[];
 const m2=M2.map(m=>has2?sum(A.filter(r=>r.fy===ly2&&r.month===m),'qty'):reg2.length?sum(reg2.filter(l=>l.month===m),'qty'):null);
 return{R,FY,cy,ly,ly2,MS,ML,n,A,C,L,ytdC,ytdL,m2:m2.some(v=>v)?m2:null,src2:has2?'customerwise':'Tally register (packaging kg)',hasLY:R.some(r=>r.fy===ly)}}
const grpQ=(rows,k)=>{const o={};rows.forEach(r=>{const x=k(r);o[x]=(o[x]||0)+(+r.qty||0)});return o};
function cmpRows(d,k){const c=grpQ(d.ytdC,k),l=grpQ(d.ytdL,k),lf=grpQ(d.L,k),cf=grpQ(d.C,k);return [...new Set([...Object.keys(c),...Object.keys(l),...Object.keys(lf)])].map(x=>({k:x,c:c[x]||0,l:l[x]||0,lf:lf[x]||0,cf:cf[x]||0,g:gp(c[x]||0,l[x]||0)}))}
function movement(d){const R=cmpRows(d,ckey);return{rows:R,newC:R.filter(r=>r.c>0&&r.lf<=0),lost:R.filter(r=>r.c<=0&&r.l>0),grew:R.filter(r=>r.c>0&&r.l>0&&r.c>r.l),drop:R.filter(r=>r.c>0&&r.l>0&&r.c<r.l)}}
function cwsAnalysisHtml(){if(!can(U,'cws_view'))return'';const d=caData();
 if(!d)return `<div class="card"><h2>Volume: last year vs this year (tons)</h2><p>No customerwise sales uploaded yet.${can(U,'io_sales')?` Upload the Customerwise Sales Details sheet on <a href="#" data-go="${can(U,'io')?'io':'supl'}:">${can(U,'io')?'Import / Export':'Sales uploads'}</a>.`:''}</p></div>`;
 const tc=sum(d.ytdC,'qty'),tl=sum(d.ytdL,'qty'),lfull=sum(d.L,'qty'),g=gp(tc,tl),mv=movement(d),mlab=CWS.MLAB[d.n-1],full=cwsAll();
 const P=cmpRows(d,xkey).sort((a,b)=>b.c-a.c),PR=cmpRows(d,r=>r.product||'(blank)').sort((a,b)=>b.c-a.c),TC=mv.rows.filter(r=>r.c>0).sort((a,b)=>b.c-a.c);
 const X=[...new Set(d.R.map(xkey))],PP=[...new Set(d.R.map(r=>r.product||'(blank)'))].sort();
 const list=(a,t)=>`<details><summary>${t} (${a.length})</summary><table><tr><th>Customer</th><th>${d.ly} till ${mlab}</th><th>${d.cy} till ${mlab}</th><th>Change</th><th>${d.ly} full year</th></tr>${a.map(r=>`<tr><td>${esc(clabel(r.k,d.R))}</td><td>${kg(r.l)}</td><td>${kg(r.c)}</td><td class="${pc(r.g)}">${kg(r.c-r.l)} ${fp(r.g)}</td><td>${kg(r.lf)}</td></tr>`).join('')}</table></details>`;
 return `<div class="card"><h2>Volume: FY ${d.cy} vs FY ${d.ly} (tons, customerwise file)</h2><div class="grid">
 <div><label>Current year</label><select id="cafy">${d.FY.map(f=>`<option ${f===d.cy?'selected':''}>${f}</option>`).join('')}</select></div>
 ${full?`<div><label>Marketing person</label><select id="cax"><option value="">All</option>${X.map(x=>`<option value="${esc(x)}" ${CA.x===x?'selected':''}>${esc(xlabel(x))}</option>`).join('')}</select></div>`:''}
 <div><label>Product</label><select id="cap"><option value="">All</option>${PP.map(p=>`<option ${CA.p===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
 <div><label>Export</label><button class="sec" id="caexp" type="button">Download LY vs CY (Excel)</button></div></div>
 <p><small>Year to date = April to <b>${mlab}</b> (${d.n} month${d.n>1?'s':''} uploaded for FY ${d.cy}), compared with the same months of FY ${d.ly}.${d.hasLY?'':' <span class="bad">FY '+d.ly+' not uploaded yet.</span>'}</small></p></div>
 <div class="grid"><div class="card">FY ${d.cy} till ${mlab}<div class="kpi">${lk(tc)}</div><small>${new Set(d.ytdC.map(ckey)).size} customers</small></div>
 <div class="card">FY ${d.ly} same months<div class="kpi">${lk(tl)}</div><small>${new Set(d.ytdL.map(ckey)).size} customers · full year ${lk(lfull)}</small></div>
 <div class="card">Growth (YTD)<div class="kpi ${pc(g)}">${fp(g)}</div><small>${(tc-tl>=0?'+':'')+kg(tc-tl)}</small></div>
 <div class="card">Monthly average<div class="kpi">${lk(tc/d.n)}</div><small>vs ${lk(tl/d.n)} last year · full-year pace ${lk(tc/d.n*12)}</small></div>
 <div class="card">Customers<div class="kpi">${mv.newC.length} new · ${mv.lost.length} lost</div><small>${mv.grew.length} grew · ${mv.drop.length} dropped</small></div></div>
 <div class="card"><h2>Month by month (tons)</h2><div style="position:relative;height:300px"><canvas id="caMon" aria-label="Monthly kg last year vs this year"></canvas></div>${d.m2?`<small>FY ${d.ly2} line: ${esc(d.src2)}.</small>`:''}</div>
 ${mwCard(d,full)}
 ${cwsKgTargetCard()}
 <div class="grid">${full?`<div class="card"><h2>By marketing person (YTD)</h2><div style="position:relative;height:280px"><canvas id="caExec" aria-label="Kg by marketing person"></canvas></div></div>`:''}<div class="card"><h2>By product (YTD)</h2><div style="position:relative;height:280px"><canvas id="caProd" aria-label="Kg by product"></canvas></div></div></div>
 ${full?`<div class="card tw"><h2>Marketing person — FY ${d.cy} vs FY ${d.ly}</h2><table><tr><th>Marketing person</th><th>${d.ly} till ${mlab}</th><th>${d.cy} till ${mlab}</th><th>Growth</th><th>Share ${d.cy}</th><th>${d.ly} full year</th><th>Customers ${d.cy}</th></tr>${P.map(r=>`<tr><td>${esc(xlabel(r.k))}</td><td>${kg(r.l)}</td><td>${kg(r.c)}</td><td class="${pc(r.g)}">${fp(r.g)}</td><td>${tc?(r.c/tc*100).toFixed(1)+'%':''}</td><td>${kg(r.lf)}</td><td>${new Set(d.ytdC.filter(x=>xkey(x)===r.k).map(ckey)).size}</td></tr>`).join('')}<tr><td><b>Total</b></td><td><b>${kg(tl)}</b></td><td><b>${kg(tc)}</b></td><td class="${pc(g)}"><b>${fp(g)}</b></td><td></td><td><b>${kg(lfull)}</b></td><td></td></tr></table></div>`:''}
 <div class="card tw"><h2>Product — FY ${d.cy} vs FY ${d.ly}</h2><table><tr><th>Product</th><th>${d.ly} till ${mlab}</th><th>${d.cy} till ${mlab}</th><th>Growth</th><th>${d.ly} full year</th></tr>${PR.map(r=>`<tr><td>${esc(r.k)}</td><td>${kg(r.l)}</td><td>${kg(r.c)}</td><td class="${pc(r.g)}">${fp(r.g)}</td><td>${kg(r.lf)}</td></tr>`).join('')}</table></div>
 <div class="card tw"><h2>Top customers — FY ${d.cy} till ${mlab}</h2><table><tr><th>#</th><th>Customer</th><th>${d.cy}</th><th>${d.ly} same months</th><th>Change</th>${full?'<th>Marketing person</th>':''}</tr>${TC.slice(0,20).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(clabel(r.k,d.R))}</td><td>${kg(r.c)}</td><td>${kg(r.l)}</td><td class="${pc(r.g)}">${r.l?fp(r.g):'<span class="tag ok">new</span>'}</td>${full?`<td>${esc([...new Set(d.C.filter(x=>ckey(x)===r.k).map(x=>xlabel(xkey(x))))].join(', '))}</td>`:''}</tr>`).join('')}</table>${TC.length>20?`<small>Top 20 of ${TC.length} — full list in the Excel export.</small>`:''}</div>
 <div class="card tw"><h2>Customer movement (YTD)</h2><div class="grid"><div class="card">New customers<div class="kpi ok">${mv.newC.length}</div><small>${kg(sum(mv.newC,'c'))} — bought this year, nothing last year</small></div><div class="card">Lost customers<div class="kpi bad">${mv.lost.length}</div><small>${kg(sum(mv.lost,'l'))} last year till ${mlab}, none this year</small></div>
 <div class="card">Grew<div class="kpi">${mv.grew.length}</div><small>${(sum(mv.grew,r=>r.c-r.l)>=0?'+':'')+kg(sum(mv.grew,r=>r.c-r.l))}</small></div><div class="card">Dropped<div class="kpi">${mv.drop.length}</div><small>${kg(sum(mv.drop,r=>r.c-r.l))}</small></div></div>
 ${list(mv.newC.sort((a,b)=>b.c-a.c),'New customers')}${list(mv.lost.sort((a,b)=>b.l-a.l),'Lost customers')}${list(mv.grew.sort((a,b)=>(b.c-b.l)-(a.c-a.l)),'Grew')}${list(mv.drop.sort((a,b)=>(a.c-a.l)-(b.c-b.l)),'Dropped')}</div>`}
const COL={cy:'#E31E24',ly:'#1F2A5A',ly2:'#9AA0B4'};const tk=v=>(v/1000).toLocaleString('en-IN',{maximumFractionDigits:1});   // axis ticks in tons
function monChart(el,d,h){const ds=[{type:'bar',label:'FY '+d.ly,data:d.ML.map((m,i)=>sum(d.L.filter(r=>r.month===m),'qty')),backgroundColor:COL.ly},{type:'bar',label:'FY '+d.cy,data:d.MS.map((m,i)=>i<d.n?sum(d.C.filter(r=>r.month===m),'qty'):null),backgroundColor:COL.cy}];
 if(d.m2)ds.push({type:'line',label:'FY '+d.ly2+(d.src2.startsWith('Tally')?' (register)':''),data:d.m2,borderColor:COL.ly2,backgroundColor:COL.ly2,borderDash:[5,4],tension:.2});
 return new Chart(el,{data:{labels:CWS.MLAB,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true,ticks:{callback:tk},title:{display:true,text:'tons'}}},plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${kg(c.raw)}`}}}}})}
function cmpChart(el,rows,lab,d,horiz){rows=rows.slice(0,12);return new Chart(el,{type:'bar',data:{labels:rows.map(r=>lab(r.k)),datasets:[{label:'FY '+d.ly+' till '+CWS.MLAB[d.n-1],data:rows.map(r=>r0(r.l)),backgroundColor:COL.ly},{label:'FY '+d.cy+' till '+CWS.MLAB[d.n-1],data:rows.map(r=>r0(r.c)),backgroundColor:COL.cy}]},
 options:{indexAxis:horiz?'y':'x',responsive:true,maintainAspectRatio:false,animation:false,scales:{[horiz?'x':'y']:{beginAtZero:true,ticks:{callback:tk}}},plugins:{tooltip:{callbacks:{label:c=>{const r=rows[c.dataIndex];return ` ${c.dataset.label}: ${kg(c.raw)}${c.datasetIndex===1&&r.l?' ('+fp(r.g)+')':''}`}}}}}})}
function drawCA(){if(!window.Chart||!$('#caMon'))return;Object.values(charts).forEach(c=>c.destroy());const d=caData();if(!d)return;
 charts.m=monChart($('#caMon'),d);if($('#caExec'))charts.x=cmpChart($('#caExec'),cmpRows(d,xkey).sort((a,b)=>b.c-a.c),xlabel,d);
 charts.p=cmpChart($('#caProd'),cmpRows(d,r=>r.product||'(blank)').sort((a,b)=>b.c-a.c),k=>k,d,true)}
function exportCA(){const d=caData();if(!d)return;const wb=XLSX.utils.book_new(),add=(n,r)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r.length?r:[{}]),n),mlab=CWS.MLAB[d.n-1];
 add('Monthly',CWS.MLAB.map((m,i)=>({Month:m,...(d.m2?{['FY '+d.ly2+' (T)']:TNn(d.m2[i])}:{}),['FY '+d.ly+' (T)']:TNn(sum(d.L.filter(r=>r.month===d.ML[i]),'qty')),['FY '+d.cy+' (T)']:i<d.n?TNn(sum(d.C.filter(r=>r.month===d.MS[i]),'qty')):''})));
 const cmp=(rows,lab,name)=>rows.map(r=>({[name]:lab(r.k),[`FY ${d.ly} Apr-${mlab} (T)`]:TNn(r.l),[`FY ${d.cy} Apr-${mlab} (T)`]:TNn(r.c),'Change (T)':TNn(r.c-r.l),'Growth %':r.g==null?'':+r.g.toFixed(1),[`FY ${d.ly} full year (T)`]:TNn(r.lf)}));
 add('By marketing person',cmp(cmpRows(d,xkey).sort((a,b)=>b.c-a.c),xlabel,'Marketing person'));add('By product',cmp(cmpRows(d,r=>r.product||'(blank)').sort((a,b)=>b.c-a.c),k=>k,'Product'));
 const mv=movement(d),st=r=>r.c>0&&r.lf<=0?'New':r.c<=0&&r.l>0?'Lost':r.c>r.l?'Grew':r.c<r.l?'Dropped':'Same';
 add('Customers',mv.rows.sort((a,b)=>b.c-a.c).map(r=>({...cmp([r],k=>clabel(k,d.R),'Customer')[0],Status:st(r),'Marketing person':[...new Set(d.A.filter(x=>ckey(x)===r.k&&(x.fy===d.cy||x.fy===d.ly)).map(x=>xlabel(xkey(x))))].join(', ')})));
 add('Data',d.A.filter(r=>r.fy===d.cy||r.fy===d.ly).map(r=>({FY:r.fy,Month:r.month,'Marketing person':xlabel(xkey(r)),'Name in file':r.exec_raw,Product:r.product,Customer:r.customer_name,'Customer in app':cname(r.customer_id),'Qty (T)':TNn(r.qty)})));
 XLSX.writeFile(wb,`DPPL_LY_vs_CY_FY${d.cy}.xlsx`)}
function bindCA(){const f=$('#cafy');if(f)f.onchange=()=>{CA.fy=f.value;render()};const x=$('#cax');if(x)x.onchange=()=>{CA.x=x.value;render()};const p=$('#cap');if(p)p.onchange=()=>{CA.p=p.value;render()};const e=$('#caexp');if(e)e.onclick=exportCA;drawCA()}
// ---------- MD dashboard card (management)
function dashCard(){if(!kgView())return opsKgCard();const d=caAgg(),own=isMk()?caAll():d;if(!d)return `<div class="card"><h2>Volume (tons)</h2><p>No customerwise sales uploaded yet.</p></div>`;
 const team=cwsTeam(),tc=sum(d.ytdC,'qty'),tl=sum(d.ytdL,'qty'),g=gp(tc,tl),mlab=CWS.MLAB[d.n-1],lm=d.MS[d.n-1],P=cmpRows(d,xkey).sort((a,b)=>b.c-a.c);
 const lmC=sum(d.C.filter(r=>r.month===lm),'qty'),lmL=sum(d.L.filter(r=>r.month===d.ML[d.n-1]),'qty'),tq=(x,m)=>{const t=(D.targets||[]).find(t=>t.exec_id===x&&t.period===m);return t&&t.qty!=null?+t.qty:0};
 const E=team?mkt().map(p=>p.id):[ME()],lmT=E.reduce((s,x)=>s+tq(x,lm),0),ytdT=E.reduce((s,x)=>s+d.MS.slice(0,d.n).reduce((a,m)=>a+tq(x,m),0),0);
 const TC=team||!own?[]:cmpRows(own,ckey).filter(r=>r.c>0).sort((a,b)=>b.c-a.c).slice(0,10);
 const mm=new Date().toISOString().slice(0,7),myV=(D.visits||[]).filter(v=>(team||v.by_id===ME())&&(v.date||'').startsWith(mm)).length,myE=(D.enquiries||[]).filter(e=>(team||e.owner_id===ME())&&!['Won','Lost'].includes(e.stage)).length;
 return `<div class="card"><h2>${team?'Team volume':'My volume — '+esc(pname(ME()))} · FY ${d.cy}</h2><p><span class="tag ok">Latest month: ${mlab}-${lm.slice(2,4)}</span> <small>Year to date = Apr to ${mlab} (the last month uploaded). Months after ${mlab} show as pending upload.</small></p>
 <div class="grid"><div class="card">${mlab}-${lm.slice(2,4)} actual<div class="kpi">${lk(lmC)}</div><small>${lmT?`target ${lk(lmT)} · <span class="pc ${pcl(lmC/lmT*100)}">${Math.round(lmC/lmT*100)}%</span>`:'no target'}</small></div>
 <div class="card">YTD Apr–${mlab}<div class="kpi">${lk(tc)}</div><small>${ytdT?`target ${lk(ytdT)} · <span class="pc ${pcl(tc/ytdT*100)}">${Math.round(tc/ytdT*100)}%</span>`:'no target'}</small></div>
 <div class="card">vs last year (same months)<div class="kpi ${pc(g)}">${fp(g)}</div><small>${lk(tl)} in FY ${d.ly} · ${mlab}: ${lk(lmL)}</small></div>
 <div class="card">${team?'Team':'My'} activity<div class="kpi">${myV} visits</div><small>this calendar month · ${myE} open enquiries</small></div>
 ${team?P.slice(0,6).map(r=>`<div class="card">${esc(xlabel(r.k))}<div class="kpi ${pc(r.g)}">${fp(r.g)}</div><small>${lk(r.c)} vs ${lk(r.l)}</small></div>`).join(''):''}</div>
 <div class="grid"><div><div style="position:relative;height:260px"><canvas id="cdMon" aria-label="Monthly kg LY vs CY"></canvas></div></div>${team?`<div><div style="position:relative;height:260px"><canvas id="cdExec" aria-label="Kg by marketing person LY vs CY"></canvas></div></div>`:''}</div>
 ${TC.length?`<div class="tw"><h3>My top customers — Apr to ${mlab}</h3><table><tr><th>#</th><th>Customer</th><th>${d.cy}</th><th>${d.ly} same months</th><th>Change</th></tr>${TC.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(clabel(r.k,own.R))}</td><td>${kg(r.c)}</td><td>${kg(r.l)}</td><td class="${pc(r.g)}">${r.l?fp(r.g):'<span class="tag ok">new</span>'}</td></tr>`).join('')}</table></div>`:''}
 <small>From the customerwise sales file. Details: <a href="#" data-go="sana:">Sales analysis</a>.</small></div>${cwsKgTargetCard(team)}`}
// roles without sales access (planning, dispatch, factory): company kg totals only, from the team_kg_monthly() summary
function opsKgCard(){const T=D.team_kg||[];const A=T.filter(r=>+r.kg>0);if(!A.length)return'';const lm=A.map(r=>r.month).sort().pop(),fy=(A.find(r=>r.month===lm)||{}).fy,MS=CWS.fyMonths(fy),n=MS.indexOf(lm)+1,mlab=CWS.MLAB[n-1];
 const get=m=>T.find(r=>r.month===m)||{},ly=CWS.fyMonths(prevFy(fy)),ytd=MS.slice(0,n).reduce((s,m)=>s+(+get(m).kg||0),0),ytdT=MS.slice(0,n).reduce((s,m)=>s+(+get(m).target_kg||0),0),lyY=ly.slice(0,n).reduce((s,m)=>s+(+get(m).kg||0),0),c=p=>p==null?'—':`<span class="pc ${pcl(p)}">${Math.round(p)}%</span>`;
 return `<div class="card tw"><h2>Company volume (tons) · FY ${fy}</h2><p><span class="tag ok">Latest month: ${mlab}-${lm.slice(2,4)}</span> <small>YTD = Apr to ${mlab}.</small></p>
 <div class="grid"><div class="card">${mlab} actual (T)<div class="kpi">${lk(get(lm).kg)}</div><small>${+get(lm).target_kg?'target '+lk(get(lm).target_kg)+' · '+c(get(lm).kg/get(lm).target_kg*100):''}</small></div><div class="card">YTD Apr–${mlab}<div class="kpi">${lk(ytd)}</div><small>${ytdT?'target '+lk(ytdT)+' · '+c(ytd/ytdT*100):''}</small></div><div class="card">vs last year<div class="kpi ${pc(gp(ytd,lyY))}">${fp(gp(ytd,lyY))}</div><small>${lk(lyY)} same months FY ${prevFy(fy)}</small></div></div>
 <table><tr><th>Month</th>${MS.map((m,i)=>`<th>${CWS.MLAB[i]}-${m.slice(2,4)}</th>`).join('')}</tr><tr><td>Target</td>${MS.map(m=>`<td>${+get(m).target_kg?nf(get(m).target_kg):'—'}</td>`).join('')}</tr><tr><td>Actual</td>${MS.map((m,i)=>`<td>${i<n?nf(get(m).kg):'<small class="bad">pending upload</small>'}</td>`).join('')}</tr><tr><td>%</td>${MS.map((m,i)=>`<td>${i<n&&+get(m).target_kg?c(get(m).kg/get(m).target_kg*100):''}</td>`).join('')}</tr></table><small>Company totals from the customerwise sales file.</small></div>`}
const dch={};function drawDash(){if(!window.Chart||!$('#cdMon'))return;Object.values(dch).forEach(c=>c.destroy());const d=caAgg();if(!d)return;
 dch.m=monChart($('#cdMon'),d);if($('#cdExec'))dch.x=cmpChart($('#cdExec'),cmpRows(d,xkey).sort((a,b)=>b.c-a.c),xlabel,d)}
// Targets tab helper (Balaji): last year / this year kg per person next to the targets
window.cwsTargetHelp=()=>{const d=caAgg();if(!d)return'';const mlab=CWS.MLAB[d.n-1];
 return `<div class="card tw"><h2>Reference: tons per marketing person</h2><table><tr><th>Marketing person</th><th>FY ${d.ly} full year</th><th>FY ${d.ly} monthly avg</th><th>FY ${d.cy} Apr–${mlab}</th><th>FY ${d.cy} monthly avg</th><th>Growth</th></tr>${cmpRows(d,xkey).sort((a,b)=>b.c-a.c).map(r=>`<tr><td>${esc(xlabel(r.k))}</td><td>${kg(r.lf)}</td><td>${kg(r.lf/12)}</td><td>${kg(r.c)}</td><td>${kg(r.c/d.n)}</td><td class="${pc(r.g)}">${fp(r.g)}</td></tr>`).join('')}</table></div>`};
// ---------- month-wise kg as numbers (Sales analysis, Sales (ERP) tab, Customers list) so every uploaded FY is visible, not only in charts
const nf=n=>f2((+n||0)/1000);   // tons, 2 decimals
const fyOfM=m=>{const y=+m.slice(0,4);return +m.slice(5,7)>=4?`${y}-${String((y+1)%100).padStart(2,'0')}`:`${y-1}-${String(y%100).padStart(2,'0')}`};
function mwTable(rows,fy,full){const MS=CWS.fyMonths(fy),last=MS.map(m=>rows.some(r=>r.month===m)).lastIndexOf(true),cols=MS.slice(0,last+1);if(!cols.length)return `<p><small>No customerwise data for FY ${fy}.</small></p>`;
 const line=(lab,a,b)=>`<tr><td>${b?'<b>'+esc(lab)+'</b>':esc(lab)}</td>${cols.map(m=>`<td>${nf(sum(a.filter(r=>r.month===m),'qty'))}</td>`).join('')}<td><b>${nf(sum(a,'qty'))}</b></td></tr>`;
 const P=full?[...new Set(rows.map(xkey))].map(k=>({k,a:rows.filter(r=>xkey(r)===k)})).sort((x,y)=>sum(y.a,'qty')-sum(x.a,'qty')):[];
 return `<table><tr><th>Marketing person</th>${cols.map((m,i)=>`<th>${CWS.MLAB[i]}-${m.slice(2,4)}</th>`).join('')}<th>Total</th></tr>${P.map(p=>line(xlabel(p.k),p.a)).join('')}${line('Total FY '+fy,rows,1)}</table>`}
const caAll=agg=>{const s={...CA};CA.x='';CA.p='';const d=caData(agg);Object.assign(CA,s);return d};
const caAgg=()=>caAll(1);
function mwCard(d,full){return `<div class="card tw"><h2>Month-wise tons — FY ${d.cy}${CA.x||CA.p?' (filtered)':''}</h2>${mwTable(d.C,d.cy,full)}
 ${d.hasLY?`<details><summary>FY ${d.ly} month-wise tons</summary>${mwTable(d.L,d.ly,full)}</details>`:''}<small>Uploaded years: ${d.FY.map(f=>'FY '+f).join(', ')} (customerwise sales file).</small></div>`}
function cwsSalesCard(){if(!can(U,'cws_view'))return'';const d=caAll();if(!d)return'';const full=cwsAll();
 return `<div class="card"><h2>Customerwise sales (tons) — FY ${d.cy}</h2><div class="grid"><div><label>Financial year</label><select id="cwsfy">${d.FY.map(f=>`<option ${f===d.cy?'selected':''}>${f}</option>`).join('')}</select></div>
 <div class="card">FY ${d.cy} total<div class="kpi">${lk(sum(d.C,'qty'))}</div><small>${d.n} month${d.n>1?'s':''} · ${new Set(d.C.map(ckey)).size} customers</small></div></div>
 <div class="tw">${mwTable(d.C,d.cy,full)}</div><small>From the customerwise sales file. Charts and last-year comparison: <a href="#" data-go="sana:">Sales analysis</a>. The ERP / Tally ₹ value uploads are below.</small></div>`}
let CK=null;window.cwsCust=()=>{if(!can(U,'cws_view'))return null;const d=caAll();if(!d)return null;const key=D.loadedAt+'|'+d.cy;
 if(!CK||CK.key!==key){const m={};d.R.forEach(r=>{if(!r.customer_id||(r.fy!==d.cy&&r.fy!==d.ly))return;const x=m[r.customer_id]=m[r.customer_id]||{c:0,l:0};x[r.fy===d.cy?'c':'l']+=+r.qty||0});CK={key,m,cy:d.cy,ly:d.ly}}
 return{head:`<th>Tons FY ${CK.cy}</th><th>Tons FY ${CK.ly}</th>`,sort:a=>a.slice().sort((x,y)=>{const X=CK.m[x.id]||{c:0,l:0},Y=CK.m[y.id]||{c:0,l:0};return (Y.c-X.c)||(Y.l-X.l)}),cell:id=>{const x=CK.m[id];return `<td>${x&&x.c?nf(x.c):'—'}</td><td>${x&&x.l?nf(x.l):'—'}</td>`}}};
// ---------- kg targets (targets.qty, per month) vs customerwise actual kg: Sales analysis, Dashboard, Targets screens
const pcl=p=>p==null?'':p>=100?'pg':p>=90?'pa':'pr';
window.cwsKgTargetCard=compact=>{if(!kgView())return'';const d=caAgg();if(!d)return'';const fy=d.cy,MS=CWS.fyMonths(fy),TG=D.targets||[],full=cwsTeam();
 const tq=(x,m)=>{const t=TG.find(t=>t.exec_id===x&&t.period===m);return t&&t.qty!=null&&t.qty!==''?+t.qty:null};
 const E=(full?mkt().map(p=>p.id):[ME()]).filter(x=>MS.some(m=>tq(x,m)!=null));if(!E.length)return compact?'':`<div class="card"><h2>Tons target vs actual — FY ${fy}</h2><p><small>No monthly qty targets set for FY ${fy}. Add them on the Targets screen (Qty (kg), period YYYY-MM).</small></p></div>`;
 const n=d.n,mlab=CWS.MLAB[n-1],act=(x,m)=>sum(d.C.filter(r=>r.exec_id===x&&r.month===m),'qty'),pct=(a,t)=>t?a/t*100:null,cell=p=>p==null?'—':`<span class="pc ${pcl(p)}">${Math.round(p)}%</span>`;
 const R=E.map(x=>{const t=MS.map(m=>tq(x,m)||0),a=MS.map((m,i)=>i<n?act(x,m):null),yt=t.slice(0,n).reduce((s,v)=>s+v,0),ya=a.slice(0,n).reduce((s,v)=>s+v,0);return{x,t,a,yt,ya,ft:t.reduce((s,v)=>s+v,0)}});
 const tot={x:null,t:MS.map((m,i)=>R.reduce((s,r)=>s+r.t[i],0)),a:MS.map((m,i)=>i<n?R.reduce((s,r)=>s+r.a[i],0):null)};tot.yt=R.reduce((s,r)=>s+r.yt,0);tot.ya=R.reduce((s,r)=>s+r.ya,0);tot.ft=R.reduce((s,r)=>s+r.ft,0);
 const rows=[...R,...(R.length>1?[tot]:[])],nm=r=>r.x?esc(pname(r.x)):'<b>Team total</b>';
 const ytd=`<table><tr><th>Marketing person</th><th>Target Apr–${mlab}</th><th>Actual Apr–${mlab}</th><th>Achieved</th><th>FY ${fy} target</th></tr>${rows.map(r=>`<tr><td>${nm(r)}</td><td>${nf(r.yt)}</td><td>${nf(r.ya)}</td><td>${cell(pct(r.ya,r.yt))}</td><td>${nf(r.ft)}</td></tr>`).join('')}</table>`;
 if(compact)return `<div class="card tw"><h2>Tons target vs actual — FY ${fy}, Apr to ${mlab}</h2>${ytd}<small>Targets entered in kg on the Targets screen, shown in tons; actual = customerwise sales. Month-wise: <a href="#" data-go="sana:">Sales analysis</a>.</small></div>`;
 const mon=`<table class="tva"><tr><th>Marketing person</th>${MS.map((m,i)=>`<th>${CWS.MLAB[i]}-${m.slice(2,4)}</th>`).join('')}</tr>${rows.map(r=>`<tr><td>${nm(r)}</td>${MS.map((m,i)=>`<td><small>T ${nf(r.t[i])}</small><br>${r.a[i]==null?'<small class="bad">pending upload</small>':`<small>A ${nf(r.a[i])}</small><br>${cell(pct(r.a[i],r.t[i]))}`}</td>`).join('')}</tr>`).join('')}</table>`;
 return `<div class="card tw"><h2>Tons target vs actual — FY ${fy}</h2>${ytd}<h3>Month by month (T = target, A = actual, in tons)</h3>${mon}<small><span class="pc pg">≥100%</span> <span class="pc pa">90–99%</span> <span class="pc pr">&lt;90%</span> · Targets entered in kg on the Targets screen, shown in tons; actual = customerwise sales file.</small></div>`};
// ---------- wiring: Import/Export (HR Admin), "Sales uploads" tab (upload permission without Import/Export), Sales analysis, dashboard
{const ov=window.VIEWS.io,ob=window.bind_io;window.VIEWS={...window.VIEWS,io:()=>cwsCard()+ov()};window.bind_io=()=>{ob&&ob();bind_cws()}}
window.VIEWS.supl=()=>can(U,'io_sales')?cwsCard()+(window.regCard?regCard():''):'<p>Not available for your role.</p>';
window.bind_supl=()=>{bind_cws();window.bind_reg&&bind_reg()};
{const ov=window.VIEWS.sales,ob=window.bind_sales;if(ov){window.VIEWS.sales=()=>cwsSalesCard()+ov();window.bind_sales=()=>{ob&&ob();const f=$('#cwsfy');if(f)f.onchange=()=>{CA.fy=f.value;render()}}}}
{const os=window.VIEWS.sana,ob=window.bind_sana;window.VIEWS.sana=()=>{const sl=can(U,'full')||can(U,'sales_view')||U.role==='marketing';const RF=[...new Set((D.sales_lines||[]).map(l=>fyOfM(l.month)))].sort();return cwsAnalysisHtml()+(sl?'<h2 style="margin-top:24px">Sales value (Tally register)</h2>'+(RF.length&&can(U,'cws_view')?`<p><small>The Tally sales register (₹ value) is uploaded for ${RF.map(f=>'FY '+f).join(', ')} only. Tons for later years is in the customerwise section above.</small></p>`:'')+os():'')};
 window.bind_sana=()=>{const sl=can(U,'full')||can(U,'sales_view')||U.role==='marketing';if(sl&&ob)ob();bindCA()}}
{const ot=window.histTabs;window.histTabs=()=>{const t=ot();if(can(U,'cws_view')&&!t.some(x=>x[0]==='sana'))t.push(['sana','Sales analysis']);if(can(U,'io_sales')&&!can(U,'io'))t.push(['supl','Sales uploads']);return t}}
{const oc=window.chartsHtml;window.chartsHtml=()=>dashCard()+(oc?oc():'');const ob=window.bind_dash;window.bind_dash=()=>{ob&&ob();drawDash()}}
})();
