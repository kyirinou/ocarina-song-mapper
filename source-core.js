const Music = {
  tempo(onsets) {
    const gaps=onsets.slice(1).map((t,i)=>t-onsets[i]).filter(t=>t>=160&&t<=1600);
    if(!gaps.length)return 120;
    let best={cost:Infinity,bpm:120};
    for(let bpm=55;bpm<=190;bpm++){
      const beat=60000/bpm;
      const cost=gaps.reduce((sum,ms)=>{
        const q=Math.max(.25,Math.round(ms/beat*4)/4);
        return sum+Math.abs(ms/beat-q)+.015*Math.abs(Math.log2(q));
      },0)/gaps.length+.0003*Math.abs(bpm-110);
      if(cost<best.cost)best={cost,bpm};
    }
    return best.bpm;
  },
  transpose(pitches,steps){return pitches.map(p=>p===null?null:p+steps);},
  ticks(ms,bpm){return Math.max(1,Math.round(ms*bpm/15000));},
  validPitch(p){return p===null||(Number.isInteger(p)&&p>=12&&p<=127);},
  playable(p){return p===null||(Number.isInteger(p)&&p>=69&&p<=89);}
};

const root=document.getElementById('oc93');if(root.dataset.ready)return;root.dataset.ready='1';
const pcs={C:0,D:2,E:4,F:5,G:7,A:9,B:11},names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const toMidi=s=>{const m=s.match(/^([A-G])(#?)(\d)$/);return (+m[3]+1)*12+pcs[m[1]]+(m[2]?1:0)};
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
const name=m=>m===null?'Rest':names[((m%12)+12)%12]+(Math.floor(m/12)-1),hz=m=>440*Math.pow(2,(m-69)/12);
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
b.addEventListener('click',e=>{if(e.detail===0){selectPosition(i,e);showPlaybackFingering(i);stopStep();start('step',i);stepTimer=setTimeout(stopStep,320)}});
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
let stepTimer=null;
function stopStep(){
clearTimeout(stepTimer);stepTimer=null;end("step");
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
const pending=prepareSound();
if(pending){
const selected=soundChoice, sequence=run;
audio();
pending.then(()=>{
if(selected!==soundChoice||sequence!==run||id.startsWith('pointer-'))return;
start(id,idx,m);
}).catch(loadError);
return;
}
if(micSession?.mode==='convert'||voices.has(id))return;
const a=audio();if(!a){info.textContent='Audio unavailable';return}
const f=hz(m),t=a.currentTime,g=a.createGain();
const synth=soundChoice==='oc1';
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
function updatePlayButton(playing){
const label=playing?'Playing score':'Play all notes';
playBtn.setAttribute('aria-label',label);
playBtn.title=label;
playBtn.dataset.playing=String(playing);
}
function stopMelody(){stopRollCursor();highlightScore(-1);showPlaybackFingering(-1);find('score-playback').hidden=true;run++;if(timer!==null)clearTimeout(timer);timer=null;end('melody');updatePlayButton(false)}
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
function play(){
if(!score.events.length)return;
if(micSession?.mode==='convert'){report('Stop sound capture before playing the score.');return;}
if(recording){report('Finish the timing recording before playing the whole score.');return;}
stopStep();stopMelody();
if(editorView==='staff')drawStaff();
find('score-playback').hidden=false;
const token=run;let idx=0;updatePlayButton(true);
function next(){
if(token!==run)return;
if(idx>=score.events.length){if(loop)idx=0;else{stopMelody();info.textContent='Melody complete · '+score.events.length+' notes';return}}
const i=idx,duration=scoreDuration(i)/(+speed.value/100);
startRollCursor(i,duration);start('melody',i);highlightScore(i);showPlaybackFingering(i);bar.style.width=((i+1)/score.events.length*100)+'%';idx++;
timer=setTimeout(()=>{end('melody');timer=setTimeout(next,duration*.1)},duration*.9);
}
next();
}
playBtn.addEventListener('click',play);
root.querySelector('#oc93-score-stop').addEventListener('click',stopMelody);
root.querySelector('#oc93-stop').addEventListener('click',()=>{
finishRecording();stopStep();stopMelody();for(const id of [...voices.keys()])end(id);
display.textContent='—';info.textContent='Stopped';bar.style.width='0%';
});
root.querySelector('#oc93-loop').addEventListener('click',e=>{loop=!loop;e.currentTarget.textContent='↻ Loop: '+(loop?'On':'Off')});
speed.addEventListener('input',()=>root.querySelector('#oc93-speedlabel').textContent=speed.value+'%');
function editable(el){return el&&(/INPUT|TEXTAREA|SELECT/.test(el.tagName)||el.isContentEditable)}
document.addEventListener('keydown',e=>{
if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||editable(e.target)||tutorial.open||find('scan-review').open)return;
if(currentPage==='palette'){
const index=paletteKeys.indexOf(e.code.startsWith('Key')?e.code.slice(3):'');
if(index>=0){e.preventDefault();selectFingering(69+index,true);}
return;
}
if(currentPage==='practice'&&!rangeDialog.open&&e.code==='Enter'&&!e.shiftKey&&!e.defaultPrevented&&!e.target?.closest?.('button,a')){
e.preventDefault();advancePractice(false);return;
}
if(currentPage!=='editor'||micSession?.mode==='convert'||swapDialog.open||!noteMenu.hidden)return;
if(e.defaultPrevented||e.target?.closest?.('.osm-menubar, #oc93-piano-roll'))return;
if((e.code==='Delete'||e.code==='Backspace')&&e.target?.closest('#oc93-sequence .note')){
e.preventDefault();removeSelected();pads[position]?.focus({preventScroll:true});return;
}
if(!e.shiftKey&&(e.code==='ArrowLeft'||e.code==='ArrowUp'||e.code==='ArrowRight'||e.code==='ArrowDown')){
e.preventDefault();
selectPosition(position+(e.code==='ArrowLeft'||e.code==='ArrowUp'?-1:1));
return;
}
if(e.code==='Enter'&&!e.shiftKey){
e.preventDefault();
if(!score.events.length||(playedSelection&&position===score.events.length-1))return;
if(playedSelection)selectPosition(position+1);
stopMelody();stopStep();
start('step',position);
showPlaybackFingering(position);
recordStep(position);
stepTimer=setTimeout(stopStep,320);
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
