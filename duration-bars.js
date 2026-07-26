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
const RELEASE_GRACE_MS=110;
const MAX_VISIBLE_BARS=72;
const SHORT_NOTE_GROWTH=(NORMAL_MIN_HEIGHT+SHORT_NOTE_WINDOW*GROWTH_PER_SECOND-MIN_HEIGHT)/SHORT_NOTE_WINDOW;

function keyIsActive(midi){
  const key=keyboard.querySelector('[data-midi="'+midi+'"]');
  return !!(key&&key.classList.contains('active'));
}

function stripBarText(bar){
  if(!bar||!bar.classList.contains('bar'))return;
  if(bar.childNodes.length)bar.replaceChildren();
  bar.textContent='';
  bar.removeAttribute('title');
  bar.removeAttribute('aria-label');
  bar.style.color='transparent';
  bar.style.textShadow='none';
  bar.style.fontSize='0';
}

function addSeparationBorder(bar){
  bar.style.border='3px solid #000';
  bar.style.backgroundClip='padding-box';
}

function durationHeight(seconds){
  if(seconds<SHORT_NOTE_WINDOW)return MIN_HEIGHT+seconds*SHORT_NOTE_GROWTH;
  return NORMAL_MIN_HEIGHT+seconds*GROWTH_PER_SECOND;
}

function grow(bar,state,now,maxHeight){
  const seconds=Math.max(0,(now-state.startedAt)/1000);
  const height=Math.min(maxHeight,durationHeight(seconds));
  bar.style.height=height+'px';
  bar.style.minHeight=height+'px';
}

function removeBar(bar){
  tracked.delete(bar);
  if(bar.isConnected)bar.remove();
}

function releaseBar(bar,state){
  if(state.phase!=='growing')return;
  state.phase='released';
  const height=parseFloat(bar.style.height)||MIN_HEIGHT;
  bar.style.height=height+'px';
  bar.style.minHeight=height+'px';
  bar.classList.add('released');
  bar.style.animation='rise var(--rise-duration, 4s) linear forwards';
  bar.addEventListener('animationend',()=>removeBar(bar),{once:true});
}

function trimVisualLoad(){
  const bars=[...visual.querySelectorAll('.bar')];
  let excess=bars.length-MAX_VISIBLE_BARS;
  if(excess<=0)return;
  for(const bar of bars){
    if(excess<=0)break;
    const state=tracked.get(bar);
    if(!bar.classList.contains('released')&&state?.phase!=='released')continue;
    removeBar(bar);
    excess--;
  }
}

function track(bar){
  if(!bar)return;
  stripBarText(bar);
  if(tracked.has(bar))return;
  const now=performance.now();
  addSeparationBorder(bar);
  bar.style.animation='none';
  bar.style.height=MIN_HEIGHT+'px';
  bar.style.minHeight=MIN_HEIGHT+'px';
  bar.dataset.durationStart=String(now);
  tracked.set(bar,{
    midi:bar.dataset.midi,
    startedAt:now,
    missingSince:0,
    phase:'growing'
  });
  trimVisualLoad();
}

function frame(now){
  const maxHeight=Math.max(NORMAL_MIN_HEIGHT,visual.clientHeight*.72);
  for(const[bar,state]of tracked){
    if(!bar.isConnected){
      tracked.delete(bar);
      continue;
    }
    stripBarText(bar);
    if(state.phase!=='growing')continue;

    if(keyIsActive(state.midi)){
      state.missingSince=0;
      grow(bar,state,now,maxHeight);
      continue;
    }

    if(!state.missingSince)state.missingSince=now;
    if(now-state.missingSince>=RELEASE_GRACE_MS)releaseBar(bar,state);
  }
  trimVisualLoad();
  requestAnimationFrame(frame);
}

const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(!(node instanceof Element))continue;
      const parentBar=node.closest('.bar');
      if(parentBar)stripBarText(parentBar);
      if(node.classList.contains('bar'))track(node);
      node.querySelectorAll&&node.querySelectorAll('.bar').forEach(track);
    }
  }
});

observer.observe(visual,{childList:true,subtree:true});
visual.querySelectorAll('.bar').forEach(track);
requestAnimationFrame(frame);
}());