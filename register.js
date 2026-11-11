// Sales register (all-in-one): Bala's Tally "Sales" export (Date, Particulars, Inv No, GSTIN/UIN, Varient, Quantity, Rate, Value, Gross Total, CGST, SGST, IGST, Freight, TCS, Rounded Off)
// + optional Marketing Person, Sales Order No, SKU Code. One file -> customers (by GSTIN), product variants, invoices (per Inv No) and sales lines for analysis.
// The parser below is plain JS so the same code runs in the browser and in Node (used for the historical FY24-25 load).
(function(G){
const nk=s=>String(s??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const FIELDS=[ // [field, template header, aliases (normalised), required]
 ['date','Date',['date','invoicedate','invdate','voucherdate','billdate','vchdate'],1],
 ['customer','Particulars',['particulars','customer','customername','partyname','party','client','clientname','buyer','partyaccount'],1],
 ['inv_no','Inv No',['invno','invoiceno','invoicenumber','voucherno','vchno','billno','invoice'],1],
 ['gstin','GSTIN/UIN',['gstinuin','gstin','gstno','gstnumber','customergstin','partygstin','gstinuinofparty'],0],
 ['variant','Varient',['varient','variant','product','productcategory','item','itemname','stockitem','category','productvariant'],0],
 ['qty','Quantity',['quantity','qty','qtykg','quantitykg','kg','billedquantity'],0],
 ['rate','Rate',['rate','rateperkg','price','unitprice'],0],
 ['value','Value',['value','taxablevalue','taxable','basicvalue','netvalue','assessablevalue','salesvalue'],1],
 ['gross_total','Gross Total',['grosstotal','invoicevalue','invoicetotal','total','grossamount','invoiceamount'],0],
 ['cgst','CGST',['cgst','cgstamount','centraltax'],0],['sgst','SGST',['sgst','sgstamount','statetax','utgst'],0],['igst','IGST',['igst','igstamount','integratedtax'],0],
 ['freight','Freight',['freight','freightcharges','freightamount'],0],['tcs','TCS',['tcs','tcsamount','tcsonsales'],0],['round_off','Rounded Off',['roundedoff','roundoff','rounding','roundingoff'],0],
 ['exec','Marketing Person',['marketingperson','marketingexecutive','marketing','salesperson','salesexecutive','executive','salesman','exec'],0],
 ['so_no','Sales Order No',['salesorderno','sono','salesorder','orderno','sonumber','ordernumber','salesordernumber'],0],
 ['sku_code','SKU Code',['skucode','sku'],0],['customer_code','Customer Code',['customercode','partycode','ledgercode'],0],
 ['remarks','Remarks',['remarks','remark','notes','narration'],0]];
const NUM=['qty','rate','value','gross_total','cgst','sgst','igst','freight','tcs','round_off'];
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const p2=n=>String(n).padStart(2,'0');
function toISO(v){if(v==null||v==='')return null;
 if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${p2(v.getMonth()+1)}-${p2(v.getDate())}`;
 if(typeof v==='number'){if(v<20000||v>80000)return null;const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*864e5);return d.toISOString().slice(0,10)}
 const s=String(v).trim();let m;
 if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
 if((m=s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})$/))){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${p2(m[2])}-${p2(m[1])}`}
 if((m=s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3})[A-Za-z]*[\/\-. ,]+(\d{2,4})$/))&&MON[m[2].toLowerCase()]){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`}
 return null}
function num(v){if(v==null)return null;if(typeof v==='number')return isFinite(v)?v:null;const s=String(v).replace(/[₹,\s]/g,'');if(s===''||s==='-'||s==='—')return null;
 const neg=/^\(.*\)$/.test(s)||/Cr$/i.test(s);const n=parseFloat(s.replace(/[()]/g,'').replace(/(Dr|Cr)$/i,''));return isNaN(n)?NaN:(neg?-Math.abs(n):n)}
const r2=n=>n==null?null:Math.round(n*100)/100;
function category(v){const s=String(v||'');if(!s.trim())return'Other';
 if(/scrap/i.test(s))return'Scrap';
 if(/vehicle|wheeler|fork.?lift|monitor|machinery|eicher|\btn\s?\d{2}\b|battery/i.test(s))return'Asset sale';
 if(/printing\s*(plate|cylinder)/i.test(s))return'Plates & cylinders';
 if(/lldpe|master\s*batch|tie\s*resin|solvent|pet\s*chemical|resin|granule/i.test(s))return'Raw material trading';
 if(/plastic\s*bar+el/i.test(s))return'Plastic barrel';
 if(/job\s*work/i.test(s))return'Job work';
 return'Packaging'}
const CATS=['Packaging','Plastic barrel','Plates & cylinders','Raw material trading','Scrap','Job work','Asset sale','Other'];
const CANCEL=/^\s*\(?\s*cancel+(ed)?\b\s*\)?\s*[-:]?\s*/i;
function cleanName(s){let t=String(s||'').trim();const c=CANCEL.test(t);if(c){t=t.replace(CANCEL,'').trim();t=t.replace(/^\((.*)\)$/,'$1').replace(/^[-:\s]+/,'').trim();if(/^\(.*\)$/.test(t))t=t.slice(1,-1)}return{name:t.replace(/\s+/g,' '),cancelled:c}}
// find the header row (Tally exports may have company-name/title rows on top)
function findHeader(aoa){let best=null;for(let i=0;i<Math.min(aoa.length,25);i++){const row=aoa[i]||[],map={};let hits=0;
  row.forEach((h,j)=>{const k=nk(h);if(!k)return;for(const [f,,al] of FIELDS){if(map[f]!=null)continue;if(al.includes(k)||(['cgst','sgst','igst','tcs'].includes(f)&&k.startsWith(f))){map[f]=j;hits++;break}}});
  if(map.date!=null&&map.inv_no!=null&&map.customer!=null&&(!best||hits>best.hits))best={row:i,map,hits,headers:row.map(h=>h==null?'':String(h))}}return best}
function parse(aoa,opt={}){const H=findHeader(aoa);if(!H)return{error:'Could not find the header row. The first rows must include Date, Particulars (customer) and Inv No columns.'};
 const missing=FIELDS.filter(f=>f[3]&&H.map[f[0]]==null).map(f=>f[1]);if(missing.length)return{error:'Missing required column(s): '+missing.join(', '),header:H};
 const used=new Set(Object.values(H.map)),extra=H.headers.map((h,j)=>j).filter(j=>!used.has(j));
 const rows=[],skipped=[],errors=[],warnings=[],seenInv={};
 for(let i=H.row+1;i<aoa.length;i++){const a=aoa[i]||[],src=i+1,get=f=>H.map[f]==null?null:a[H.map[f]];
  if(!a.some(v=>v!=null&&String(v).trim()!==''))continue;
  const r={src_row:src};for(const [f] of FIELDS)r[f]=get(f);
  for(const f of ['customer','inv_no','gstin','variant','exec','so_no','sku_code','customer_code','remarks'])r[f]=r[f]==null?null:String(r[f]).trim()||null;
  const ex=extra.map(j=>a[j]).filter(v=>v!=null&&String(v).trim()!==''&&String(v).trim()!=='-').map(String);if(ex.length)r.remarks=[r.remarks,...ex].filter(Boolean).join('; ');
  if([r.customer,r.inv_no].some(v=>/^EXAMPLE\b/i.test(v||''))){skipped.push({row:src,reason:'Example row from the template',customer:r.customer,inv_no:r.inv_no});continue}
  if(/^(grand\s*)?total\b/i.test(r.customer||'')||(!r.inv_no&&!r.customer)){skipped.push({row:src,reason:'Total / blank row',customer:r.customer});continue}
  if(!r.inv_no){skipped.push({row:src,reason:'No Inv No — not a sales invoice (journal entry)',customer:r.customer,variant:r.variant,value:num(get('value'))});continue}
  r.inv_date=toISO(r.date);delete r.date;if(!r.inv_date){errors.push({row:src,inv_no:r.inv_no,issue:'Date not recognised: '+get('date')});continue}
  let bad=false;for(const f of NUM){const n=num(r[f]);if(Number.isNaN(n)){errors.push({row:src,inv_no:r.inv_no,issue:`${f} is not a number: ${r[f]}`});bad=true}r[f]=Number.isNaN(n)?null:n}if(bad)continue;
  const cn=cleanName(r.customer);r.customer=cn.name;r.cancelled=cn.cancelled&&!r.value;
  if(cn.cancelled&&r.value)warnings.push({row:src,inv_no:r.inv_no,issue:'Marked cancelled but has a value — imported as a normal invoice'});
  if(!r.cancelled&&r.value==null){errors.push({row:src,inv_no:r.inv_no,issue:'Value missing'});continue}
  if(!r.cancelled&&!r.customer){errors.push({row:src,inv_no:r.inv_no,issue:'Customer (Particulars) missing'});continue}
  r.credit_note=/(^|\/)CN\//i.test(r.inv_no)||(r.value||0)<0;
  if(r.credit_note){if(r.value>0){r.value=-r.value;warnings.push({row:src,inv_no:r.inv_no,issue:'Credit note with positive Value — stored as negative'})}
   if(r.qty>0)r.qty=-r.qty;if(r.gross_total>0){r.gross_total=-r.gross_total;warnings.push({row:src,inv_no:r.inv_no,issue:'Credit note Gross Total was positive in the file — stored as negative'})}}
  if(r.gstin)r.gstin=r.gstin.toUpperCase().replace(/\s/g,'');
  if(r.gstin&&!/^\d{2}[A-Z0-9]{10}[0-9A-Z]{3}$/.test(r.gstin))warnings.push({row:src,inv_no:r.inv_no,issue:'GSTIN looks unusual: '+r.gstin});
  r.category=category(r.variant);for(const f of NUM)r[f]=r[f]==null?null:Math.round(r[f]*10000)/10000;
  const k=r.inv_no.toLowerCase();const s=seenInv[k];
  if(s){if(s.date!==r.inv_date||nk(s.cust)!==nk(r.customer))warnings.push({row:src,inv_no:r.inv_no,issue:`Same Inv No also on row ${s.row} with a different date/customer — kept as one invoice`});s.n++;r.line_no=s.n}else{seenInv[k]={row:src,date:r.inv_date,cust:r.customer,n:1};r.line_no=1}
  rows.push(r)}
 const months={};rows.forEach(r=>{(months[r.inv_date.slice(0,7)]=months[r.inv_date.slice(0,7)]||[]).push(r)});
 return{header:H,rows,skipped,errors,warnings,months,stats:stats(rows),mapping:FIELDS.map(([f,l])=>({field:f,label:l,column:H.map[f]==null?null:H.headers[H.map[f]]}))}}
function stats(rows){const live=rows.filter(r=>!r.cancelled),inv={},cust={},vari={},by=(k,f)=>{const o={};live.forEach(r=>{const key=k(r);o[key]=o[key]||{value:0,qty:0,lines:0,inv:new Set()};o[key].value+=r.value||0;o[key].qty+=r.qty||0;o[key].lines++;o[key].inv.add(r.inv_no.toLowerCase())});return o};
 rows.forEach(r=>{(inv[r.inv_no.toLowerCase()]=inv[r.inv_no.toLowerCase()]||[]).push(r)});live.forEach(r=>{cust[r.gstin||nk(r.customer)]=r.customer;if(nk(r.variant))vari[nk(r.variant)]=r.variant});
 const I=Object.values(inv);
 return{lines:live.length,invoices:I.length,multiLine:I.filter(a=>a.length>1).length,creditNotes:I.filter(a=>a.some(r=>r.credit_note)).length,cancelled:I.filter(a=>a.every(r=>r.cancelled)).length,
  customers:Object.keys(cust).length,customerNames:new Set(live.map(r=>nk(r.customer))).size,variants:Object.keys(vari).length,noQty:live.filter(r=>r.qty==null).length,
  value:r2(live.reduce((a,r)=>a+(r.value||0),0)),creditValue:r2(live.filter(r=>r.credit_note).reduce((a,r)=>a+(r.value||0),0)),qty:r2(live.reduce((a,r)=>a+(r.qty||0),0)),
  gross:r2(live.reduce((a,r)=>a+(r.gross_total||0),0)),cgst:r2(live.reduce((a,r)=>a+(r.cgst||0),0)),sgst:r2(live.reduce((a,r)=>a+(r.sgst||0),0)),igst:r2(live.reduce((a,r)=>a+(r.igst||0),0)),
  withExec:live.filter(r=>r.exec).length,dateFrom:rows.reduce((a,r)=>!a||r.inv_date<a?r.inv_date:a,null),dateTo:rows.reduce((a,r)=>!a||r.inv_date>a?r.inv_date:a,null),
  byMonth:by(r=>r.inv_date.slice(0,7)),byCategory:by(r=>r.category),byVariant:by(r=>r.variant||'(blank)'),byCustomer:by(r=>r.customer)}}
// pick the sheet that looks like a register; returns parse() result + sheet name
function readWorkbook(XLSX,wb){let first=null;for(const n of wb.SheetNames){const aoa=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null,blankrows:false});const p=parse(aoa);p.sheet=n;if(!p.error)return p;first=first||p}return first||{error:'Empty workbook'}}
const payload=rows=>rows.map(r=>({src_row:r.src_row,inv_no:r.inv_no,inv_date:r.inv_date,customer:r.customer,gstin:r.gstin,customer_code:r.customer_code,variant:r.variant,category:r.category,qty:r.qty,rate:r.rate,value:r.value,
 gross_total:r.gross_total,cgst:r.cgst,sgst:r.sgst,igst:r.igst,freight:r.freight,tcs:r.tcs,round_off:r.round_off,exec:r.exec,so_no:r.so_no,sku_code:r.sku_code,remarks:r.remarks,cancelled:!!r.cancelled,credit_note:!!r.credit_note,line_no:r.line_no}));
const HEAD=['Date','Particulars','Inv No','GSTIN/UIN','Varient','Quantity','Rate','Value','Gross Total','CGST','SGST','IGST','Freight','TCS','Rounded Off','Marketing Person','Sales Order No','SKU Code','Remarks'];
const EXAMPLES=[
 ['01-04-2025','EXAMPLE - Sri Mahalakshmi Dairy Pvt. Ltd.','EXAMPLE/DP/1/25-26','33ABCCS2484C1ZN','Milk',669.66,161.33,108036.24,127483,9723.27,9723.27,'','','','',  'nathan@devendranplastic.com','SO/25-26/001','MILK-500ML','EXAMPLE row - delete before upload'],
 ['01-04-2025','EXAMPLE - BOND POLYMERS','EXAMPLE/DP/2/25-26','33CFBPS1660E1ZR','Scrap',3568.8,14.93,53264.92,63482,4793.84,4793.84,'','',629,0.4,'','','','EXAMPLE row - blank Marketing Person = common / customer owner'],
 ['03-04-2025','EXAMPLE - Tvarur Oils & Fats Private Limited','EXAMPLE/DPPL/CN/1/25-26','33AAECT7561Q1ZP','Barrier-Oil',69.4,192.5,-13359.5,-15764,-1202.36,-1202.36,'','','','',  'Jesaon','','','EXAMPLE credit note - negative Value']];
const REG={nk,FIELDS,toISO,num,category,CATS,cleanName,findHeader,parse,readWorkbook,payload,stats,HEAD,EXAMPLES};
if(typeof module!=='undefined'&&module.exports)module.exports=REG;else G.REG=REG;
})(typeof window!=='undefined'?window:globalThis);
