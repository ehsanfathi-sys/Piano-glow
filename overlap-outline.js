(function(){
'use strict';
const visual=document.getElementById('visual');
if(!visual)return;
function markOverlap(bar){
  if(!bar||!bar.classList.contains('bar'))return;
  const midi=bar.dataset.midi;
  if(!midi)return;
  const older=[...visual.querySelectorAll('.bar[data-midi="'+midi+'"]')].filter(other=>other!==bar&&other.isConnected);
  if(older.length){
    bar.classList.add('same-note-overlap');
    older.forEach(other=>other.classList.add('same-note-overlap'));
  }
}
const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof Element))continue;
      if(node.classList.contains('bar'))markOverlap(node);
      node.querySelectorAll&&node.querySelectorAll('.bar').forEach(markOverlap);
    }
  }
});
observer.observe(visual,{childList:true,subtree:true});
visual.querySelectorAll('.bar').forEach(markOverlap);
})();
