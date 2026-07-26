(function(){
'use strict';

const NOTE_NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const CHORDS=[
  {suffix:'maj9',pcs:[0,2,4,7,11],quality:'major'},
  {suffix:'m9',pcs:[0,2,3,7,10],quality:'minor'},
  {suffix:'9',pcs:[0,2,4,7,10],quality:'dominant'},
  {suffix:'maj7',pcs:[0,4,7,11],quality:'major'},
  {suffix:'m7',pcs:[0,3,7,10],quality:'minor'},
  {suffix:'7',pcs:[0,4,7,10],quality:'dominant'},
  {suffix:'m7♭5',pcs:[0,3,6,10],quality:'diminished'},
  {suffix:'dim7',pcs:[0,3,6,9],quality:'diminished'},
  {suffix:'6',pcs:[0,4,7,9],quality:'major'},
  {suffix:'m6',pcs:[0,3,7,9],quality:'minor'},
  {suffix:'sus2',pcs:[0,2,7],quality:'suspended'},
  {suffix:'sus4',pcs:[0,5,7],quality:'suspended'},
  {suffix:'aug',pcs:[0,4,8],quality:'augmented'},
  {suffix:'dim',pcs:[0,3,6],quality:'diminished'},
  {suffix:'m',pcs:[0,3,7],quality:'minor'},
  {suffix:'',pcs:[0,4,7],quality:'major'},
  {suffix:'5',pcs:[0,7],quality:'power'}
];
const THEMES={
  major:['#ffd166','#ff9f43','#fff1b8'],
  minor:['#7289ff','#9b7bff','#b8d6ff'],
  dominant:['#ff7a59','#ffbf69','#ffe0b2'],
  diminished:['#e05278','#762a83','#c084fc'],
  augmented:['#5eead4','#67e8f9','#f0fdfa'],
  suspended:['#62d6c8','#93c5fd','#dbeafe'],
  power:['#f8fafc','#94a3b8','#cbd5e1'],
  neutral:['#60a5fa','#22d3ee','#c084fc']
};

let visual,readout,chordPill,aura,aura2,lastSignature='',pendingSignature='',pendingSince=0,lastChord=null;

function pitchClasses(midis){return [...new Set(midis.map(m=>((m%12)+12)%12))].sort((a,b)=>a-b)}
function sameSet(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i])}
function intervalsFor(root,pcs){return pcs.map(p=>(p-root+12)%12).sort((a,b)=>a-b)}

function identifyChord(midis){
  if(midis.length<2)return null;
  const pcs=pitchClasses(midis),bass=((Math.min(...midis)%12)+12)%12;
  let best=null;
  for(const root of pcs){
    const ints=intervalsFor(root,pcs);
    for(const shape of CHORDS){
      let score=-Infinity;
      if(sameSet(ints,shape.pcs))score=100+shape.pcs.length*5;
      else if(shape.pcs.every(x=>ints.includes(x))&&ints.length===shape.pcs.length+1)score=65+shape.pcs.length*4;
      if(score===-Infinity)continue;
      if(root===bass)score+=8;
      if(!best||score>best.score)best={root,shape,score,bass};
    }
  }
  if(!best)return null;
  const inversion=best.bass!==best.root?' / '+NOTE_NAMES[best.bass]:'';
  return {name:NOTE_NAMES[best.root]+best.shape.suffix+inversion,quality:best.shape.quality,root:best.root};
}

function activeMidis(){
  return [...document.querySelectorAll('#keyboard .active[data-midi]')]
    .map(el=>Number(el.dataset.midi)).filter(Number.isFinite).sort((a,b)=>a-b);
}

function ensureUI(){
  visual=document.getElementById('visual');
  readout=document.getElementById('readout');
  if(!visual)return false;
  aura=document.createElement('div');aura.className='harmony-aura harmony-aura-one';
  aura2=document.createElement('div');aura2.className='harmony-aura harmony-aura-two';
  chordPill=document.createElement('div');chordPill.id='chordName';chordPill.className='pill chord-pill';chordPill.textContent='Chord: —';
  visual.prepend(aura2);visual.prepend(aura);visual.appendChild(chordPill);
  return true;
}

function applyTheme(chord,midis){
  const theme=THEMES[chord?chord.quality:'neutral']||THEMES.neutral;
  const rootShift=chord?chord.root:0;
  const rotate=(rootShift*23)%360;
  document.documentElement.style.setProperty('--harmony-a',theme[0]);
  document.documentElement.style.setProperty('--harmony-b',theme[1]);
  document.documentElement.style.setProperty('--harmony-c',theme[2]);
  document.documentElement.style.setProperty('--harmony-rotate',rotate+'deg');
  if(chord)document.documentElement.style.setProperty('--glow',theme[0]);
  const energy=Math.min(1,midis.length/7);
  visual.style.setProperty('--aura-energy',String(.24+energy*.34));
}

function updateHarmony(){
  const midis=activeMidis(),signature=midis.join(',');
  if(signature!==pendingSignature){pendingSignature=signature;pendingSince=performance.now();return}
  if(signature===lastSignature||performance.now()-pendingSince<115)return;
  lastSignature=signature;
  const chord=identifyChord(midis);
  lastChord=chord;
  chordPill.textContent=chord?'Chord: '+chord.name:(midis.length?'Chord: …':'Chord: —');
  chordPill.classList.toggle('recognised',!!chord);
  applyTheme(chord,midis);
}

function decorateBar(bar){
  if(bar.dataset.magic==='1')return;
  bar.dataset.magic='1';
  const rawHeight=parseFloat(bar.style.height)||54;
  const velocity=Math.max(0,Math.min(1,(rawHeight-54)/72));
  bar.style.setProperty('--velocity',velocity.toFixed(3));
  bar.style.setProperty('--bar-light',String(.72+velocity*.45));
  bar.style.opacity=String(.76+velocity*.24);
  const core=document.createElement('i');core.className='light-core';bar.appendChild(core);
  if(velocity>.58){
    const flare=document.createElement('i');flare.className='light-flare';bar.appendChild(flare);
  }
}

function scan(){
  if(!visual)return;
  visual.querySelectorAll('.bar').forEach(decorateBar);
  updateHarmony();
}

function injectStyles(){
  const style=document.createElement('style');
  style.textContent=`
  :root{--harmony-a:#60a5fa;--harmony-b:#22d3ee;--harmony-c:#c084fc;--harmony-rotate:0deg}
  #visual{isolation:isolate;background:#02030a!important}
  .harmony-aura{position:absolute;inset:-28%;z-index:0;pointer-events:none;opacity:var(--aura-energy,.28);filter:blur(46px) saturate(1.25);mix-blend-mode:screen;transition:opacity .9s ease,background 1.1s ease,transform 1.1s ease}
  .harmony-aura-one{background:radial-gradient(ellipse at 28% 84%,var(--harmony-a),transparent 42%),radial-gradient(ellipse at 72% 72%,var(--harmony-b),transparent 46%);animation:aura-float-one 11s ease-in-out infinite alternate}
  .harmony-aura-two{background:radial-gradient(ellipse at 48% 24%,var(--harmony-c),transparent 39%),radial-gradient(ellipse at 78% 35%,var(--harmony-a),transparent 36%);animation:aura-float-two 14s ease-in-out infinite alternate}
  #visual>*:not(.harmony-aura){position:relative}
  #visual>.bar,#visual>.smoke{position:absolute}
  .chord-pill{left:50%;top:58px;transform:translateX(-50%);font-size:.95rem;font-weight:900;letter-spacing:.02em;min-width:116px;text-align:center;transition:color .35s,border-color .35s,box-shadow .35s}
  .chord-pill.recognised{color:#fff;border-color:color-mix(in srgb,var(--harmony-a) 72%,white);box-shadow:0 0 22px color-mix(in srgb,var(--harmony-a) 45%,transparent)}
  .bar{--velocity:.45;--bar-light:1;background:linear-gradient(90deg,color-mix(in srgb,var(--harmony-a) 70%,#fff 12%),var(--harmony-a) 46%,var(--harmony-b) 100%)!important;box-shadow:0 0 calc(10px + var(--velocity)*24px) var(--harmony-a),0 0 calc(4px + var(--velocity)*12px) var(--harmony-c)!important;filter:brightness(var(--bar-light)) saturate(calc(.92 + var(--velocity)*.6));transition:filter .18s,box-shadow .25s}
  .bar::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.72),transparent 22%,rgba(255,255,255,.08) 68%,transparent);opacity:calc(.18 + var(--velocity)*.5);animation:light-breathe 1.65s ease-in-out infinite alternate}
  .light-core{display:block!important;visibility:visible!important;position:absolute;left:22%;right:22%;bottom:0;height:100%;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,.72),rgba(255,255,255,.04));filter:blur(calc(1px + var(--velocity)*2px));opacity:calc(.25 + var(--velocity)*.45)}
  .light-flare{display:block!important;visibility:visible!important;position:absolute;left:50%;bottom:-3px;width:180%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,#fff 0 5%,var(--harmony-a) 12%,transparent 66%);opacity:calc(.22 + var(--velocity)*.42);filter:blur(2px);animation:flare-pulse .75s ease-in-out infinite alternate}
  .smoke{background:radial-gradient(circle,#fff 0 11%,var(--harmony-b) 30%,var(--harmony-a) 48%,transparent 78%)!important;box-shadow:0 0 13px var(--harmony-a),0 0 6px var(--harmony-c)!important}
  @keyframes aura-float-one{from{transform:translate3d(-3%,4%,0) rotate(calc(var(--harmony-rotate) - 8deg)) scale(.94)}to{transform:translate3d(5%,-3%,0) rotate(calc(var(--harmony-rotate) + 12deg)) scale(1.08)}}
  @keyframes aura-float-two{from{transform:translate3d(4%,-2%,0) rotate(calc(var(--harmony-rotate) + 10deg)) scale(1.04)}to{transform:translate3d(-5%,5%,0) rotate(calc(var(--harmony-rotate) - 13deg)) scale(.93)}}
  @keyframes light-breathe{from{transform:translateY(6%);opacity:.18}to{transform:translateY(-5%);opacity:.72}}
  @keyframes flare-pulse{from{transform:translateX(-50%) scale(.78);opacity:.22}to{transform:translateX(-50%) scale(1.08);opacity:.68}}
  @media(max-width:760px){.chord-pill{top:54px;font-size:.82rem}}
  @media(prefers-reduced-motion:reduce){.harmony-aura,.bar::before,.light-flare{animation:none!important}}
  `;
  document.head.appendChild(style);
}

function init(){
  injectStyles();
  if(!ensureUI())return;
  const observer=new MutationObserver(scan);
  observer.observe(document.getElementById('keyboard'),{subtree:true,attributes:true,attributeFilter:['class']});
  observer.observe(visual,{childList:true,subtree:true});
  setInterval(scan,80);
  scan();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}());
