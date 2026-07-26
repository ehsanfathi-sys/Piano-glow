(function(){
'use strict';
if(!window.tf||typeof tf.loadGraphModel!=='function')return;
const originalLoad=tf.loadGraphModel.bind(tf);
const SPLIT=39;

function balanceHandBands(tensor,threshold,maxBoost){
  if(!tensor||!tensor.shape||tensor.shape.length!==3||tensor.shape[2]!==88)return tensor;
  return tf.tidy(()=>{
    const low=tensor.slice([0,0,0],[-1,-1,SPLIT]);
    const high=tensor.slice([0,0,SPLIT],[-1,-1,88-SPLIT]);
    const lowMax=low.max(2,true);
    const highMax=high.max(2,true);
    const bothCredible=lowMax.greaterEqual(threshold).logicalAnd(highMax.greaterEqual(threshold));
    const epsilon=tf.scalar(1e-6);
    const lowScale=highMax.div(lowMax.add(epsilon)).sqrt().clipByValue(1,maxBoost);
    const highScale=lowMax.div(highMax.add(epsilon)).sqrt().clipByValue(1,maxBoost);
    const appliedLowScale=tf.where(bothCredible,lowScale,tf.onesLike(lowScale));
    const appliedHighScale=tf.where(bothCredible,highScale,tf.onesLike(highScale));
    const balancedLow=tf.where(low.greaterEqual(threshold*.58),low.mul(appliedLowScale),low);
    const balancedHigh=tf.where(high.greaterEqual(threshold*.58),high.mul(appliedHighScale),high);
    return tf.concat([balancedLow,balancedHigh],2).clipByValue(0,1);
  });
}

function shifted(tensor,offset){
  const frames=tensor.shape[1];
  if(offset<0){
    const amount=-offset;
    return tf.pad(tensor.slice([0,0,0],[-1,frames-amount,-1]),[[0,0],[amount,0],[0,0]]);
  }
  return tf.pad(tensor.slice([0,offset,0],[-1,frames-offset,-1]),[[0,0],[0,offset],[0,0]]);
}

function removeDecayTailOnsets(onsets,frames){
  if(!onsets||!frames||onsets.shape.length!==3||onsets.shape[1]<5)return onsets;
  return tf.tidy(()=>{
    const p1=shifted(onsets,-1),p2=shifted(onsets,-2),n1=shifted(onsets,1),n2=shifted(onsets,2);
    const neighbourMax=tf.maximum(tf.maximum(p1,p2),tf.maximum(n1,n2));
    const sharpAttack=onsets.greaterEqual(neighbourMax.mul(1.075).add(.014));
    const clearSupport=frames.greaterEqual(.205);
    const unquestionable=onsets.greaterEqual(.84).logicalAnd(frames.greaterEqual(.31));
    const keep=sharpAttack.logicalAnd(clearSupport).logicalOr(unquestionable);
    return tf.where(keep,onsets,tf.zerosLike(onsets));
  });
}

tf.loadGraphModel=async function(){
  const model=await originalLoad(...arguments);
  if(!model||typeof model.executeAsync!=='function')return model;
  const originalExecute=model.executeAsync.bind(model);
  model.executeAsync=async function(){
    const output=await originalExecute(...arguments);
    if(!Array.isArray(output)||output.length<2)return output;
    const balancedFrames=balanceHandBands(output[0],.12,1.20);
    const balancedOnsets=balanceHandBands(output[1],.24,1.30);
    const cleanedOnsets=removeDecayTailOnsets(balancedOnsets,balancedFrames);
    if(balancedFrames!==output[0])output[0].dispose();
    if(balancedOnsets!==output[1])output[1].dispose();
    if(cleanedOnsets!==balancedOnsets)balancedOnsets.dispose();
    output[0]=balancedFrames;
    output[1]=cleanedOnsets;
    return output;
  };
  return model;
};
}());