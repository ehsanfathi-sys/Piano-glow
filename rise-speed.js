(function(){
'use strict';
const slider=document.getElementById('riseSpeed');
const output=document.getElementById('riseSpeedValue');
if(!slider||!output)return;
const STORAGE_KEY='pianoGlowRiseSpeedV1';
const DEFAULT_SPEED=50;
function clamp(value){return Math.max(1,Math.min(100,Math.round(Number(value)||DEFAULT_SPEED)))}
function durationFor(speed){
  const normalised=(clamp(speed)-1)/99;
  return 5-(4*normalised);
}
function apply(value,save=true){
  const speed=clamp(value);
  const duration=durationFor(speed);
  slider.value=String(speed);
  output.value=String(speed);
  output.textContent=String(speed);
  slider.setAttribute('aria-valuetext',speed+' speed, '+duration.toFixed(2)+' seconds to top');
  document.documentElement.style.setProperty('--rise-duration',duration+'s');
  document.documentElement.dataset.riseSpeed=String(speed);
  if(save){try{localStorage.setItem(STORAGE_KEY,String(speed))}catch(e){}}
  window.dispatchEvent(new CustomEvent('pianoglow:risespeed',{detail:{speed,duration}}));
}
let saved=DEFAULT_SPEED;
try{saved=clamp(localStorage.getItem(STORAGE_KEY)||DEFAULT_SPEED)}catch(e){}
apply(saved,false);
slider.addEventListener('input',()=>apply(slider.value));
slider.addEventListener('change',()=>apply(slider.value));
}());