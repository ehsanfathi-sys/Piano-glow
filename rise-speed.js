(function(){
'use strict';
const slider=document.getElementById('riseSpeed');
const output=document.getElementById('riseSpeedValue');
if(!slider||!output)return;
const STORAGE_KEY='pianoGlowRiseSpeedV1';
const DEFAULT_SPEED=50;
function clamp(value){return Math.max(1,Math.min(100,Math.round(Number(value)||DEFAULT_SPEED)))}
function durationFor(speed){return 200/clamp(speed)}
function apply(value,save=true){
  const speed=clamp(value);
  slider.value=String(speed);
  output.value=String(speed);
  output.textContent=String(speed);
  document.documentElement.style.setProperty('--rise-duration',durationFor(speed)+'s');
  document.documentElement.dataset.riseSpeed=String(speed);
  if(save){try{localStorage.setItem(STORAGE_KEY,String(speed))}catch(e){}}
  window.dispatchEvent(new CustomEvent('pianoglow:risespeed',{detail:{speed,duration:durationFor(speed)}}));
}
let saved=DEFAULT_SPEED;
try{saved=clamp(localStorage.getItem(STORAGE_KEY)||DEFAULT_SPEED)}catch(e){}
apply(saved,false);
slider.addEventListener('input',()=>apply(slider.value));
slider.addEventListener('change',()=>apply(slider.value));
}());