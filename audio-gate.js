(function(){
'use strict';

const AC=window.AudioContext||window.webkitAudioContext;
if(!AC||!AC.prototype.createScriptProcessor)return;

const originalCreate=AC.prototype.createScriptProcessor;

AC.prototype.createScriptProcessor=function(){
  const node=originalCreate.apply(this,arguments);
  let handler=null;
  let noiseFloor=0.000035;
  let previousLevel=0;
  let gateOpenUntil=0;
  let lastForwarded=0;

  function rms(buffer){
    if(!buffer||!buffer.length)return 0;
    let sum=0;
    for(let i=0;i<buffer.length;i++)sum+=buffer[i]*buffer[i];
    return Math.sqrt(sum/buffer.length);
  }

  function wrapped(event){
    if(typeof handler!=='function')return;

    const input=event.inputBuffer&&event.inputBuffer.numberOfChannels
      ? event.inputBuffer.getChannelData(0)
      : null;
    const level=rms(input);
    const now=performance.now();

    const quiet=level<Math.max(0.00009,noiseFloor*1.35);
    if(quiet)noiseFloor=noiseFloor*0.985+level*0.015;

    const absoluteFloor=Math.max(0.00012,noiseFloor*2.5);
    const clearRise=level>=absoluteFloor&&level>=Math.max(previousLevel*1.22,noiseFloor*1.9);
    const strongSound=level>=Math.max(0.00055,noiseFloor*4.5);

    if(clearRise||strongSound)gateOpenUntil=now+1900;

    const gateOpen=now<gateOpenUntil;
    const releasePass=!gateOpen&&now-lastForwarded>=280&&level<absoluteFloor*1.25;

    if(gateOpen||releasePass){
      lastForwarded=now;
      handler.call(node,event);
    }

    previousLevel=level;
  }

  try{
    Object.defineProperty(node,'onaudioprocess',{
      configurable:true,
      enumerable:true,
      get(){return handler;},
      set(fn){handler=typeof fn==='function'?fn:null;}
    });
    node.addEventListener('audioprocess',wrapped);
  }catch(error){
    // Older browsers can keep the normal detector if this safety wrapper is unsupported.
  }

  return node;
};
}());
