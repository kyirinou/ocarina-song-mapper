const root=document.getElementById('oc93');if(root.dataset.ready)return;root.dataset.ready='1';
const pcs={C:0,D:2,E:4,F:5,G:7,A:9,B:11},names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];

const score={
events:[],tempo:130,tempoMap:[],meter:'4/4',key:'C',
get pitches(){return this.events.map(e=>e.pitch);},
get lengths(){return this.events.map(e=>e.ticks);},
get intervals(){return this.events.map(e=>e.ms);},
load(p){
this.events=p.notes.map((pitch,i)=>({pitch,ticks:p.lengths[i],ms:p.intervals[i]??null,velocity:p.performance?.[i]?.velocity,muted:p.performance?.[i]?.muted}));
this.tempo=p.tempo;this.tempoMap=(p.tempoMap??[]).map(mark=>({...mark}));this.key=Object.hasOwn(keySignatures,p.key)?p.key:'C';this.meter=meterTicks(p.meter)?p.meter:'4/4';
},
splice(index,remove,events=[]){
this.events.splice(index,remove,...events.map(e=>({...e,ms:e.ms??null})));
}
};
const name=pitchName,hz=m=>440*Math.pow(2,(m-69)/12);
const pads=[];
function renderPads(){
const grid=find('sequence');
pads.length=0;grid.replaceChildren();
for(let i=0;i<score.events.length;i++){
const b=document.createElement('button');
b.type='button';b.className='note';
if(!Music.playable(score.events[i].pitch))b.classList.add('outside-range');
b.innerHTML='<span class="num">'+(i+1)+'</span><span class="note-fingering" aria-hidden="true">'+(score.events[i].pitch===null?'—':fingeringCode(score.events[i].pitch))+'</span><span class="pitch">'+name(score.events[i].pitch)+'</span>';
b.setAttribute('aria-label','Note '+(i+1)+' '+name(score.events[i].pitch)+(Music.playable(score.events[i].pitch)?'':' (outside A4–F6)'));
grid.append(b);pads.push(b);
b.addEventListener('contextmenu',e=>{
e.preventDefault();
const rect=b.getBoundingClientRect();
openNoteMenu(i,e.clientX||rect.left,e.clientY||rect.bottom);
});
b.addEventListener('click',e=>{if(e.detail===0){selectPosition(i,e);showPlaybackFingering(i);playStep(i)}});
b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();selectPosition(i,e);showPlaybackFingering(i);b.focus({preventScroll:true});b.setPointerCapture(e.pointerId);start('pointer-'+i,i)});
b.addEventListener('pointerup',()=>end('pointer-'+i));b.addEventListener('pointercancel',()=>end('pointer-'+i));b.addEventListener('lostpointercapture',()=>end('pointer-'+i));
}
}
const positionLabel=root.querySelector('#oc93-position');
let position=0, playedSelection=false;
let selectedNotes=new Set(), selectionAnchor=0;
function selectPosition(index,event){
playedSelection=false;
const next=Math.max(0,Math.min(score.events.length-1,index));
if(!score.events.length){selectedNotes.clear();selectionAnchor=position=0;}
else if(event?.shiftKey){
selectedNotes=new Set();
for(let i=Math.min(selectionAnchor,next);i<=Math.max(selectionAnchor,next);i++)selectedNotes.add(i);
position=next;
}else if(event?.metaKey||event?.ctrlKey){
if(selectedNotes.has(next)){
if(selectedNotes.size>1)selectedNotes.delete(next);
}else selectedNotes.add(next);
position=selectedNotes.has(next)?next:[...selectedNotes].at(-1);
selectionAnchor=position;
}else{
selectionAnchor=position=next;selectedNotes=new Set([next]);
}
renderNoteSelection();
}
function renderNoteSelection(){
pads.forEach((pad,i)=>{
pad.classList.toggle('selected',selectedNotes.has(i));
pad.setAttribute('aria-pressed',String(selectedNotes.has(i)));
if(i===position)pad.setAttribute('aria-current','true');else pad.removeAttribute('aria-current');
});
positionLabel.textContent=!pads.length?'No notes yet':selectedNotes.size>1?selectedNotes.size+' notes selected':'Selected · Note '+(position+1)+' of '+score.events.length+' · '+name(score.events[position].pitch);
syncEdit();
highlightWorkspace();
updateRollSelection();
}
const display=root.querySelector('#oc93-now'),info=root.querySelector('#oc93-info'),bar=root.querySelector('#oc93-progress'),playBtn=root.querySelector('#oc93-play'),speed=root.querySelector('#oc93-speed');
let stepTimer=null, heldStepKey=null, stepVersion=0;
function stopStep(){
clearTimeout(stepTimer);stepTimer=null;heldStepKey=null;stepVersion++;end('step');
}
function playStep(index,key=null,pitch=score.events[index]?.pitch){
stopStep();
heldStepKey=key;
start('step',index,pitch);
if(key===null)stepTimer=setTimeout(stopStep,320);
}
let ctx=null,voices=new Map(),run=0,timer=null,loop=false;


const assetLoads=new Map();
function loadAsset(file){
if(!assetLoads.has(file)){
assetLoads.set(file,new Promise((resolve,reject)=>{
const script=document.createElement('script');
script.src=file;
script.onload=resolve;
script.onerror=()=>{script.remove();reject(new Error('Could not load '+file+'. Try again.'));};
document.head.append(script);
}).catch(error=>{assetLoads.delete(file);throw error;}));
}
return assetLoads.get(file);
}
const loadNotation=()=>window.ABCJS?Promise.resolve():loadAsset('abcjs.js');
async function loadPDFExport(){
if(!window.jspdf)await loadAsset('jspdf.js');
if(!window.jspdf.jsPDF.API.svg)await loadAsset('svg2pdf.js');
await loadNotation();
}
function prepareSound(){
if(soundChoice==='custom')return customLoaded?undefined:loadCustomSounds();
if(soundChoice==='oc1'||window.osmSamples?.[soundChoice])return;
return loadAsset(soundChoice+'.js');
}
function loadError(error){report(error.message);}
const ocarinaBuffers=new Map();
function ocarinaBuffer(context,preset){
if(ocarinaBuffers.has(preset))return ocarinaBuffers.get(preset);
const pcm=atob(preset[6]);
const buffer=context.createBuffer(1,pcm.length/2,preset[3]);
const samples=buffer.getChannelData(0);
for(let i=0;i<samples.length;i++){
const word=pcm.charCodeAt(i*2)+256*pcm.charCodeAt(i*2+1);
samples[i]=(word>=32768?word-65536:word)/32768;
}
ocarinaBuffers.set(preset,buffer);
return buffer;
}
function audio(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=ctx||new AC();ctx.resume();return ctx}
function end(id){
const v=voices.get(id);if(!v||!ctx)return;voices.delete(id);
const t=ctx.currentTime;v.g.gain.cancelScheduledValues(t);v.g.gain.setTargetAtTime(0,t,.03);
for(const o of v.oscs){try{o.stop(t+.18)}catch(e){}}
if(![...voices.values()].some(x=>x.idx===v.idx))pads[v.idx]?.classList.remove('active');
if(!voices.size)display.textContent='—';
}
function start(id,idx,m=score.events[idx]?.pitch){
if(m==null||(id==='melody'&&score.events[idx]?.muted))return;
const pending=id==='custom-audition'?undefined:prepareSound();
if(pending){
const selected=soundChoice, sequence=run, step=stepVersion;
audio();
pending.then(()=>{
if(selected!==soundChoice||sequence!==run||id.startsWith('pointer-'))return;
if(id==='step'&&step!==stepVersion)return;
if((id==='melody'||id==='tab-melody')&&(!melody||melody.paused||performance.now()-melody.started+melody.elapsed>=melody.duration*.9))return;
start(id,idx,m);
}).catch(loadError);
return;
}
if((customSession&&!(id==='custom-audition'&&customSession.ready&&!customSession.hold))||micSession?.mode==='convert'||voices.has(id))return;
const a=audio();if(!a){info.textContent='Audio unavailable';return}
const f=hz(m),t=a.currentTime,g=a.createGain();
const synth=soundChoice==='oc1'&&id!=='custom-audition';
g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime((synth?.17:.45)*(id==='melody'?(score.events[idx]?.velocity??100)/100:1),t+(synth?.06:.012));g.connect(a.destination);
const oscs=[];
if(synth){
const filter=a.createBiquadFilter();filter.type='lowpass';filter.frequency.value=Math.min(3900,f*5);filter.connect(g);

for(const [h,vol] of [[1,1],[2,.07],[3,.025]]){
const o=a.createOscillator(),v=a.createOscillator(),amp=a.createGain(),depth=a.createGain();
o.type='sine';o.frequency.value=f*h;amp.gain.value=vol;o.connect(amp);amp.connect(filter);
v.frequency.value=5.2;depth.gain.value=f*h*.0017;v.connect(depth);depth.connect(o.frequency);
o.start(t);v.start(t);oscs.push(o,v);
}
}else if(soundChoice==='custom'||id==='custom-audition'){
const sample=customSoundBuffer(a,m),source=a.createBufferSource();
source.buffer=sample.buffer;source.playbackRate.value=sample.rate;
source.loop=true;source.connect(g);
source.onended=()=>{source.disconnect();g.disconnect();};
source.start(t);oscs.push(source);
}else{
const samples=window.osmSamples[soundChoice];
const preset=samples.find(sample=>m<=sample[0])??samples.at(-1);
const source=a.createBufferSource();
source.buffer=ocarinaBuffer(a,preset);
source.playbackRate.value=2**((m-preset[1]+preset[2]/100)/12);
source.loop=true;
source.loopStart=preset[4]/preset[3];source.loopEnd=preset[5]/preset[3];
source.connect(g);source.onended=()=>{source.disconnect();g.disconnect();};
source.start(t);
oscs.push(source);
}
voices.set(id,{g,oscs,idx});pads[idx]?.classList.add('active');display.textContent=name(m);info.textContent=name(m)+' · '+f.toFixed(2)+' Hz';
}
let scorePlaybackIndex=-1;
function showPlaybackFingering(index){
const chart=find('playback-chart');
chart.replaceChildren();
if(index<0){
chart.setAttribute('aria-label','No note playing');
return;
}
const pitch=name(score.events[index].pitch);
chart.append(makeFinger(score.events[index].pitch));
chart.setAttribute('aria-label','Fingering for '+pitch);
}
let melody=null;
function updatePlayButton(playing){
const label=playing?'Playing score':melody?.paused?'Resume playback':'Play all notes';
playBtn.setAttribute('aria-label',label);
playBtn.title=label;
playBtn.dataset.playing=String(playing);
find('pause').disabled=!playing;
find('preview-pause').disabled=!playing;
find('preview-play').setAttribute('aria-label',melody?.paused?'Resume preview':'Play preview');
}
function silenceMelody(){
run++;
clearTimeout(timer);timer=null;
end('melody');end('tab-melody');
}
function stopMelody(){
melody=null;
silenceMelody();
clearTabPlayback();stopRollCursor();highlightScore(-1);
highlightScorePreview(-1);
showPlaybackFingering(-1);
find('score-playback').hidden=true;
updatePlayButton(false);
}
function pauseMelody(){
if(!melody||melody.paused)return;
melody.elapsed=Math.min(melody.duration,melody.elapsed+performance.now()-melody.started);
melody.paused=true;
silenceMelody();pauseRollCursor();updatePlayButton(false);
}
function scoreDuration(index){
const event=score.events[index];
if(event.ms!==null)return event.ms;
let cursor=score.events.slice(0,index).reduce((sum,n)=>sum+n.ticks,0), bpm=score.tempo, ms=0;
const end=cursor+event.ticks;
for(const change of score.tempoMap){
if(change.tick>=end)break;
if(change.tick>cursor){ms+=(change.tick-cursor)*15000/bpm;cursor=change.tick;}
bpm=change.bpm;
}
return ms+(end-cursor)*15000/bpm;
}
function play(fromTabs=editorView==='tabs'){
if(micSession?.mode==='convert'){report('Stop sound capture before playing the score.');return;}
if(recording){report('Finish the timing recording before playing the whole score.');return;}
if(melody?.paused&&melody.fromTabs===fromTabs){
melody.paused=false;updatePlayButton(true);playMelodyNote();return;
}
const tabNotes=fromTabs?nativeTabNotes():[];
const customTabs=fromTabs&&!tabNotesMatchScore(tabNotes);
const length=customTabs?tabNotes.length:score.events.length;
if(!length)return;
stopStep();stopMelody();
melody={fromTabs,tabNotes,customTabs,length,index:0,elapsed:0,paused:false};
if(fromTabs)prepareTabPlayback();
if(editorView==='staff')drawStaff();
find('score-playback').hidden=false;
updatePlayButton(true);playMelodyNote();
}
function playMelodyNote(){
const {index,customTabs,tabNotes,length,elapsed}=melody;
const duration=elapsed>0?melody.duration:(customTabs?60000/score.tempo:scoreDuration(index))/(+speed.value/100);
melody.duration=duration;
melody.started=performance.now();
const voice=customTabs?'tab-melody':'melody';
const token=++run;
const advance=()=>{
if(run!==token)return;
if(index+1===length&&!loop){
stopMelody();info.textContent='Melody complete · '+length+' notes';return;
}
melody.index=(index+1)%length;melody.elapsed=0;playMelodyNote();
};
const gate=duration*.9;
if(elapsed<gate){
start(voice,customTabs?-1:index,customTabs?tabNotes[index]:score.events[index].pitch);
timer=setTimeout(()=>{
if(run!==token)return;
end(voice);timer=setTimeout(advance,duration-gate);
},gate-elapsed);
}else timer=setTimeout(advance,Math.max(0,duration-elapsed));
if(!customTabs){
startRollCursor(index,duration,elapsed);highlightScore(index);showPlaybackFingering(index);
}
highlightTabPlayback(index);
highlightScorePreview(index);
bar.style.width=((index+1)/length*100)+'%';
}
playBtn.addEventListener('click',()=>play());
root.querySelector('#oc93-pause').onclick=pauseMelody;
root.querySelector('#oc93-score-stop').addEventListener('click',stopMelody);
root.querySelector('#oc93-stop').addEventListener('click',()=>{
finishRecording();stopStep();stopMelody();for(const id of [...voices.keys()])end(id);
display.textContent='—';info.textContent='Stopped';bar.style.width='0%';
});
root.querySelector('#oc93-loop').addEventListener('click',e=>{loop=!loop;e.currentTarget.textContent='↻ Loop: '+(loop?'On':'Off')});
speed.addEventListener('input',()=>root.querySelector('#oc93-speedlabel').textContent=speed.value+'%');
function editable(el){return el&&(/INPUT|TEXTAREA|SELECT/.test(el.tagName)||el.isContentEditable)}
document.addEventListener('keyup',e=>{
if(e.code!==heldStepKey)return;
e.preventDefault();stopStep();
},true);
document.addEventListener('keydown',e=>{
if(e.repeat){if(e.code===heldStepKey)e.preventDefault();return;}
if(e.ctrlKey||e.metaKey||e.altKey||soundSettings.open||tutorial.open||find('scan-review').open||find('score-preview').open)return;
const enter=e.code==='Enter'||e.code==='NumpadEnter';
if(editable(e.target)&&!(e.target===nativeTabText&&nativeTabText.readOnly))return;
if(currentPage==='palette'){
const index=paletteKeys.indexOf(e.code.startsWith('Key')?e.code.slice(3):'');
if(index>=0){e.preventDefault();selectFingering(69+index,true);}
return;
}
if(currentPage==='practice'&&practiceUploadedTabs&&!rangeDialog.open&&!e.shiftKey&&!e.defaultPrevented&&
(enter||['ArrowLeft','ArrowRight'].includes(e.code))&&!e.target?.closest?.('button,a')){
e.preventDefault();stepUploadedPractice(e.code==='ArrowLeft'?-1:1,enter?e.code:null);return;
}
if(currentPage==='practice'&&!rangeDialog.open&&enter&&!e.shiftKey&&!e.defaultPrevented&&!e.target?.closest?.('button,a')){
e.preventDefault();advancePractice(false);return;
}
if(currentPage!=='editor'||micSession?.mode==='convert'||swapDialog.open||!noteMenu.hidden)return;
if(e.defaultPrevented||e.target?.closest?.('.osm-menubar, #oc93-piano-roll, dialog'))return;
if(editorView==='tabs'&&e.code==='Escape'&&!melody&&!tabPlayback.hidden){
e.preventDefault();clearTabPlayback();return;
}
if(editorView==='tabs'&&!recording&&!e.shiftKey&&(enter||['ArrowLeft','ArrowRight'].includes(e.code))){
if(enter&&e.target.closest?.('button')&&!e.target.closest('.osm-viewbar'))return;
e.preventDefault();stepNativeTab(e.code==='ArrowLeft'?-1:1,enter?e.code:null);return;
}
if((e.code==='Delete'||e.code==='Backspace')&&e.target?.closest('#oc93-sequence .note')){
e.preventDefault();removeSelected();pads[position]?.focus({preventScroll:true});return;
}
if(!e.shiftKey&&(e.code==='ArrowLeft'||e.code==='ArrowUp'||e.code==='ArrowRight'||e.code==='ArrowDown')){
e.preventDefault();
selectPosition(position+(e.code==='ArrowLeft'||e.code==='ArrowUp'?-1:1));
return;
}
if(enter&&!e.shiftKey){
e.preventDefault();
if(!score.events.length||(playedSelection&&position===score.events.length-1))return;
if(playedSelection)selectPosition(position+1);
stopMelody();playStep(position,e.code);
showPlaybackFingering(position);
recordStep(position);
pads[position].scrollIntoView({block:'nearest'});
playedSelection=true;
return;
}
},true);
const find=id=>root.querySelector('#oc93-'+id);
const recordButton=find('record'), finishButton=find('finish'), recordStatus=find('record-status');
const bpmInput=find('bpm'), timingBody=find('timing'), share=find('share');
let recording=false, take=[];
const pitchText=m=>name(m).replace('♯','#');
const tempo=()=>Math.min(400,Math.max(20,Number(bpmInput.value)||120));
function recordStep(index){
if(!recording)return;
take.push({index,pitch:pitchText(score.events[index].pitch),time:performance.now()});
recordStatus.textContent=take.length+' notes captured · last note '+(index+1);
if(index===score.events.length-1)finishRecording();
}
function quantize(){
take.forEach((entry,i)=>{
entry.interval=take[i+1]?take[i+1].time-entry.time:null;
entry.beats=entry.interval===null?1:Math.max(.25,Math.round(entry.interval*tempo()/15000)/4);
});
renderTiming();
}
function finishRecording(){
if(!recording)return;
recording=false;find('quantize').disabled=false;find('apply-raw').disabled=false;recordButton.disabled=false;finishButton.disabled=true;
recordStatus.textContent=take.length?take.length+' notes recorded.':'No Enter presses recorded.';
if(take.length){timingPanel.open=true;find('score').hidden=false;quantize();}
}
recordButton.addEventListener('click',()=>{
if(micSession?.mode==='convert'){report('Stop sound capture before recording Enter timing.');return;}
stopMelody();stopStep();take=[];recording=true;playedSelection=false;
find('score').hidden=true;recordButton.disabled=true;finishButton.disabled=false;
recordStatus.textContent='Recording armed. The first Enter starts the clock.';
});
finishButton.addEventListener('click',finishRecording);
find('quantize').addEventListener('click',quantize);
bpmInput.addEventListener('change',updateNotation);
function renderTiming(){
timingBody.replaceChildren();
for(const entry of take){
const row=timingBody.insertRow();
row.insertCell().textContent=entry.index+1;
const pitch=row.insertCell().appendChild(document.createElement('select'));
for(let midi=69;midi<=89;midi++){
const label=pitchText(midi);
pitch.add(new Option(label,label));
}
pitch.add(new Option('Rest','Rest'));
if(!Array.from(pitch.options).some(option=>option.value===entry.pitch))pitch.add(new Option(entry.pitch,entry.pitch));
pitch.value=entry.pitch;
pitch.setAttribute('aria-label','Pitch for note '+(entry.index+1));
pitch.addEventListener('change',()=>{entry.pitch=pitch.value;updateNotation()});
const beats=row.insertCell().appendChild(document.createElement('input'));
beats.type='number';beats.min='.25';beats.step='.25';beats.value=entry.beats;
beats.setAttribute('aria-label','Beats for note '+(entry.index+1));
beats.addEventListener('change',()=>{
entry.beats=Math.max(.25,Math.round((Number(beats.value)||.25)*4)/4);
beats.value=entry.beats;updateNotation();
});
row.insertCell().textContent=entry.interval==null?'—':Math.round(entry.interval)+' ms';
}
updateNotation();
}
