// Data layer: same async API over localStorage or Supabase.
const DEMO_USERS=[
 {email:'md@dppl.demo',pw:'md123',role:'md',name:'MD'},{email:'ceo@dppl.demo',pw:'ceo123',role:'ceo',name:'CEO'},
 {email:'ravi@dppl.demo',pw:'mkt123',role:'marketing',name:'ravi'},{email:'priya@dppl.demo',pw:'mkt123',role:'marketing',name:'priya'},
 {email:'costing@dppl.demo',pw:'cost123',role:'costing',name:'Costing'},
 {email:'factory@dppl.demo',pw:'view123',role:'factory_manager',name:'Factory Manager'},{email:'planning@dppl.demo',pw:'view123',role:'planning',name:'Planning'},{email:'dispatch@dppl.demo',pw:'view123',role:'dispatch',name:'Dispatch'}];
window.DEMO_USERS=DEMO_USERS;
const ROLE={md:{full:1,edit:1,cost:1,margin:1,approve:1,spec:1,costedit:1,cust:1,visit:1,inc_all:1},ceo:{full:1,edit:1,cost:1,margin:1,approve:1,spec:1,costedit:1,cust:1,visit:1,inc_all:1},marketing:{edit:1,cost:1,spec:1,costedit:1,cust:1,visit:1,inc_own:1},costing:{cost:1,margin:1,spec:1,costedit:1},factory_manager:{},planning:{},dispatch:{}};
window.can=(u,p)=>!!(u&&(ROLE[u.role]||{})[p]);
const TABLES=['customers','enquiries','specs','costings','quotations','activities','tasks','audit_log'];
const cfg=window.DPPL_CONFIG||{};
const useSB=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=useSB?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random();
const LS={
  _g(t){return JSON.parse(localStorage.getItem('dppl_'+t)||'[]')},_s(t,v){localStorage.setItem('dppl_'+t,JSON.stringify(v))},
  async list(t){return this._g(t)},
  async insert(t,r){const a=this._g(t);r={id:uid(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...r};a.push(r);this._s(t,a);return r},
  async update(t,id,p){const a=this._g(t);const i=a.findIndex(x=>x.id===id);a[i]={...a[i],...p,updated_at:new Date().toISOString()};this._s(t,a);return a[i]},
  async login(email,pw){const a=DEMO_USERS.find(x=>x.email===email.trim().toLowerCase()&&x.pw===pw);if(!a)throw new Error('Invalid demo credentials');const u={email:a.email,role:a.role,name:a.name};localStorage.setItem('dppl_user',JSON.stringify(u));return u},
  async logout(){localStorage.removeItem('dppl_user')},
  async user(){return JSON.parse(localStorage.getItem('dppl_user')||'null')}
};
LS.remove=async function(t,id){this._s(t,this._g(t).filter(x=>x.id!==id))};
const SB={
  async remove(t,id){const{error}=await sb.from(t).delete().eq('id',id);if(error)throw error},
  async list(t){const{data,error}=await sb.from(t).select('*');if(error){console.warn(t,error.message);return[]}return data},
  async insert(t,r){const{data,error}=await sb.from(t).insert(r).select().single();if(error)throw error;return data},
  async update(t,id,p){const{data,error}=await sb.from(t).update({...p,updated_at:new Date().toISOString()}).eq('id',id).select().single();if(error)throw error;return data},
  async login(email,pw){const{error}=await sb.auth.signInWithPassword({email,password:pw});if(error)throw error;return this.user()},
  async logout(){await sb.auth.signOut()},
  async user(){const{data}=await sb.auth.getUser();if(!data.user)return null;const{data:p}=await sb.from('profiles').select('*').eq('id',data.user.id).single();return{email:data.user.email,id:data.user.id,role:p?.role||'dispatch',name:p?.full_name||data.user.email}}
};
window.DB=useSB?SB:LS;window.DB.mode=useSB?'Supabase':'Local demo';
async function audit(action,table,id,detail){try{const u=await DB.user();await DB.insert('audit_log',{action,table_name:table,record_id:id,detail:JSON.stringify(detail||{}),user_email:u?.email})}catch(e){}}
window.audit=audit;
function seed(){if(useSB||localStorage.getItem('dppl_seeded'))return;const d=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
 const c=[{id:'c1',name:'[SAMPLE] Sri Murugan Foods',mobile:'9840000001',city:'Chennai',segment:'Snacks'},{id:'c2',name:'[SAMPLE] Kaveri Spices',mobile:'9840000002',city:'Erode',segment:'Spices'}];
 const e=[{id:'e1',enq_no:'ENQ-2026-0001',customer_id:'c1',owner:'ravi',product:'Chips pouch 3-layer',qty:50000,value:350000,stage:'Quotation',next_action:'Call for feedback',due_date:d(-2),created_at:new Date(Date.now()-20*864e5).toISOString(),sales_status:'Open',artwork_status:'Pending',order_status:'-',payment_status:'-'},
 {id:'e2',enq_no:'ENQ-2026-0002',customer_id:'c2',owner:'priya',product:'Masala stand-up pouch',qty:20000,value:180000,stage:'Feasibility',next_action:'Share spec',due_date:d(0),created_at:new Date(Date.now()-5*864e5).toISOString(),sales_status:'Open',artwork_status:'Pending',order_status:'-',payment_status:'-'}];
 localStorage.setItem('dppl_customers',JSON.stringify(c));localStorage.setItem('dppl_enquiries',JSON.stringify(e));
 localStorage.setItem('dppl_tasks',JSON.stringify([{id:'t1',enquiry_id:'e1',title:'[SAMPLE] Follow up quotation',owner:'ravi',due_date:d(-2),done:false}]));
 localStorage.setItem('dppl_visits',JSON.stringify([{id:'v1',date:d(-1),customer_name:'[SAMPLE] Sri Murugan Foods',customer_type:'Existing',purpose:'Quotation follow-up',discussion:'Asked for price revision',next_action:'Send R1',by:'ravi',created_at:new Date().toISOString()}]));
 localStorage.setItem('dppl_seeded','1')}
if(!useSB&&!localStorage.getItem('dppl_incentive_rules'))localStorage.setItem('dppl_incentive_rules',JSON.stringify([
 {id:'r1',name:'[PLACEHOLDER] Slab A',min_qty:10000,min_value:100000,margin_from:12,margin_to:18,pct:0.5},
 {id:'r2',name:'[PLACEHOLDER] Slab B',min_qty:10000,min_value:100000,margin_from:18,margin_to:25,pct:1},
 {id:'r3',name:'[PLACEHOLDER] Slab C',min_qty:25000,min_value:250000,margin_from:25,margin_to:100,pct:1.5}]));
seed();
