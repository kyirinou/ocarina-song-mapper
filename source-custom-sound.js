const customRecordings=new Map(),customBuffers=new Map(),customButtons=new Map();
let customLoaded=false,customLoadPromise=null,customStore=null,customSession=null,customPitch=69,customSaving=false,customAuditionTimer=null;
let customProfiles=[],customProfileId=null,customDirty=false,customProfileBusy=false;
function customStatus(text){find('custom-status').textContent=text;}
function updateCustomSounds(){
const complete=customRecordings.size===21,busy=customSaving||customProfileBusy;
for(const [pitch,button] of customButtons){
button.textContent=name(pitch)+(customRecordings.has(pitch)?' ✓':'');
button.setAttribute('aria-pressed',String(pitch===customPitch));
button.setAttribute('aria-label',name(pitch)+(customRecordings.has(pitch)?', recorded':', not recorded'));
}
const radio=soundRadios.find(entry=>entry.value==='custom');
radio.disabled=!complete||busy;
find('custom-radio-label').textContent=customProfileId?'Custom Sound · '+(customProfiles.find(profile=>profile.id===customProfileId)?.name??'My ocarina'):'Custom Sound';
const library=find('custom-library');
library.replaceChildren(new Option('Current recording',''),...customProfiles.map(profile=>new Option(profile.name+' · '+profile.recordings.length+'/21',profile.id)));
library.value=customProfileId??'';
library.disabled=!customLoaded||busy||Boolean(customSession);
find('custom-name').disabled=busy||Boolean(customSession);
for(const id of ['custom-save','custom-copy'])find(id).disabled=!customLoaded||!customRecordings.size||busy||Boolean(customSession);
find('custom-new').disabled=!customLoaded||busy||Boolean(customSession);
find('custom-delete').disabled=!customProfileId||busy||Boolean(customSession);
find('custom-use').disabled=!complete||busy||Boolean(customSession);
find('custom-hear').disabled=!customRecordings.has(customPitch)||Boolean(customSession?.hold)||Boolean(customSession&&!customSession.ready)||busy;
find('custom-start').disabled=!customLoaded||Boolean(customSession?.hold)||Boolean(customSession&&!customSession.ready)||busy;
find('custom-stop').disabled=!customSession;
find('custom-start').textContent=customRecordings.has(customPitch)?'Record again':'Record note';
find('custom-count').textContent=customRecordings.size+' / 21 notes recorded';
find('custom-target').textContent=name(customPitch);
const chart=find('custom-fingering');
chart.replaceChildren(makeFinger(customPitch));
chart.setAttribute('aria-label','Fingering for '+name(customPitch));
}
function ensureCustomPlayback(){
if(soundChoice==='custom'&&customRecordings.size!==21){
soundChoice='oc2';soundRadios.forEach(radio=>{radio.checked=radio.value==='oc2';});
try{localStorage.setItem('osm-ocarina-sound','oc2');}catch{}
}
}
function applyCustomState(state){
customRecordings.clear();customBuffers.clear();
for(const recording of state.recordings){
if(recording.pitch>=69&&recording.pitch<=89&&recording.pcm instanceof Float32Array&&
recording.pcm.length===Math.round(recording.rate*3)&&Number.isFinite(recording.cents))customRecordings.set(recording.pitch,recording);
}
customProfiles=state.profiles;customProfileId=state.draft.profileId??null;customDirty=Boolean(state.draft.dirty);
find('custom-name').value=state.draft.name??'';
ensureCustomPlayback();
}
async function customLibraryAction(action,message){
if(customProfileBusy||customSaving||customSession)return;
customProfileBusy=true;stopSound();stopSoundSample();stopCustomAudition();updateCustomSounds();
try{
await action();applyCustomState(await customStore.state());showCustomHold();customStatus(message);
}catch(error){customStatus(error.message);}
finally{customProfileBusy=false;updateCustomSounds();}
}
function confirmCustomReplacement(){
return !customDirty||!customRecordings.size||confirm('This recording has unsaved changes. Replace it? Save sound first to keep a named copy.');
}
function loadCustomSounds(){
if(!customLoadPromise)customLoadPromise=(async()=>{
try{
customStore??=new CustomSoundStore(window.indexedDB);
applyCustomState(await customStore.state());
customLoaded=true;
customStatus(customRecordings.size===21?'Your ocarina is ready to use.':'Choose a note, then start recording.');
ensureCustomPlayback();
updateCustomSounds();
}catch(error){
customStatus(error.message);
if(soundChoice==='custom'){soundChoice='oc2';soundRadios.forEach(radio=>{radio.checked=radio.value==='oc2';});}
throw error;
}
})().catch(error=>{customLoadPromise=null;throw error;});
return customLoadPromise;
}
function customSoundBuffer(context,pitch){
const nearest=[...customRecordings.keys()].sort((a,b)=>Math.abs(a-pitch)-Math.abs(b-pitch))[0];
const recording=customRecordings.get(nearest);
if(!recording)throw Error('Record your ocarina notes in Settings first.');
if(!customBuffers.has(nearest)){
const loop=soundLoop(recording),buffer=context.createBuffer(1,loop.length,recording.rate);
buffer.copyToChannel(loop,0);customBuffers.set(nearest,buffer);
}
return {buffer:customBuffers.get(nearest),rate:2**((pitch-nearest-recording.cents/100)/12)};
}
function showCustomHold(result={progress:0,cents:null,heard:null,inTune:false}){
find('custom-ring').style.setProperty('--hold-progress',result.progress);
find('custom-ring').classList.toggle('is-in-tune',result.inTune);
find('custom-ring').setAttribute('aria-valuenow',(result.progress*3).toFixed(1));
find('custom-time').textContent=(result.progress*3).toFixed(1)+' / 3 s';
find('custom-heard').textContent=result.heard===null?'—':name(result.heard);
const needle=find('custom-needle');needle.hidden=result.cents===null;
needle.style.left=(50+Math.max(-50,Math.min(50,result.cents??0)))+'%';
find('custom-cents').textContent=result.cents===null?'Waiting for a steady note.':
result.inTune?'In tune · keep holding':Math.abs(result.cents).toFixed(0)+' cents '+(result.cents<0?'flat':'sharp');
}
function stopCustomRecording(message){
const session=customSession;
customSession=null;
if(session){
session.node?.disconnect();session.source?.disconnect();session.mute?.disconnect();
if(session.node?.port){session.node.port.onmessage=null;session.node.port.close();}
if(session.node)session.node.onaudioprocess=null;
session.stream?.getTracks().forEach(track=>track.stop());
session.context?.close().catch(()=>{});
}
updateCustomSounds();
if(message){showCustomHold();customStatus(message);}
}
function stopCustomAudition(){
clearTimeout(customAuditionTimer);customAuditionTimer=null;end('custom-audition');
}
async function acceptCustomFrames(session,samples){
if(customSession!==session||customSaving||!session.hold)return;
const result=session.hold.push(samples,session.context.sampleRate);
showCustomHold(result);
if(!result.complete)return;
const recording=session.hold.recording(),pitch=session.pitch;
customSaving=true;session.hold=null;updateCustomSounds();
customStatus('Saving '+name(pitch)+'…');
let advance=false;
try{
await customStore.put(recording);
customRecordings.set(pitch,recording);customBuffers.delete(pitch);customDirty=true;
session.remaining=session.remaining.filter(note=>note!==pitch);
if(customSession===session&&!session.remaining.length){
stopCustomRecording();
customStatus(customRecordings.size===21?'Recording finished. Save sound to keep this version, or select Use my ocarina.':'Recording finished.');
}else if(customSession===session){
advance=true;
}else customStatus('Saved '+name(pitch)+'.');
}catch(error){customStatus('Could not save '+name(pitch)+'. '+error.message+' Your previous recording is retained.');}
finally{
customSaving=false;
if(advance&&customSession===session)nextCustomNote();
else updateCustomSounds();
}
}
const customWorkletCode=`
class OSMCapture extends AudioWorkletProcessor{
 constructor(){super();this.samples=new Float32Array(2048);this.offset=0;}
 process(inputs){
  const channel=inputs[0]?.[0];
  if(channel)for(let i=0;i<channel.length;i++){
   this.samples[this.offset++]=channel[i];
   if(this.offset===2048){
    this.port.postMessage(this.samples,[this.samples.buffer]);
    this.samples=new Float32Array(2048);this.offset=0;
   }
  }
  return true;
 }
}
registerProcessor('osm-capture',OSMCapture);
`;
function armCustomNote(pitch){
const session=customSession;
if(!session?.ready||customSaving)return;
stopCustomAudition();
customPitch=pitch;session.pitch=pitch;session.hold=new InTuneHold(pitch);
showCustomHold();updateCustomSounds();
customStatus('Play '+name(pitch)+' and hold it in tune for three seconds.');
}
function customRecordingQueue(pitch){
const pitches=Array.from({length:21},(_,index)=>69+(pitch-69+index)%21);
return customRecordings.has(pitch)?pitches:pitches.filter(note=>!customRecordings.has(note));
}
function nextCustomNote(){
if(!customSession?.ready||customSaving)return;
const next=customSession.remaining[0];
if(next!==undefined)armCustomNote(next);
}
async function startCustomRecording(){
if(customSaving||customProfileBusy)return;
if(customSession){customSession.remaining=customRecordingQueue(customPitch);armCustomNote(customPitch);return;}
stopSound();stopSoundSample();stopCustomAudition();stopMic('Microphone stopped.');
const session={pitch:customPitch,hold:null,ready:false,remaining:customRecordingQueue(customPitch)};
customSession=session;updateCustomSounds();showCustomHold();customStatus('Waiting for microphone permission…');
try{
if(!navigator.mediaDevices?.getUserMedia)throw Error('Open OSM over HTTPS or localhost to record your ocarina.');
const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
if(customSession!==session){stream.getTracks().forEach(track=>track.stop());return;}
session.stream=stream;
const Audio=window.AudioContext||window.webkitAudioContext;
session.context=new Audio();
await session.context.resume();
if(customSession!==session)return;
session.source=session.context.createMediaStreamSource(stream);
session.mute=session.context.createGain();session.mute.gain.value=0;
let workletReady=false;
if(session.context.audioWorklet){
const url=URL.createObjectURL(new Blob([customWorkletCode],{type:'text/javascript'}));
try{
await session.context.audioWorklet.addModule(url);
workletReady=true;
}catch{
// Directly opened offline files can deny blob worklet modules.
}finally{URL.revokeObjectURL(url);}
}
if(customSession!==session)return;
if(workletReady){
session.node=new AudioWorkletNode(session.context,'osm-capture');
session.node.port.onmessage=event=>{acceptCustomFrames(session,event.data);};
}else{
session.node=session.context.createScriptProcessor(2048,1,1);
session.node.onaudioprocess=event=>{acceptCustomFrames(session,Float32Array.from(event.inputBuffer.getChannelData(0)));};
}
session.source.connect(session.node);session.node.connect(session.mute);session.mute.connect(session.context.destination);
for(const track of stream.getTracks())track.addEventListener('ended',()=>{
if(customSession===session)stopCustomRecording('Microphone disconnected. Start recording to try again.');
});
session.ready=true;armCustomNote(customPitch);
}catch(error){
if(customSession===session)stopCustomRecording(error.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access and try again.':error.message);
}
}
for(let pitch=69;pitch<=89;pitch++){
const button=document.createElement('button');button.type='button';button.className='ctrl';
button.onclick=()=>{
if(customSaving||customProfileBusy)return;
stopCustomAudition();customPitch=pitch;
if(customSession?.ready&&!customRecordings.has(pitch)){customSession.remaining=customRecordingQueue(pitch);armCustomNote(pitch);return;}
if(customSession?.ready){customSession.pitch=pitch;customSession.hold=null;}
showCustomHold();updateCustomSounds();
customStatus('Record '+name(pitch)+' when you are ready.');
};
customButtons.set(pitch,button);find('custom-notes').append(button);
}
find('custom-name').oninput=()=>{customDirty=true;};
find('custom-save').onclick=()=>customLibraryAction(()=>customStore.saveProfile(find('custom-name').value,customProfileId),'Sound saved.');
find('custom-copy').onclick=()=>customLibraryAction(()=>customStore.saveProfile(find('custom-name').value),'New sound saved.');
find('custom-new').onclick=()=>{
if(!confirmCustomReplacement())return;
customLibraryAction(()=>customStore.newDraft(),'New sound ready. Your saved sounds are kept.');
};
find('custom-library').onchange=()=>{
const id=find('custom-library').value;
find('custom-library').value=customProfileId??'';
if(id===(customProfileId??'')||!confirmCustomReplacement())return;
customLibraryAction(()=>id?customStore.loadProfile(id):customStore.newDraft(),id?'Saved sound loaded.':'New sound ready.');
};
find('custom-delete').onclick=()=>{
const profile=customProfiles.find(entry=>entry.id===customProfileId);
if(!profile||!confirm('Delete “'+profile.name+'” and its current recording? This cannot be undone.'))return;
customLibraryAction(()=>customStore.deleteProfile(profile.id),'Saved sound deleted.');
};
find('custom-start').onclick=startCustomRecording;
find('custom-stop').onclick=()=>stopCustomRecording('Recording stopped.');
find('custom-hear').onclick=()=>{
stopSoundSample();stopCustomAudition();
start('custom-audition',-1,customPitch);
customAuditionTimer=setTimeout(stopCustomAudition,1600);
};
find('custom-use').onclick=()=>{
if(customRecordings.size!==21)return;
stopSound();stopSoundSample();
soundChoice='custom';soundRadios.forEach(radio=>{radio.checked=radio.value==='custom';});
try{localStorage.setItem('osm-ocarina-sound','custom');}catch{}
customStatus('Your ocarina is selected for playback.');
};
soundSettings.addEventListener('close',()=>{stopCustomRecording('Recording stopped.');stopCustomAudition();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCustomRecording('Recording stopped when you left the page.');stopCustomAudition();}});
window.addEventListener('pagehide',()=>{stopCustomRecording();stopCustomAudition();});
updateCustomSounds();
loadCustomSounds().catch(()=>{});
