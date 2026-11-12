// Customerwise monthly sales (Bala's "Customerwise Sales Details" sheet): S.No, Name (marketing person), Product, Customer Name, Apr..Mar (kg), Total, Average.
// One sheet = one financial year (sheet "25-26" or title "... 2025-26"). Plain JS: runs in the browser and in Node (used for the live load / tests).
(function(G){
const nk=s=>String(s??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const MONTHS=[['apr',4],['may',5],['jun',6],['jul',7],['aug',8],['sep',9],['oct',10],['nov',11],['dec',12],['jan',1],['feb',2],['mar',3]];
const MLAB=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
// month headers may also be real dates (Excel date cells "Apr-25"): Date objects, Excel serial numbers or ISO / dd-mm-yyyy text
const hdrDate=h=>{if(h instanceof Date&&!isNaN(h))return{y:h.getFullYear(),m:h.getMonth()+1};if(typeof h==='number'&&h>=36526&&h<73051&&Math.abs(h-Math.round(h))<1e-6){const d=new Date(Math.round((h-25569)*864e5));return{y:d.getUTCFullYear(),m:d.getUTCMonth()+1}}
 const t=String(h??'').trim();let m=t.match(/^(20\d{2})[-\/.](\d{1,2})[-\/.]\d{1,2}(?:[ T].*)?$/);if(m)return{y:+m[1],m:+m[2]};m=t.match(/^\d{1,2}[-\/.](\d{1,2})[-\/.](20\d{2})$/);if(m)return{y:+m[2],m:+m[1]};return null};
const monIdx=h=>{const d=hdrDate(h);if(d){if(d.m<1||d.m>12)return -1;return MONTHS.findIndex(([,mm])=>mm===d.m)}const k=nk(h).replace(/\d+$/,'');if(!k||k.length<3)return -1;return MONTHS.findIndex(([m])=>k===m||(k.startsWith(m)&&['june','july','sept','april','march','august','october','november','december','january','february'].includes(k)))};
const COLS={sno:['sno','slno','serialno','no','sno.'],exec:['name','marketingperson','marketing','executive','salesperson','marketingexecutive','exec'],product:['product','productcategory','variant','varient','item'],customer:['customername','customer','party','partyname','client','clientname','particulars'],total:['total','fytotal','yeartotal'],avg:['average','avg','monthlyaverage']};
// "25-26" | "2025-26" | "FY 2025-2026" -> "2025-26"
function fyFrom(s){const t=String(s||'');let m=t.match(/(20\d{2})\s*[-\/–]\s*(20)?(\d{2})(?!\d)/);if(m){const y=+m[1],e=+m[3];if((y+1)%100===e)return `${y}-${String(e).padStart(2,'0')}`}
 m=t.match(/(?:^|[^\d])(\d{2})\s*[-\/–]\s*(\d{2})(?!\d)/);if(m){const a=+m[1],b=+m[2];if((a+1)%100===b)return `20${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`}return null}
const fyMonths=fy=>{const y=+fy.slice(0,4);return MONTHS.map(([,mm])=>`${mm>=4?y:y+1}-${String(mm).padStart(2,'0')}`)};
function num(v){if(v==null)return null;if(typeof v==='number')return isFinite(v)?v:null;const s=String(v).replace(/[,\s₹]/g,'');if(s===''||/^[-–—]+$/.test(s)||/^n\/?a$/i.test(s))return null;const n=parseFloat(s.replace(/[()]/g,''));return isNaN(n)?NaN:(/^\(.*\)$/.test(s)?-n:n)}
function findHeader(aoa){for(let i=0;i<Math.min(aoa.length,15);i++){const row=aoa[i]||[],map={},mon={};row.forEach((h,j)=>{const k=nk(h);if(!k)return;const mi=monIdx(h);if(mi>=0&&mon[mi]==null){mon[mi]=j;return}for(const [f,al] of Object.entries(COLS))if(map[f]==null&&al.includes(k)){map[f]=j;break}});
  if(map.customer!=null&&Object.keys(mon).length>=1){let fy=null;for(const [mi,j] of Object.entries(mon)){const d=hdrDate(row[j]);if(d){const y=d.m>=4?d.y:d.y-1;fy=`${y}-${String((y+1)%100).padStart(2,'0')}`;break}}
   return{row:i,map,mon,fy,headers:row.map(h=>{const d=hdrDate(h);return d?MLAB[MONTHS.findIndex(([,mm])=>mm===d.m)]+'-'+String(d.y).slice(2):h==null?'':String(h)})}}}return null}
const r4=n=>Math.round(n*10000)/10000;
// aoa = array of rows; opt.fy overrides; opt.sheet/opt.file give hints for the FY
function parse(aoa,opt={}){const H=findHeader(aoa);if(!H)return{error:'Header row not found. It needs Customer Name and month columns (Apr, May, …), e.g. S.No | Name | Product | Customer Name | Apr … Mar | Total.'};
 let title='';for(let i=0;i<H.row;i++)title+=' '+(aoa[i]||[]).filter(v=>v!=null).join(' ');
 const fyAuto=fyFrom(opt.sheet)||fyFrom(title)||H.fy||fyFrom(opt.file);const fy=opt.fy||fyAuto;
 const MS=fy?fyMonths(fy):null,rows=[],skipped=[],warnings=[],errors=[],lines=[];let fileTotal=null;
 const monCols=Object.entries(H.mon).map(([i,j])=>[+i,j]).sort((a,b)=>a[0]-b[0]);
 for(let i=H.row+1;i<aoa.length;i++){const a=aoa[i]||[],src=i+1,g=f=>H.map[f]==null?null:a[H.map[f]],s=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
  if(!a.some(v=>v!=null&&String(v).trim()!==''))continue;
  const cust=s(g('customer')),exec=s(g('exec')),prod=s(g('product'));
  if(/^EXAMPLE\b/i.test(cust)||/^EXAMPLE\b/i.test(exec)){skipped.push({row:src,reason:'Example row from the template',customer:cust});continue}
  if(!cust){const q=monCols.reduce((t,[,j])=>t+(num(a[j])||0),0);if(!exec&&!prod&&q){fileTotal={row:src,qty:r4(q),total:num(g('total'))};skipped.push({row:src,reason:'Grand total row (used to cross-check)',qty:q})}else skipped.push({row:src,reason:'No customer name',customer:exec||prod});continue}
  if(/^(grand\s*)?(sub\s*)?total\b/i.test(cust)||/^(grand\s*)?(sub\s*)?total\b/i.test(exec)){skipped.push({row:src,reason:'Total row',customer:cust});continue}
  const line={src_row:src,exec:exec||null,product:prod||null,customer:cust,months:{},total:0};let bad=false;
  for(const [mi,j] of monCols){const n=num(a[j]);if(Number.isNaN(n)){errors.push({row:src,customer:cust,issue:`${MLAB[mi]} is not a number: ${a[j]}`});bad=true;continue}if(n==null||n===0)continue;line.months[mi]=r4(n);line.total+=n}
  if(bad)continue;line.total=r4(line.total);
  const ft=num(g('total'));if(ft!=null&&!Number.isNaN(ft)&&Math.abs(ft-line.total)>Math.max(6,Math.abs(ft)*0.001))  // CSV exports carry rounded (displayed) valueswarnings.push({row:src,customer:cust,issue:`Total column ${ft} ≠ sum of months ${line.total}`});
  if(!exec)warnings.push({row:src,customer:cust,issue:'No marketing person (Name) — stored as common / unassigned'});
  if(Object.values(line.months).some(v=>v<0))warnings.push({row:src,customer:cust,issue:'Negative quantity (return) kept as is'});
  lines.push(line);
  if(MS)for(const [mi,q] of Object.entries(line.months))rows.push({src_row:src,exec:line.exec,product:line.product,customer:cust,month:MS[mi],qty:q})}
 const sumQ=r4(rows.reduce((t,r)=>t+r.qty,0));
 if(fileTotal&&Math.abs(fileTotal.qty-sumQ)>Math.max(1,Math.abs(sumQ)*0.0001))warnings.push({row:fileTotal.row,customer:'(grand total)',issue:`Grand total row ${fileTotal.qty} ≠ sum of customer rows ${sumQ}`});
 const covered=MS?MS.filter(m=>rows.some(r=>r.month===m)):[];
 return{fy,fyAuto,title:title.trim(),header:H,monthCols:monCols.map(([mi])=>MLAB[mi]),rows,lines,skipped,warnings,errors,fileTotal,stats:stats(rows,lines),covered,error:fy?null:'Financial year not found in the sheet name or title — choose it below.'}}
function stats(rows,lines){const by=k=>{const o={};rows.forEach(r=>{const key=k(r)||'(blank)';o[key]=r4((o[key]||0)+r.qty)});return o};
 return{lines:lines.length,rows:rows.length,qty:r4(rows.reduce((t,r)=>t+r.qty,0)),customers:new Set(lines.map(l=>nk(l.customer))).size,byExec:by(r=>r.exec),byProduct:by(r=>r.product),byMonth:by(r=>r.month)}}
function readWorkbook(XLSX,wb,opt={}){const out=[];for(const n of wb.SheetNames){const aoa=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:false});if(!aoa.length)continue;const p=parse(aoa,{...opt,sheet:wb.SheetNames.length>1||!opt.file?n:n+' '+(opt.file||'')});if(p.header){p.sheet=n;p.aoa=aoa;out.push(p)}}return out}
// ---- customer name matching: "Tirumala Milk Products" ~ "TIRUMALA MILK PRODUCTS PVT LTD"
const STOP=new Set(['pvt','private','ltd','limited','lmited','llp','co','company','the','and','ms','india','inc','corporation','corp']);
function ckey(s){return String(s||'').toLowerCase().replace(/^\s*m\s*\/\s*s\.?\s*/,'').replace(/&/g,' and ').replace(/\(.*?\)/g,' ').replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w&&!STOP.has(w)).join('')}
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return m||n;const d=[];for(let i=0;i<=m;i++){d[i]=[i];for(let j=1;j<=n;j++)d[i][j]=i?0:j}
 for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){const c=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)}return d[m][n]} // with transpositions (Jeason ~ Jesaon)
// the parts of a file name worth trying: "MGM Oils Pvt Ltd/Maha Agro" -> "MGM Oils Pvt Ltd"; "KTV Health Food-Chennai" -> "KTV Health Food"
const variants=n=>{const s=String(n||''),v=[s];const a=s.split('/')[0];if(a!==s)v.push(a);const b=a.replace(/\s*[-–]\s*[^-–]*$/,'');if(b&&b!==a)v.push(b);return v};
// customers: [{id,name,name_aliases}] -> match(name) => {c, how} | null ; match.learn(name, c) remembers a decision for later rows
function matcher(customers){const ex={},keys=[];const add=(n,c)=>{const e=nk(n),k=ckey(n);if(e&&!ex[e])ex[e]=c;if(k&&k.length>=3)keys.push([k,c])};
 for(const c of customers)for(const n of [c.name,...(c.name_aliases||[])])add(n,c);
 const one=name=>{const e=nk(name);if(ex[e])return{c:ex[e],how:'exact'};const k=ckey(name);if(!k)return null;
  const same=new Set(keys.filter(x=>x[0]===k).map(x=>x[1]));if(same.size===1)return{c:[...same][0],how:'name'};if(same.size>1)return null;
  let best=null,amb=false;for(const [kk,c] of keys){let sc=null;const sh=k.length<kk.length?k:kk,lo=sh===k?kk:k;
   if(sh.length>=7&&lo.startsWith(sh))sc=60+40*sh.length/lo.length;                                   // longer legal name / branch suffix
   else if(k.length>=7&&kk.length>=7&&Math.abs(k.length-kk.length)<=2){const d=lev(k,kk);if(d<=Math.max(1,Math.floor(Math.max(k.length,kk.length)*0.08)))sc=95-d*5} // typos
   if(sc==null)continue;if(!best||sc>best.score){best={c,score:sc,how:'fuzzy'};amb=false}else if(sc===best.score&&best.c!==c)amb=true}
  return best&&!amb?best:null};
 const f=name=>{for(const v of variants(name)){const r=one(v);if(r)return r}return null};f.learn=(n,c)=>add(n,c);return f}
// marketing person: "Jeason" ~ Jesaon (profile full_name / email / emp code / saved alias)
function execMatcher(profiles,aliases){const P=(profiles||[]).filter(p=>(p.role==='marketing'||(p.caps||[]).includes('sales_person'))),A={};(aliases||[]).forEach(a=>A[a.alias]=a);
 return raw=>{const k=nk(raw);if(!k)return{common:true};if(A[k])return A[k].is_common?{common:true,how:'alias'}:{id:A[k].exec_id,how:'alias'};
  const hit=P.find(p=>[p.full_name,(p.email||'').split('@')[0],p.email,p.emp_code].some(v=>v&&nk(v)===k)||nk((p.full_name||'').split(/\s+/)[0])===k);if(hit)return{id:hit.id,how:'name'};
  const f=P.map(p=>({p,d:Math.min(...[p.full_name,(p.email||'').split('@')[0]].filter(Boolean).map(v=>lev(nk(v),k)))})).filter(x=>x.d<=Math.max(1,Math.floor(k.length/4))).sort((a,b)=>a.d-b.d);
  if(f.length&&(f.length===1||f[0].d<f[1].d))return{id:f[0].p.id,how:'fuzzy'};return{unmatched:true}}}
const HEAD=['S.No','Name','Product','Customer Name',...['Apr','May','June','July','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'],'Total','Average'];
const EXAMPLES=[[1,'EXAMPLE Balaji','Milk','EXAMPLE - Tirumala Milk Products',25825.8,44396.16,74899.82,30763.46,58296.3,27892.4,52423.76,47832.74,30319.9,52259.3,47362.6,37540.24,529812.48,44151.04],
 [2,'EXAMPLE Nathan','Lami-BOPA','EXAMPLE - Sunraja Oil Industries',41973.12,39638.5,36671.82,49541.22,46119.5,60395.5,43972.42,11570.34,50096.28,75774.08,37502.34,'','',''],
 [3,'EXAMPLE Jesaon','Nylon','EXAMPLE - New World Oil Industries',7020.64,4457.84,'-','','','','','','','','','','',''],
 ['','','','EXAMPLE NOTE - one row per marketing person + product + customer; quantity in kg; blank or "-" = no sale; Total & Average are optional (only cross-checked); delete EXAMPLE rows before upload']];
const CWS={nk,fyFrom,fyMonths,MLAB,num,parse,readWorkbook,ckey,lev,matcher,execMatcher,HEAD,EXAMPLES,stats};
if(typeof module!=='undefined'&&module.exports)module.exports=CWS;else G.CWS=CWS;
})(typeof window!=='undefined'?window:globalThis);
