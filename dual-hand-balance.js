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
    const onesLow=tf.onesLike(lowScale);
    const onesHigh=tf.onesLike(highScale);
    const appliedLowScale=tf.where(bothCredible,lowScale,onesLow);
    const appliedHighScale=tf.where(bothCredible,highScale,onesHigh);
    const lowGate=low.greaterEqual(threshold*.58);
    const highGate=high.greaterEqual(threshold*.58);
    const balancedLow=tf.where(lowGate,low.mul(appliedLowScale),low);
    const balancedHigh=tf.where(highGate,high.mul(appliedHighScale),high);
    return tf.concat([balancedLow,balancedHigh],2).clipByValue(0,1);
  });
}

tf.loadGraphModel=async function(){
  const model=await originalLoad(...arguments);
  if(!model||typeof model.executeAsync!=='function')return model;
  const originalExecute=model.executeAsync.bind(model);
  model.executeAsync=async function(){
    const output=await originalExecute(...arguments);
    if(!Array.isArray(output)||output.length<2)return output;
    const balancedFrames=balanceHandBands(output[0],.12,1.22);
    const balancedOnsets=balanceHandBands(output[1],.24,1.35);
    if(balancedFrames!==output[0])output[0].dispose();
    if(balancedOnsets!==output[1])output[1].dispose();
    output[0]=balancedFrames;
    output[1]=balancedOnsets;
    return output;
  };
  return model;
};
}());