// In-app broadcast messages (MD / CEO / HR Admin -> all users or selected roles) with unread bell + read receipts.
const MROLES=[['hr_admin','HR Admin'],['md','MD'],['ceo','CEO'],['marketing','Marketing'],['costing','Costing'],['factory_manager','Factory'],['planning','Planning'],['dispatch','Dispatch'],['data_entry','Data entry']];
const myRcpt=()=>(D.message_recipients||[]).filter(r=>r.user_id===U.id);
const unread=()=>myRcpt().filter(r=>!r.read_at).length;
window.bellHtml=()=>`<button id="bell" title="Messages">🔔${unread()?`<b>${unread()}</b>`:''}</button>`;
const msgById=id=>(D.messages||[]).find(m=>m.id===id);
function inboxV(){const R=myRcpt().map(r=>({r,m:msgById(r.message_id)})).filter(x=>x.m).sort((a,b)=>a.m.created_at<b.m.created_at?1:-1);
 const S=(D.messages||[]).filter(m=>m.sender_id===U.id).sort((a,b)=>a.created_at<b.created_at?1:-1);const share=m=>encodeURIComponent(`${m.subject}\n\n${m.body}\n— ${pname(m.sender_id)}, DPPL`);
 return `${can(U,'broadcast')?`<div class="card"><h2>Message all / selected roles</h2><form id="mf"><label>Subject*</label><input name="subject" required><label>Message*</label><textarea name="body" rows="4" required></textarea>
 <label>Send to</label><label style="display:inline"><input type="checkbox" style="width:auto" name="all" checked id="mall"> All users</label><div id="mroles" style="display:none">${MROLES.map(([k,l])=>`<label style="display:inline;margin-right:10px"><input type="checkbox" style="width:auto" name="r_${k}"> ${l}</label>`).join('')}</div>
 <button>Send in app</button> <small>Delivered inside this app only — nothing is sent by WhatsApp/email automatically.</small></form></div>`:''}
 <div class="card"><h2>Inbox</h2>${R.map(({r,m})=>`<div class="card ${r.read_at?'':'unread'}" data-msg="${r.id}"><b>${esc(m.subject)}</b> <small>— ${esc(pname(m.sender_id))}, ${new Date(m.created_at).toLocaleString('en-GB')}${r.read_at?' · read':' · new'}</small>
 ${sel===r.id||r.read_at?`<p style="white-space:pre-wrap">${esc(m.body)}</p>`:'<br><small>Tap to read</small>'}</div>`).join('')||'<p>No messages.</p>'}</div>
 ${S.length?`<div class="card tw"><h2>Sent — read status</h2>${S.map(m=>{const rc=(D.message_recipients||[]).filter(r=>r.message_id===m.id),rd=rc.filter(r=>r.read_at);
 return `<div class="card"><b>${esc(m.subject)}</b> <small>${new Date(m.created_at).toLocaleString('en-GB')} · to ${m.all_users?'all users':esc((m.roles||[]).join(', '))}</small> — <b>${rd.length}/${rc.length} read</b>
 <a target="_blank" rel="noopener" href="https://wa.me/?text=${share(m)}">Share on WhatsApp</a> · <a href="mailto:?subject=${encodeURIComponent(m.subject)}&body=${share(m)}">Email</a>
 <details><summary>Recipients</summary><table>${rc.map(r=>`<tr><td>${esc(pname(r.user_id))}</td><td>${r.read_at?'Read '+new Date(r.read_at).toLocaleString('en-GB'):'<span class="bad">Unread</span>'}</td></tr>`).join('')}</table></details></div>`}).join('')}</div>`:''}`}
window.bind_inbox=()=>{const m=$('#mall');if(m)m.onchange=()=>{$('#mroles').style.display=m.checked?'none':'block'};
 const f=$('#mf');if(f)f.onsubmit=async e=>{e.preventDefault();const v=fv(f),all=!!v.all,roles=MROLES.map(r=>r[0]).filter(k=>v['r_'+k]);if(!all&&!roles.length)return alert('Pick at least one role');
  const msg=await DB.insert('messages',{sender_id:U.id,subject:v.subject,body:v.body,all_users:all,roles:all?[]:roles});await audit('insert','messages',msg.id,{subject:v.subject});
  if(DB.mode!=='Supabase'){for(const p of (D.profiles||[]).filter(p=>p.active!==false&&(all||roles.includes(p.role))))await DB.insert('message_recipients',{message_id:msg.id,user_id:p.id,read_at:null})}  // Supabase: trigger fans out
  await load();render();alert('Message sent')};
 document.querySelectorAll('[data-msg]').forEach(c=>c.onclick=async()=>{const r=(D.message_recipients||[]).find(x=>x.id===c.dataset.msg);sel=r.id;if(!r.read_at){await DB.update('message_recipients',r.id,{read_at:new Date().toISOString()});await load()}render()})};
window.VIEWS={...(window.VIEWS||{}),inbox:inboxV};
