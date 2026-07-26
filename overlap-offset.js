(function(){
'use strict';
const visual=document.getElementById('visual');
if(!visual)return;
const STEP=6;
function offsetFor(index){if(index<=0)return 0;const amount=Math.ceil(index/2)*STEP;return index%2?amount:-amount}
function place(bar){if(!bar||bar.dataset.overlapOffsetApplied==='1')return;const midi=bar.dataset.midi;if(!midi)return;const siblings=[...visual.querySelectorAll('.bar[data-midi="'+midi+'"]')].filter(other=>other!==bar&&other.isConnected);const baseLeft=parseFloat(bar.style.left)||0;const offset=offsetFor(siblings.length);bar.style.left=(baseLeft+offset)+'px';bar.dataset.overlapOffsetApplied='1';bar.dataset.overlapOffset=String(offset);bar.style.zIndex=String(2+Math.min(siblings.length,20))}
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(!(node instanceof Element))continue;if(node.classList.contains('bar'))place(node);node.querySelectorAll&&node.querySelectorAll('.bar').forEach(place)}});
observer.observe(visual,{childList:true,subtree:true});
visual.querySelectorAll('.bar').forEach(place);
})();
