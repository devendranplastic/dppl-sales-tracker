// Sales vs target charts (MD/CEO/HR Admin: all marketing; marketing: own) + Expenses placeholder.
let chMonth='';const charts={};
const monthsBack=n=>{const r=[],d=new Date();for(let i=n-1;i>=0;i--)r.push(ymd(new Date(d.getFullYear(),d.getMonth()-i,15)).slice(0,7));return r};
const hasSL=m=>(D.sales_lines||[]).some(l=>l.month===m);
function achieved(x,m){if(hasSL(m))return (D.sales_lines||[]).filter(l=>l.month===m&&!l.is_common&&l.exec_id===x).reduce((a,l)=>a+(+l.value||0),0);
 const o=(D.orders||[]).filter(o=>o.owner_id===x&&o.released&&(o.released_at||'').startsWith(m)).reduce((a,o)=>a+(+o.po_qty||0)*(+o.po_price||0),0);
 const w=D.enquiries.filter(e=>e.owner_id===x&&e.stage==='Won'&&(e.won_at||'').startsWith(m)&&!(D.orders||[]).some(o=>o.enquiry_id===e.id)).reduce((a,e)=>a+(+e.value||0),0);return o+w}
const commonAch=m=>(D.sales_lines||[]).filter(l=>l.month===m&&(l.is_common||!l.exec_id)).reduce((a,l)=>a+(+l.value||0),0);
const targetOf=(x,m)=>{const t=(D.targets||[]).find(t=>t.exec_id===x&&t.period===m);if(t&&t.sales_value)return +t.sales_value;const q=(D.targets||[]).find(t=>t.exec_id===x&&t.period===qOf(m));return q&&q.sales_value?+q.sales_value/3:0};
const chartExecs=()=>can(U,'full')?(D.profiles||[]).filter(p=>(p.role==='marketing'||(p.caps||[]).includes('sales_person'))&&p.active!==false).map(p=>p.id):[ME()];
window.chartsHtml=()=>{if(!(can(U,'full')||U.role==='marketing'))return'';if(!(D.sales_lines||[]).length&&!(D.targets||[]).some(t=>+t.sales_value)&&!(D.orders||[]).some(o=>o.released)&&!(D.enquiries||[]).some(e=>e.stage==='Won'))return''; // ₹ view only once there is ₹ data (ERP upload, ₹ targets, orders or won enquiries)
const M=[...new Set([...monthsBack(12),...(D.sales_uploads||[]).map(u=>u.month)])].sort().reverse();if(!chMonth)chMonth=(window.lastUpload&&lastUpload()?.month)||[...new Set((D.sales_lines||[]).map(l=>l.month))].sort().pop()||M[0];
 const E=chartExecs(),rows=E.map(x=>({x,t:targetOf(x,chMonth),a:achieved(x,chMonth)}));const tt=rows.reduce((s,r)=>s+r.t,0),ta=rows.reduce((s,r)=>s+r.a,0)+(can(U,'full')?commonAch(chMonth):0);
 return `<div class="card"><div class="grid"><div><h2 style="margin:0">Sales vs target ${can(U,'full')?'— marketing team':'— my performance'}</h2><small>${hasSL(chMonth)?'Actual ERP sales':'No ERP upload for this month — based on released orders / won enquiries'}</small></div>
 <div><label>Month</label><select id="chm">${M.map(m=>`<option ${m===chMonth?'selected':''}>${m}</option>`).join('')}</select></div></div>
 <div class="grid">${rows.map(r=>`<div class="card">${esc(pname(r.x))}<div class="kpi">${r.t?Math.round(r.a/r.t*100)+'%':'—'}</div><small>${inr(Math.round(r.a))} of ${r.t?inr(Math.round(r.t)):'no target'}</small></div>`).join('')}
 ${can(U,'full')?`<div class="card">Company total${commonAch(chMonth)?' <small>(incl. common '+inr(Math.round(commonAch(chMonth)))+')</small>':''}<div class="kpi">${tt?Math.round(ta/tt*100)+'%':'—'}</div><small>${inr(Math.round(ta))} of ${tt?inr(Math.round(tt)):'no target'}</small></div>`:''}</div>
 <div style="position:relative;height:300px"><canvas id="chBar" aria-label="Target vs achieved bar chart"></canvas></div><h3>Month-on-month achieved</h3><div style="position:relative;height:260px"><canvas id="chTrend" aria-label="Monthly trend chart"></canvas></div></div>`};
const COLORS=['#E31E24','#1F2A5A','#6D6E71','#F28C28','#2E8B57','#8E44AD','#0097A7'];
window.drawCharts=()=>{if(!window.Chart||!$('#chBar'))return;Object.values(charts).forEach(c=>c.destroy());const E=chartExecs(),full=can(U,'full');
 const labels=[...E.map(pname),...(full?['Common orders','Company total']:[])],T=E.map(x=>targetOf(x,chMonth)),Ach=E.map(x=>achieved(x,chMonth));
 if(full){const c=commonAch(chMonth);T.push(0,T.reduce((a,b)=>a+b,0));Ach.push(c,Ach.reduce((a,b)=>a+b,0)+c)}
 const pct=Ach.map((a,i)=>T[i]?Math.round(a/T[i]*100):null);const fmt=v=>'₹'+Number(v).toLocaleString('en-IN');
 charts.bar=new Chart($('#chBar'),{data:{labels,datasets:[{type:'bar',label:'Target',data:T,backgroundColor:'#C9CCD6',yAxisID:'y'},{type:'bar',label:'Achieved',data:Ach,backgroundColor:'#E31E24',yAxisID:'y'},{type:'line',label:'Achievement %',data:pct,borderColor:'#1F2A5A',backgroundColor:'#1F2A5A',yAxisID:'p',tension:.2}]},
  options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true,ticks:{callback:v=>fmt(v)}},p:{position:'right',beginAtZero:true,suggestedMax:120,grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='p'?` ${c.raw??'—'}%`:` ${c.dataset.label}: ${fmt(c.raw)}`}}}}});
 const MS=(()=>{const y=+chMonth.slice(0,4),m=+chMonth.slice(5,7);return [...Array(12)].map((_,i)=>{const d=new Date(y,m-12+i,15);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')})})();charts.trend=new Chart($('#chTrend'),{type:'line',data:{labels:MS,datasets:[...E.map((x,i)=>({label:pname(x),data:MS.map(m=>achieved(x,m)),borderColor:COLORS[i%COLORS.length],backgroundColor:COLORS[i%COLORS.length],tension:.2})),
  ...(full?[{label:'Company total',data:MS.map(m=>E.reduce((a,x)=>a+achieved(x,m),0)+commonAch(m)),borderColor:'#000',borderDash:[6,4],tension:.2}]:[])]},options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{beginAtZero:true,ticks:{callback:v=>fmt(v)}}}}})};
{const ob=window.bind_dash;window.bind_dash=()=>{ob&&ob();const s=$('#chm');if(s)s.onchange=()=>{chMonth=s.value;render()};drawCharts()}}
// ---- Expenses (future)
function expV(){return `<div class="card" style="text-align:center"><h2>Expenses <span class="tag risk">Future</span></h2><p style="font-size:20px">🚧 Under construction — coming soon</p></div>
<div class="card"><h2>Planned features</h2><ul><li><b>Expense claims</b> — marketing executives submit travel, fuel, food, lodging and customer-visit expenses with bill photos, linked to their daily visits.</li>
<li><b>Approvals</b> — reporting manager / MD approval with comments; Accounts marks claims as paid.</li><li><b>Policy limits</b> — per-day / per-km limits by role, flagged automatically.</li>
<li><b>Month-on-month review</b> — expense per executive by month, expense vs sales ratio, and trend charts on the MD dashboard.</li><li><b>Export</b> — monthly expense statement for payroll / ERP.</li></ul><p><small>This menu item is a placeholder; no expense data is collected yet.</small></p></div>`}
window.VIEWS={...(window.VIEWS||{}),exp:expV};
