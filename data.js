// Data layer: same async API over localStorage or Supabase.
const DEMO_USERS=[
 {id:'u-hr',email:'hr@dppl.demo',pw:'admin123',role:'hr_admin',name:'HR Admin'},
 {id:'u-md',email:'md@dppl.demo',pw:'md123',role:'md',name:'MD'},
 {id:'u-nathan',email:'nathan@dppl.demo',pw:'mkt123',role:'marketing',name:'Nathan'},{id:'u-jesaon',email:'jesaon@dppl.demo',pw:'mkt123',role:'marketing',name:'Jesaon'},{id:'u-suresh',email:'suresh@dppl.demo',pw:'mkt123',role:'marketing',name:'Suresh'},{id:'u-balaji',email:'balaji@dppl.demo',pw:'mkt123',role:'marketing',name:'Balaji',caps:['targets','broadcast']},
 {id:'u-info',email:'info@dppl.demo',pw:'info123',role:'data_entry',name:'Info (data entry)',delegate_for:'u-balaji',caps:['sales_import']},
 {id:'u-ramesh',email:'ramesh@dppl.demo',pw:'acc123',role:'accounts',name:'Ramesh (Accounts)'},
 {id:'u-costing',email:'costing@dppl.demo',pw:'cost123',role:'costing',name:'Costing'},
 {id:'u-factory',email:'factory@dppl.demo',pw:'view123',role:'factory_manager',name:'Factory Manager'},{id:'u-planning',email:'planning@dppl.demo',pw:'view123',role:'planning',name:'Planning'},{id:'u-dispatch',email:'dispatch@dppl.demo',pw:'view123',role:'dispatch',name:'Dispatch'}];
window.DEMO_USERS=DEMO_USERS;
const ROLE={hr_admin:{hist:1,actcost:1,dplan:1,dplan_edit:1,dplan_confirm:1,broadcast:1,sku:1,sample:1,artwork:1,art_lock:1,order:1,release:1,stage_all:1,dispatch:1,complaint:1,cmp_resolve:1,io:1,ops:1,admin:1,admin_view:1,full:1,edit:1,cost:1,margin:1,approve:1,spec:1,costedit:1,cust:1,visit:1,inc_all:1,coll:1},md:{broadcast:1,dplan:1,sku:1,sample:1,artwork:1,art_lock:1,order:1,release:1,stage_all:1,dispatch:1,complaint:1,cmp_resolve:1,io:1,ops:1,admin_view:1,coll:1,full:1,edit:1,cost:1,margin:1,approve:1,spec:1,costedit:1,cust:1,visit:1,inc_all:1},ceo:{broadcast:1,dplan:1,sku:1,sample:1,artwork:1,art_lock:1,order:1,release:1,stage_all:1,dispatch:1,complaint:1,cmp_resolve:1,io:1,ops:1,admin_view:1,coll:1,full:1,edit:1,cost:1,margin:1,approve:1,spec:1,costedit:1,cust:1,visit:1,inc_all:1},marketing:{dplan:1,sku:1,sample:1,artwork:1,order:1,complaint:1,ops:1,coll:1,edit:1,spec:1,cust:1,visit:1,inc_own:1},costing:{actcost:1,sample:1,ops:1,cost:1,margin:1,spec:1,costedit:1},factory_manager:{sample:1,cmp_resolve:1,stage:1,ops:1},accounts:{coll:1,acc:1,dplan:1,ops:1,sales_view:1},data_entry:{visit:1,cust:1,edit:1,de:1},planning:{dplan:1,dplan_edit:1,stage:1,ops:1},dispatch:{dplan:1,dplan_confirm:1,stage:1,dispatch:1,sample:1,ops:1}};
// capability flags (profiles.caps, set by HR Admin in Setup → Users) add permissions on top of the role
const CAPS={sales_import:{io_sales:1,cws_view:1},targets:{targets:1,sales_view:1,cws_view:1},broadcast:{broadcast:1}};
['hr_admin','md','ceo','accounts','marketing'].forEach(r=>ROLE[r].cws_view=1);ROLE.hr_admin.targets=1;ROLE.hr_admin.io_sales=1;
window.CAP_LIST=[['sales_import','Upload sales files (register + customerwise)'],['targets','Manage all marketing targets'],['broadcast','Message everyone']];
window.can=(u,p)=>!!(u&&((ROLE[u.role]||{})[p]||(u.caps||[]).some(c=>(CAPS[c]||{})[p])));
const TABLES=['customerwise_uploads','customerwise_sales','product_variants','sales_invoices','actual_costs','dispatch_plans','import_logs','customer_history','sales_uploads','sales_lines','exec_aliases','messages','message_recipients','skus','samples','artworks','orders','order_stages','dispatches','complaints','customers','enquiries','specs','costings','quotations','activities','tasks','audit_log'];
const cfg=window.DPPL_CONFIG||{};
const useSB=!!(cfg.USE_SUPABASE&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=useSB?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random();
const LS={
  _g(t){return JSON.parse(localStorage.getItem('dppl_'+t)||'[]')},_s(t,v){localStorage.setItem('dppl_'+t,JSON.stringify(v))},
  async list(t){return this._g(t)},
  async insert(t,r){const a=this._g(t);r={id:uid(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...r};a.push(r);this._s(t,a);return r},
  async update(t,id,p){const a=this._g(t);const i=a.findIndex(x=>x.id===id);a[i]={...a[i],...p,updated_at:new Date().toISOString()};this._s(t,a);return a[i]},
  async login(email,pw){email=email.trim().toLowerCase();const P=this._g('profiles'),pr=P.find(x=>x.email===email),a=DEMO_USERS.find(x=>x.email===email&&x.pw===pw)||(pr&&pr.demo_pw&&pr.demo_pw===pw?pr:null);if(!a)throw new Error('Invalid demo credentials');if(pr&&pr.active===false)throw new Error('This user is deactivated');const u={id:pr?.id||a.id,email,role:pr?.role||a.role,name:pr?.full_name||a.name,delegate_for:pr?pr.delegate_for:a.delegate_for,caps:(pr?pr.caps:a.caps)||[],must_change_password:!!(pr&&pr.must_change_password)};localStorage.setItem('dppl_user',JSON.stringify(u));return u},
  async logout(){localStorage.removeItem('dppl_user')},
  async changePassword(pw){const u=JSON.parse(localStorage.getItem('dppl_user'));const P=this._g('profiles'),p=P.find(x=>x.email===u.email);if(p){p.demo_pw=pw;p.must_change_password=false;this._s('profiles',P)}u.must_change_password=false;localStorage.setItem('dppl_user',JSON.stringify(u))},
  async user(){return JSON.parse(localStorage.getItem('dppl_user')||'null')}
};
LS.remove=async function(t,id){this._s(t,this._g(t).filter(x=>x.id!==id))};
LS.insertMany=async function(t,rows){const a=this._g(t),now=new Date().toISOString(),out=rows.map(r=>({id:uid(),created_at:now,updated_at:now,...r}));this._s(t,a.concat(out));return out};
LS.removeWhere=async function(t,f,v){this._s(t,this._g(t).filter(x=>x[f]!==v))};
const PAGED=['customerwise_sales','sales_lines','customers','skus','product_variants','customer_history','sales_uploads']; // > 1000 rows: page through (PostgREST max 1000 per request)
const SPLIT={costings:{t:'costing_margins',fk:'costing_id'},quotations:{t:'quotation_margins',fk:'quotation_id'}};
const nul=r=>{const o={};for(const k in r){if(k==='po_file_data'||k==='demo_pw')continue;o[k]=r[k]===''?null:r[k]}return o};
const SB={
  async remove(t,id){const{error}=await sb.from(t).delete().eq('id',id);if(error)throw error},
  async list(t){if(t==='sales_incentives'){const{data,error}=await sb.rpc('sales_incentives');if(error){console.warn(error.message);return[]}return data}
    if(t==='incentive_lines'){const{data,error}=await sb.rpc('incentive_lines');if(error){console.warn(error.message);return[]}return data}
    let data=[];if(PAGED.includes(t)){for(let f=0;;f+=1000){const{data:d,error}=await sb.from(t).select('*').order('id').range(f,f+999);if(error){console.warn(t,error.message);break}data=data.concat(d);if(d.length<1000)break}}
    else{const r=await sb.from(t).select('*');if(r.error){console.warn(t,r.error.message);return[]}data=r.data}
    if(SPLIT[t]){const s=SPLIT[t],{data:m}=await sb.from(s.t).select('*');const mp=Object.fromEntries((m||[]).map(x=>[x[s.fk],x.margin_pct]));data.forEach(r=>r.margin_pct=mp[r.id]??null)}return data},
  async insert(t,r){r=nul(r);const mg=r.margin_pct;delete r.margin_pct;if(t==='quotations'){delete r.needs_approval;delete r.revision;delete r.approved}
    const{data,error}=await sb.from(t).insert(r).select().single();if(error)throw error;
    if(t==='costings'&&mg!=null){await sb.from('costing_margins').insert({costing_id:data.id,margin_pct:mg})}return data},
  async update(t,id,p){p=nul(p);delete p.margin_pct;const{data,error}=await sb.from(t).update({...p,updated_at:new Date().toISOString()}).eq('id',id).select().single();if(error)throw error;return data},
  async insertMany(t,rows){const out=[];for(let i=0;i<rows.length;i+=500){const{data,error}=await sb.from(t).insert(rows.slice(i,i+500).map(nul)).select();if(error)throw error;out.push(...data)}return out},
  async removeWhere(t,f,v){const{error}=await sb.from(t).delete().eq(f,v);if(error)throw error},
  async changePassword(pw){const{error}=await sb.auth.updateUser({password:pw});if(error)throw error;const{error:e2}=await sb.rpc('password_changed');if(e2)throw e2},
  async invite(body){const{data,error}=await sb.functions.invoke('invite-user',{body});if(error)throw error;if(data&&data.error)throw new Error(data.error);return data},
  async login(email,pw){const{error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;return this.user()},
  async logout(){await sb.auth.signOut()},
  async user(){const{data}=await sb.auth.getUser();if(!data.user)return null;const{data:p}=await sb.from('profiles').select('*').eq('id',data.user.id).single();if(p&&p.active===false){await sb.auth.signOut();throw new Error('This user is deactivated')}return{email:data.user.email,id:data.user.id,delegate_for:p?.delegate_for||null,caps:p?.caps||[],must_change_password:!!p?.must_change_password,role:p?.role||'dispatch',name:p?.full_name||data.user.email}}
};
window.DB=useSB?SB:LS;window.DB.mode=useSB?'Supabase':'Local demo';
async function audit(action,table,id,detail){if(useSB)return; /* DB triggers audit every write in Supabase mode */try{const u=await DB.user();await DB.insert('audit_log',{action,table_name:table,record_id:id,detail:JSON.stringify(detail||{}),user_email:u?.email})}catch(e){}}
window.audit=audit;
if(!useSB&&localStorage.getItem('dppl_ver')!=='6'){Object.keys(localStorage).filter(k=>k.startsWith('dppl_')).forEach(k=>localStorage.removeItem(k));localStorage.setItem('dppl_ver','6')}
function seed(){if(useSB||localStorage.getItem('dppl_seeded'))return;const d=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
 const c=[{id:'c1',name:'[SAMPLE] Sri Murugan Foods',mobile:'9840000001',city:'Chennai',segment:'Snacks',created_by:'u-nathan',created_at:new Date(Date.now()-200*864e5).toISOString()},{id:'c2',name:'[SAMPLE] Kaveri Spices',mobile:'9840000002',city:'Erode',segment:'Spices',created_by:'u-jesaon',created_at:new Date(Date.now()-200*864e5).toISOString()}];
 const e=[{id:'e1',enq_no:'ENQ-2026-0001',customer_id:'c1',owner_id:'u-nathan',product:'Chips pouch 3-layer',qty:50000,value:350000,stage:'Quotation',next_action:'Call for feedback',due_date:d(-2),created_at:new Date(Date.now()-20*864e5).toISOString(),sales_status:'Open',artwork_status:'Pending',order_status:'-',payment_status:'-'},
 {id:'e2',enq_no:'ENQ-2026-0002',customer_id:'c2',owner_id:'u-jesaon',product:'Masala stand-up pouch',qty:20000,value:180000,stage:'Feasibility',next_action:'Share spec',due_date:d(0),created_at:new Date(Date.now()-5*864e5).toISOString(),sales_status:'Open',artwork_status:'Pending',order_status:'-',payment_status:'-'}];
 localStorage.setItem('dppl_customers',JSON.stringify(c));localStorage.setItem('dppl_enquiries',JSON.stringify(e));
 localStorage.setItem('dppl_tasks',JSON.stringify([{id:'t1',enquiry_id:'e1',title:'[SAMPLE] Follow up quotation',owner_id:'u-nathan',due_date:d(-2),done:false}]));
 localStorage.setItem('dppl_visits',JSON.stringify([{id:'v1',date:d(-1),customer_name:'[SAMPLE] Sri Murugan Foods',customer_type:'Existing',purpose:'Quotation follow-up',discussion:'Asked for price revision',next_action:'Send R1',by_id:'u-nathan',created_at:new Date().toISOString()}]));
 localStorage.setItem('dppl_seeded','1')}
if(!useSB&&!localStorage.getItem('dppl_incentive_rules'))localStorage.setItem('dppl_incentive_rules',JSON.stringify([
 {id:'r1',name:'[PLACEHOLDER] Slab A',min_qty:10000,min_value:100000,margin_from:12,margin_to:18,pct:0.5},
 {id:'r2',name:'[PLACEHOLDER] Slab B',min_qty:10000,min_value:100000,margin_from:18,margin_to:25,pct:1},
 {id:'r3',name:'[PLACEHOLDER] Slab C',min_qty:25000,min_value:250000,margin_from:25,margin_to:100,pct:1.5}]));
seed();
if(!useSB&&!localStorage.getItem('dppl_profiles'))localStorage.setItem('dppl_profiles',JSON.stringify(DEMO_USERS.map((u,i)=>({id:u.id,email:u.email,full_name:u.name,role:u.role,active:true,emp_code:u.role==='marketing'?'MKT-00'+i:'',mobile:'',territory:({Nathan:'Chennai',Jesaon:'Erode',Suresh:'Coimbatore'})[u.name]||'',reporting_manager:u.role==='marketing'?'u-md':'',delegate_for:u.delegate_for||null,caps:u.caps||[],must_change_password:false}))));
if(!useSB&&!localStorage.getItem('dppl_invoices')){const d=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);localStorage.setItem('dppl_invoices',JSON.stringify([
 {id:'i1',invoice_no:'[SAMPLE] INV-1001',customer_id:'c1',amount:250000,invoice_date:d(-75),due_date:d(-45),promised_date:d(3),exec_id:'u-nathan',created_at:new Date().toISOString()},
 {id:'i2',invoice_no:'[SAMPLE] INV-1002',customer_id:'c2',amount:120000,invoice_date:d(-20),due_date:d(10),promised_date:'',exec_id:'u-jesaon',created_at:new Date().toISOString()}]));
 localStorage.setItem('dppl_collections',JSON.stringify([{id:'k1',invoice_id:'i1',amount:100000,date:d(-10),by_id:'u-nathan',created_at:new Date().toISOString()}]))}
