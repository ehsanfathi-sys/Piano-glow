(function(){
'use strict';
const KEY='pianoGlowAiSettingsV4';
const RESET='pianoGlowSafeThresholdsV1';
try{
  if(localStorage.getItem(RESET))return;
  let previous={};
  try{previous=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(error){}
  localStorage.setItem(KEY,JSON.stringify({
    confidence:78,
    frameConfidence:24,
    keySize:Number.isFinite(previous.keySize)?previous.keySize:1400,
    glow:/^#[0-9a-f]{6}$/i.test(previous.glow||'')?previous.glow:'#60a5fa'
  }));
  localStorage.setItem(RESET,'1');
}catch(error){}
}());
