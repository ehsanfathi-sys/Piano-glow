(function(){
'use strict';
const visual=document.getElementById('visual');
if(!visual)return;
let seen=0;
const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof HTMLElement)||!node.classList.contains('smoke')||node.dataset.extra==='1')continue;
      seen++;
      if(seen%3!==0)continue;
      const extra=node.cloneNode(false);
      extra.dataset.extra='1';
      const left=parseFloat(node.style.left)||0;
      const size=parseFloat(node.style.width)||6;
      extra.style.left=(left+(Math.random()-.5)*14)+'px';
      extra.style.bottom=((parseFloat(node.style.bottom)||2)+Math.random()*3)+'px';
      extra.style.width=(size*.72)+'px';
      extra.style.height=(size*.72)+'px';
      extra.style.animationDuration=((parseFloat(node.style.animationDuration)||1.3)+.12)+'s';
      extra.style.setProperty('--drift',((Math.random()-.5)*24)+'px');
      extra.style.setProperty('--smoke-rise',(30+Math.random()*30)+'px');
      visual.appendChild(extra);
      extra.addEventListener('animationend',()=>extra.remove(),{once:true});
    }
  }
});
observer.observe(visual,{childList:true});
})();
