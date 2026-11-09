// DPPL Android shell hooks: blob:/data: downloads (CSV/Excel exports) -> native "Saved to Downloads/DPPL".
(function(){if(window.__dpplHook||!window.DPPLAndroid)return;window.__dpplHook=1;var B={};
var oc=URL.createObjectURL;URL.createObjectURL=function(b){var u=oc.apply(URL,arguments);try{if(b instanceof Blob)B[u]=b}catch(e){}return u};
function send(b,n){var fr=new FileReader();fr.onload=function(){var s=fr.result,i=s.indexOf(',');DPPLAndroid.saveFile(n||'download',b.type||'',s.slice(i+1))};fr.readAsDataURL(b)}
function save(h,n){if(B[h])return send(B[h],n);fetch(h).then(function(r){return r.blob()}).then(function(b){send(b,n)}).catch(function(e){alert('Download failed: '+e)})}
window.__dpplSave=save;
var ac=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){var h=this.href||'';if(/^(blob|data):/.test(h)){save(h,this.getAttribute('download')||'download');return}return ac.apply(this,arguments)};
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.href||'';if(/^(blob|data):/.test(h)){e.preventDefault();e.stopPropagation();save(h,a.getAttribute('download')||'download')}},true);
})();
