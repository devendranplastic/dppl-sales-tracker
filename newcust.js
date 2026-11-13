// v1.9.0 (Bala t47u/t48u/t49u): marketing may type a NEW customer name in New enquiry, Visit report and Sample request.
// The database function new_customer_from_form creates it owned by the caller, flagged "needs review"; only info@ / HR Admin rename, merge or review it.
(function(){
const nk=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const canNew=()=>!!U&&(U.role==='marketing'||(U.caps||[]).includes('sales_person')||can(U,'cust')||(U.role==='data_entry'&&!!U.delegate_for));
const list=()=>D.customers.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const same=(c,n)=>nk(c.name)===n||(c.name_aliases||[]).some(a=>nk(a)===n);
// close matches among the customers this login can see (own list for marketing)
const close=name=>{const n=nk(name);if(n.length<3)return[];return list().map(c=>{const k=nk(c.name);let s=0;if(same(c,n))s=3;else if(k.length>=4&&(k.includes(n)||n.includes(k)))s=2;
  else{const w=String(name).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=4);if(w.length&&w.some(x=>k.includes(x)))s=1}return{c,s}}).filter(x=>x.s).sort((a,b)=>b.s-a.s).slice(0,4)};
const SRC={enquiry:'enquiry',visit:'visit report',sample:'sample request'};
window.NC={canNew,nk,close,SRC,
 // html for a customer picker with a "➕ New customer" option; p = unique prefix; o.blank = label of an optional empty choice
 picker(p,o={}){const nw=canNew();return `<div><label>Customer*</label><select name="customer_id" id="${p}cs" ${o.blank?'':'required'}>${o.blank?`<option value="">${esc(o.blank)}</option>`:''}${nw?`<option value="__new" ${o.sel==='__new'?'selected':''}>➕ New customer — type the name</option>`:''}${list().map(c=>`<option value="${c.id}" ${o.sel===c.id?'selected':''}>${esc(c.name)}${c.needs_review?' (pending review)':''}</option>`).join('')}</select>
  ${nw?'':(U.role==='marketing'?'<small>New customer? Contact info@devendranplastic.com</small>':'')}</div>
  ${nw?`<div data-nc="${p}" hidden class="ncbox"><label>New customer name*</label><input name="nc_name" id="${p}nn" autocomplete="off" placeholder="Company name as on their letterhead"><div id="${p}nd"></div><small>${U.role==='marketing'||(U.caps||[]).includes('sales_person')?'Added to <b>your</b> customers and sent to info@ for review — info@ can correct the name any time (e.g. during the sales upload).':'Created and owned by the executive you enter data for; info@ reviews it.'}</small></div>
  <div data-nc="${p}" hidden><label>Contact person</label><input name="nc_contact"></div><div data-nc="${p}" hidden><label>City</label><input name="nc_city"></div><div data-nc="${p}" hidden><label>Phone</label><input name="nc_mobile" inputmode="tel" pattern="[0-9+ ]{8,15}"></div>`:''}`},
 bind(p,onNew){const s=$('#'+p+'cs');if(!s)return;const box=[...document.querySelectorAll(`[data-nc="${p}"]`)],nn=$('#'+p+'nn'),nd=$('#'+p+'nd');
  const tog=()=>{const on=s.value==='__new';box.forEach(b=>b.hidden=!on);if(nn){nn.required=on;if(on)nn.focus()}onNew&&onNew(on)};s.onchange=tog;tog();
  if(nn)nn.oninput=()=>{const m=close(nn.value);nd.innerHTML=m.length?`<div class="warn"><b>${m[0].s===3?'Already in your list':'Did you mean'}:</b> ${m.map(x=>`<button type="button" class="lt ncuse" data-id="${x.c.id}">${esc(x.c.name)}</button>`).join(' ')}<br><small>Tap a name to use it${m[0].s===3?'':', or keep typing if it really is a new customer'}.</small></div>`:'';
   nd.querySelectorAll('.ncuse').forEach(b=>b.onclick=()=>{s.value=b.dataset.id;nn.value='';nd.innerHTML='';tog()})}},
 // returns {id,name,created} for the form's customer; creates the pending customer when "➕ New customer" is chosen
 async resolve(v,source){const id=v.customer_id;const cl=()=>{delete v.nc_name;delete v.nc_contact;delete v.nc_city;delete v.nc_mobile};
  if(id!=='__new'){cl();const c=D.customers.find(c=>c.id===id);return{id:id||null,name:c?c.name:'',created:false}}
  const name=String(v.nc_name||'').trim().replace(/\s+/g,' ');if(name.length<2)throw new Error('Type the new customer name');
  const ex=list().find(c=>same(c,nk(name)));if(ex){cl();return{id:ex.id,name:ex.name,created:false,existing:true}}
  let r;if(DB.mode==='Supabase'){const{data,error}=await sb.rpc('new_customer_from_form',{p_name:name,p_source:source,p_contact:v.nc_contact||null,p_city:v.nc_city||null,p_mobile:v.nc_mobile||null});if(error)throw error;r=data}
  else{const mgr=can(U,'cust')||can(U,'admin');const c=await DB.insert('customers',{name,mobile:v.nc_mobile||'',city:v.nc_city||'',contact:v.nc_contact||'',exec_id:ME(),source,created_by:U.id,needs_review:!mgr,name_aliases:[]});r={id:c.id,name,existing:false}}
  cl();return{id:r.id,name:r.name,created:!r.existing,existing:!!r.existing}},
 badge(c){if(!c||!c.needs_review)return'';const who=c.created_by?pname(c.created_by):'';return ` <span class="tag risk" title="${esc(c.review_note||'')}">${can(U,'cust')?'New from '+esc(SRC[c.source]||c.source||'form')+(who?' · '+esc(who):''):'Pending info@ review'}</span>`}};
})();
