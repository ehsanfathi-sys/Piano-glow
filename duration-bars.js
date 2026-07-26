(function(){
'use strict';
const visual=document.getElementById('visual');
const keyboard=document.getElementById('keyboard');
if(!visual||!keyboard)return;
const tracked=new Map();
const MIN_HEIGHT=12;
const NORMAL_MIN_HEIGHT=24;
const GROWTH_PER_SECOND=105;
const SHORT_NOTE_WINDOW=.2;
const SHORT_NOTE_GROWTH=(NORMAL_MIN_HEIGHT+SHORT_NOTE_WINDOW*GROWTH_PER_SECOND-MIN_HEIGHT)/SHORT_NOTE_WINDOW;
function keyIsActive(midi){const key=keyboard.querySelector('[data-midi="'+midi+'"]');return !!(key&&key.classList.contains('active'))}
function track(bar){if(!bar||tracked.has(bar))return;const midi=bar.dataset.midi;bar.style.animation='none';bar.style.height=MIN_HEIGHT+'px';bar.style.minHeight=MIN_HEIGHT+'px';bar.dataset.durationStart=performance.now();tracked.set(bar,{midi,start:performance.now(),released:false})}
function releaseBar(bar,state){if(state.released)return;state.released=true;const height=parseFloat(bar.style.height)||MIN_HEIGHT;bar.style.height=height+'px';bar.style.minHeight=height+'px';bar.classList.add('released');bar.style.animation='rise 4.2s linear forwards'}
function durationHeight(seconds){if(seconds<SHORT_NOTE_WINDOW)return MIN_HEIGHT+seconds*SHORT_NOTE_GROWTH;return NORMAL_MIN_HEIGHT+seconds*GROWTH_PER_SECOND}
function frame(now){const maxHeight=Math.max(NORMAL_MIN_HEIGHT,visual.clientHeight*.72);for(const[bar,state]of tracked){if(!bar.isConnected){tracked.delete(bar);continue}if(!state.released){if(keyIsActive(state.midi)){const seconds=Math.max(0,(now-state.start)/1000);const height=Math.min(maxHeight,durationHeight(seconds));bar.style.height=height+'px';bar.style.minHeight=height+'px'}else releaseBar(bar,state)}}requestAnimationFrame(frame)}
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(!(node instanceof Element))continue;if(node.classList.contains('bar'))track(node);node.querySelectorAll&&node.querySelectorAll('.bar').forEach(track)}});
observer.observe(visual,{childList:true,subtree:true});
visual.querySelectorAll('.bar').forEach(track);
requestAnimationFrame(frame);
})();