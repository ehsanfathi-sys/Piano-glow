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
const POLYPHONY_WINDOW=420;
const POLYPHONY_MIN_HOLD=350;
const POLYPHONY_MAX_GUARD=900;
const QUIET_RELEASE_DELAY=90;
const HARD_INACTIVE_RELEASE=360;
const MAX_UNRELEASED_AGE=8000;
const MAX_VISIBLE_BARS=72;
const RELEASE_REMOVE_DELAY=4400;
const SHORT_NOTE_GROWTH=(NORMAL_MIN_HEIGHT+SHORT_NOTE_WINDOW*GROWTH_PER_SECOND-MIN_HEIGHT)/SHORT_NOTE_WINDOW;
let latestBarStartedAt=-Infinity;
function keyIsActive(midi){const key=keyboard.querySelector('[data-midi="'+midi+'"]');return !!(key&&key.classList.contains('active'))}
function anotherKeyIsActive(midi){for(const key of keyboard.querySelectorAll('.active[data-midi]'))if(key.dataset.midi!==String(midi))return true;return false}
function addSeparationBorder(bar){bar.style.border='3px solid #000';bar.style.backgroundClip='padding-box'}
function trimVisualLoad(){const bars=[...visual.querySelectorAll('.bar')];if(bars.length<=MAX_VISIBLE_BARS)return;const removable=bars.filter(bar=>bar.classList.contains('released'));let excess=bars.length-MAX_VISIBLE_BARS;for(const bar of removable){if(excess--<=0)break;tracked.delete(bar);bar.remove()}}
function track(bar){if(!bar||tracked.has(bar))return;const now=performance.now(),midi=bar.dataset.midi;latestBarStartedAt=now;addSeparationBorder(bar);bar.style.animation='none';bar.style.height=MIN_HEIGHT+'px';bar.style.minHeight=MIN_HEIGHT+'px';bar.dataset.durationStart=now;tracked.set(bar,{midi,start:now,released:false,inactiveSince:0,polyphonyGuard:false,guardStarted:0});trimVisualLoad()}
function releaseBar(bar,state){if(state.released)return;state.released=true;const height=parseFloat(bar.style.height)||MIN_HEIGHT;bar.style.height=height+'px';bar.style.minHeight=height+'px';bar.classList.add('released');bar.style.animation='rise 4.2s linear forwards';setTimeout(()=>{tracked.delete(bar);if(bar.isConnected)bar.remove()},RELEASE_REMOVE_DELAY)}
function durationHeight(seconds){if(seconds<SHORT_NOTE_WINDOW)return MIN_HEIGHT+seconds*SHORT_NOTE_GROWTH;return NORMAL_MIN_HEIGHT+seconds*GROWTH_PER_SECOND}
function grow(bar,state,now,maxHeight){const seconds=Math.max(0,(now-state.start)/1000),height=Math.min(maxHeight,durationHeight(seconds));bar.style.height=height+'px';bar.style.minHeight=height+'px'}
function frame(now){const maxHeight=Math.max(NORMAL_MIN_HEIGHT,visual.clientHeight*.72);for(const[bar,state]of tracked){if(!bar.isConnected){tracked.delete(bar);continue}if(state.released)continue;const activeNow=keyIsActive(state.midi);if(activeNow){state.inactiveSince=0;state.polyphonyGuard=false;state.guardStarted=0;grow(bar,state,now,maxHeight);if(now-state.start>=MAX_UNRELEASED_AGE)releaseBar(bar,state);continue}if(!state.inactiveSince)state.inactiveSince=now;const inactiveFor=now-state.inactiveSince;if(inactiveFor>=HARD_INACTIVE_RELEASE){releaseBar(bar,state);continue}const heldFor=now-state.start,newNoteNearby=now-latestBarStartedAt<=POLYPHONY_WINDOW;if(!state.polyphonyGuard&&heldFor>=POLYPHONY_MIN_HOLD&&newNoteNearby&&anotherKeyIsActive(state.midi)){state.polyphonyGuard=true;state.guardStarted=now}if(state.polyphonyGuard){const otherStillPlaying=anotherKeyIsActive(state.midi),guardExpired=now-state.guardStarted>POLYPHONY_MAX_GUARD;if(otherStillPlaying&&!guardExpired){grow(bar,state,now,maxHeight);continue}state.polyphonyGuard=false;state.inactiveSince=now}if(now-state.inactiveSince>=QUIET_RELEASE_DELAY)releaseBar(bar,state)}trimVisualLoad();requestAnimationFrame(frame)}
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(!(node instanceof Element))continue;if(node.classList.contains('bar'))track(node);node.querySelectorAll&&node.querySelectorAll('.bar').forEach(track)}});
observer.observe(visual,{childList:true,subtree:true});
visual.querySelectorAll('.bar').forEach(track);
requestAnimationFrame(frame);
})();