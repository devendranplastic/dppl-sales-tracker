// v1.9.5 (Bala t62u): value labels on every bar + charts that fit phone and desktop.
// A small Chart.js plugin (no extra library). A chart opts in with options.plugins.vlab={fmt:v=>'...'}.
(function(){if(!window.Chart)return;
const phone=()=>matchMedia('(max-width:767px)').matches;
// compact numbers for labels: 1234.5 -> 1,235 · 45.67 -> 45.7 · 3.456 -> 3.46
const cnum=x=>{const a=Math.abs(x),d=a>=100?0:a>=10?1:2;return x.toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:d})};
window.VL={T:kg=>cnum((+kg||0)/1000),L:r=>cnum((+r||0)/1e5),P:p=>Math.round(p)+'%',cnum,phone};
// shorten long category labels on phone (names, products)
window.VL.short=(s,n)=>{s=String(s??'');n=n||(phone()?12:22);return s.length>n?s.slice(0,n-1)+'…':s};
Chart.register({id:'vlab',afterDatasetsDraw(ch,_a,o){if(!o||!o.fmt)return;const c=ch.ctx,horiz=ch.options.indexAxis==='y',ca=ch.chartArea;
 c.save();c.textBaseline='middle';
 ch.data.datasets.forEach((ds,di)=>{const m=ch.getDatasetMeta(di);if(m.hidden||!ch.isDatasetVisible(di))return;const type=m.type||ds.type||ch.config.type;
  if(type==='doughnut'||type==='pie'){const tot=ds.data.reduce((s,v)=>s+(+v||0),0);m.data.forEach((el,i)=>{const v=+ds.data[i]||0;if(!tot||v/tot<0.05)return;const p=el.tooltipPosition();c.font=`bold ${phone()?10:11}px sans-serif`;c.fillStyle='#fff';c.textAlign='center';c.fillText(o.pie?o.pie(v,tot):Math.round(v/tot*100)+'%',p.x,p.y)});return}
  if(type!=='bar')return;
  m.data.forEach((el,i)=>{const v=ds.data[i];if(v==null||!+v)return;const t=o.fmt(+v,di,i);if(!t)return;
   if(horiz){const fs=Math.max(8,Math.min(phone()?10:11,el.height*0.8));c.font=`${fs}px sans-serif`;const w=c.measureText(t).width;
    let x=el.x+4,inside=false;if(x+w>ca.right){x=el.x-4-w;inside=true}c.fillStyle=inside?'#fff':'#333';c.textAlign='left';c.fillText(t,x,el.y);return}
   const bw=el.width;let fs=phone()?10:11;c.font=`${fs}px sans-serif`;let w=c.measureText(t).width;
   while(w>bw+2&&fs>8){fs--;c.font=`${fs}px sans-serif`;w=c.measureText(t).width}
   const top=Math.min(el.y,el.base);c.fillStyle='#333';
   if(w<=bw+2){c.textAlign='center';c.textBaseline='bottom';c.fillText(t,el.x,top-2);c.textBaseline='middle'}
   else{c.save();c.translate(el.x,top-3);c.rotate(-Math.PI/2);c.textAlign='left';c.font=`${Math.max(8,Math.min(10,bw*0.95))}px sans-serif`;c.fillText(t,0,0);c.restore()}})});
 c.restore()}});
// headroom so labels above the tallest bar are not cut off
Chart.register({id:'vlabRoom',beforeInit(ch){const o=ch.options.plugins&&ch.options.plugins.vlab;if(!o||!o.fmt)return;const sc=ch.options.scales||{},k=ch.options.indexAxis==='y'?'x':'y';
 Object.entries(sc).forEach(([id,s])=>{if((s.axis||id[0])===k&&s.grace==null)s.grace=phone()?'22%':'12%'})}});
// phone-friendly defaults: smaller fonts, compact legends, rotated/skipped month labels
const D=Chart.defaults;D.font.size=phone()?10:12;D.plugins.legend.labels.boxWidth=phone()?10:14;D.plugins.legend.labels.padding=phone()?6:10;
D.scale.ticks.autoSkip=true;D.scale.ticks.maxRotation=phone()?60:45;D.maintainAspectRatio=false;D.responsive=true;
// grow a chart box to fit its rows (horizontal bar lists)
window.VL.fit=(el,rows,per)=>{const b=el&&el.parentElement;if(b)b.style.height=Math.max(220,rows*(per||(phone()?30:26))+80)+'px'};
})();
