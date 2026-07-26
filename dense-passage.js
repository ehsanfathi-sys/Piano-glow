(function(){
'use strict';
const visual=document.getElementById('visual');
if(!visual)return;
const ENTER_COUNT=10;
const EXIT_COUNT=7;
const SHORT_LABEL_HEIGHT=58;
let dense=false;
function setDense(next){if(dense===next)return;dense=next;visual.classList.toggle('dense-passage',dense)}
function update(){const bars=[...visual.querySelectorAll('.bar')],visible=bars.filter(bar=>bar.isConnected);if(!dense&&visible.length>=ENTER_COUNT)setDense(true);else if(dense&&visible.length<=EXIT_COUNT)setDense(false);for(const bar of visible){const height=bar.getBoundingClientRect().height;const label=bar.querySelector('.label');if(label)label.style.opacity=dense&&height<SHORT_LABEL_HEIGHT?'0':'1'}if(dense){const released=visible.filter(bar=>bar.classList.contains('released'));released.forEach((bar,index)=>{const age=index/Math.max(1,released.length-1);bar.style.opacity=String(Math.max(.28,1-age*.58));bar.style.animationDuration=index<Math.max(0,released.length-12)?'2.35s':'3.15s'})}else{for(const bar of visible){bar.style.opacity='';if(bar.classList.contains('released'))bar.style.animationDuration=''}}}
const observer=new MutationObserver(update);
observer.observe(visual,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
setInterval(update,120);
update();
})();