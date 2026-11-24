import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InTuneHold,soundLoop,CustomSoundStore} from '../../lib/custom-sound.mjs';

function tone(pitch,frames=2048,offset=0,rate=48000){
  return Float32Array.from({length:frames},(_,i)=>.2*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*(i+offset)/rate));
}
test('every instrument pitch requires three continuous seconds in tune',()=>{
  for(let pitch=69;pitch<=89;pitch++){
    const hold=new InTuneHold(pitch);
    let result;
    for(let offset=0;offset<144000;offset+=2048){
      result=hold.push(tone(pitch,2048,offset),48000);
      assert.equal(result.inTune,true);
      assert.equal(result.complete,offset+2048>=144000);
    }
    const recording=hold.recording();
    assert.equal(recording.pcm.length,144000);
    assert.ok(Math.abs(recording.cents)<2);
  }
});
test('silence, another note, and drift beyond tolerance reset accumulated time',()=>{
  for(const interruption of [new Float32Array(2048),tone(71),tone(69.6)]){
    const hold=new InTuneHold(69);
    for(let offset=0;offset<70000;offset+=2048)hold.push(tone(69,2048,offset),48000);
    assert.ok(hold.frames>48000);
    const result=hold.push(interruption,48000);
    assert.equal(result.inTune,false);assert.equal(result.progress,0);
    assert.throws(()=>hold.recording());
    assert.ok(hold.push(tone(69),48000).progress<.02);
  }
});
test('sample rate changes start a fresh hold and returned PCM owns its storage',()=>{
  const hold=new InTuneHold(69);
  hold.push(tone(69),48000);
  assert.equal(hold.push(tone(69,2048,0,44100),44100).progress,2048/132300);
  for(let offset=2048;offset<132300;offset+=2048)hold.push(tone(69,2048,offset,44100),44100);
  const recording=hold.recording();
  hold.reset();
  assert.equal(recording.pcm.length,132300);
  assert.ok(recording.pcm.some(value=>value!==0));
});
test('loop construction retains recorded timbre with bounded, continuous playback',()=>{
  const pcm=tone(73,144000);
  const loop=soundLoop({pcm,rate:48000});
  assert.ok(loop.length>48000*2);
  assert.ok(loop.every(value=>Number.isFinite(value)&&Math.abs(value)<=.900001));
  assert.ok(Math.abs(loop[0]-loop.at(-1))<.04);
  assert.ok(pcm.some(value=>value!==0));
});
test('missing browser storage and malformed audio fail explicitly',async()=>{
  const store=new CustomSoundStore(null);
  await assert.rejects(store.all(),/storage is unavailable/);
  await assert.rejects(store.put({pitch:69,rate:48000,pcm:new Float32Array(10),cents:0}),/Invalid sound/);
});

test('the default tuning window accepts 39 cents on either side and rejects 45 cents',()=>{
  for(const drift of [-.39,.39]){
    const result=new InTuneHold(69).push(tone(69+drift),48000);
    assert.equal(result.inTune,true);
    assert.ok(result.progress>0);
  }
  for(const drift of [-.45,.45]){
    const result=new InTuneHold(69).push(tone(69+drift),48000);
    assert.equal(result.inTune,false);
    assert.equal(result.progress,0);
  }
});
