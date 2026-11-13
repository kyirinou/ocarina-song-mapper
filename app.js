(()=>{
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
this.events=p.notes.map((pitch,i)=>({pitch,ticks:p.lengths[i],ms:p.intervals[i]??null}));
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
b.addEventListener('click',e=>{if(e.detail===0){selectPosition(i);showPlaybackFingering(i);stopStep();start('step',i);stepTimer=setTimeout(stopStep,320)}});
b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();selectPosition(i);showPlaybackFingering(i);b.focus({preventScroll:true});b.setPointerCapture(e.pointerId);start('pointer-'+i,i)});
b.addEventListener('pointerup',()=>end('pointer-'+i));b.addEventListener('pointercancel',()=>end('pointer-'+i));b.addEventListener('lostpointercapture',()=>end('pointer-'+i));
}
}
const positionLabel=root.querySelector('#oc93-position');
let position=0, playedSelection=false;
function selectPosition(index){
playedSelection=false;
pads[position]?.classList.remove('selected');
pads[position]?.removeAttribute('aria-current');
position=Math.max(0,Math.min(score.events.length-1,index));
if(!score.events.length){positionLabel.textContent='No notes yet';syncEdit();return;}
pads[position].classList.add('selected');
pads[position].setAttribute('aria-current','true');
positionLabel.textContent='Selected · Note '+(position+1)+' of '+score.events.length+' · '+name(score.events[position].pitch);
syncEdit();
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
if(m==null)return;
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
g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(synth?.17:.45,t+(synth?.06:.012));g.connect(a.destination);
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
function stopMelody(){highlightScore(-1);showPlaybackFingering(-1);find('score-playback').hidden=true;run++;if(timer!==null)clearTimeout(timer);timer=null;end('melody');playBtn.textContent='▶ Play all '+score.events.length+' notes'}
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
if(find('score').hidden)showScore(false);
find('score-playback').hidden=false;
const token=run;let idx=0;playBtn.textContent='♪ Playing…';
function next(){
if(token!==run)return;
if(idx>=score.events.length){if(loop)idx=0;else{stopMelody();info.textContent='Melody complete · '+score.events.length+' notes';return}}
const i=idx,duration=scoreDuration(i)/(+speed.value/100);
start('melody',i);highlightScore(i);showPlaybackFingering(i);bar.style.width=((i+1)/score.events.length*100)+'%';idx++;
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
if(e.defaultPrevented)return;
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
if(take.length){find('score').hidden=false;quantize();}
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
pitch.add(new Option('Rest','Rest'));pitch.value=entry.pitch;
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

function abcPitch(pitch){
if(pitch==='Rest')return 'z';
const [,letter,sharp,octave]=pitch.match(/^([A-G])(#?)([0-9])$/);
const high=Number(octave)>=5;
return (sharp?'^':'=')+(high?letter.toLowerCase():letter)+(high?"'".repeat(Number(octave)-5):','.repeat(4-Number(octave)));
}
function abcLength(value){
if(Number.isInteger(value))return String(value);
for(let denominator=2;denominator<=192;denominator++){
const numerator=Math.round(value*denominator);
if(numerator>0&&Math.abs(numerator/denominator-value)<1e-7)return numerator+'/'+denominator;
}
return Math.max(1,Math.round(value*960))+'/960';
}
function abcScore(entries=take,bpm=tempo()){
const abc=engravedScore(entries,bpm).abc;
const title=projectName.value.trim()||'Untitled song';
const author=authorInput.value.trim();
return abc.replace('X:1\n','X:1\nT:'+title+'\n'+(author?'C:'+author+'\n':''));
}
function tripletAt(entries,index,available){
const length=entries[index].beats*4;
const nominal=length*1.5;
if(![1,2,4,8].some(n=>Math.abs(nominal-n)<1e-7)||length*3>available+1e-7)return 0;
return entries.slice(index,index+3).length===3&&entries.slice(index,index+3).every(entry=>Math.abs(entry.beats*4-length)<1e-7)?Math.round(nominal):0;
}
let renderedScore='', scoreGroups=new Map();
function highlightScore(index){
if(scorePlaybackIndex===index)return;
for(const glyph of scoreGroups.get(scorePlaybackIndex)??[])glyph.classList.remove('playing-note');
scorePlaybackIndex=index;
if(!find('score').hidden&&take.length)drawStaff();

}
function engravedScore(entries,bpm=scorePlaybackIndex<0?tempo():score.tempo){
const measureTicks=meterTicks(score.meter);
const header=['X:1','M:'+score.meter,'L:1/16','Q:1/4='+bpm,'K:'+score.key+' clef=treble'];
const glyphIndexes=[];const tokens=[];
const lines=[];
let line='', measure=0, tick=0, elapsed=0, mark=0, tripletLeft=0, nominal=0, accidentals=new Map();
const marks=entries.length===score.events.length&&entries.every((entry,i)=>entry.index===i)?score.tempoMap:[];
for(const [index,entry] of entries.entries()){
while(marks[mark]&&marks[mark].tick<=elapsed+1e-7){
line+='[Q:1/4='+Number(marks[mark++].bpm.toFixed(3))+'] ';
}
const nextMark=marks.slice(mark).find(change=>change.tick>elapsed+1e-7);
const space=Math.min(measureTicks-tick,(nextMark?.tick??Infinity)-elapsed);
if(!tripletLeft){
nominal=tripletAt(entries,index,space);
if(nominal){tripletLeft=3;line+='(3:2:3';}
}
let remaining=Number((entry.beats*4).toFixed(8));
const pitch=abcPitch(entry.pitch), letter=pitch==='z'?pitch:pitch.slice(1);
while(remaining>1e-7){
while(marks[mark]&&marks[mark].tick<=elapsed+1e-7){
line+='[Q:1/4='+Number(marks[mark++].bpm.toFixed(3))+'] ';
}
const available=Math.min(remaining,measureTicks-tick,(marks[mark]?.tick??Infinity)-elapsed);
const beatSpace=4-tick%4;
const limit=tick%4&&available>beatSpace?beatSpace:available;
const length=tripletLeft?remaining:Number.isInteger(limit)?[16,12,8,6,4,3,2,1].find(value=>value<=limit):limit;
const accidental=pitch[0]==='^'?'^':'=';
const prefix=pitch==='z'||(accidentals.get(letter)??signatureAccidental(letter[0].toUpperCase()))===accidental?'':accidental;
accidentals.set(letter,accidental);
tokens.push({index:entry.index,line:lines.length,offset:line.length});
const written=tripletLeft?nominal:length;
line+=prefix+letter+(written===1?'':abcLength(written));
glyphIndexes.push(entry.index);
remaining-=length;tick+=length;elapsed+=length;if(tripletLeft)tripletLeft--;
if(remaining>1e-7)line+=pitch==='z'?' ':'-';
if(Math.abs(tick-measureTicks)<1e-7){
line+=' | ';tick=0;accidentals.clear();measure++;
if(measure%3===0){lines.push(line);line='';}
}else if(tick%4===0||length>=4){line+=' ';}
}
}
if(line.trim())lines.push(line.trimEnd());
if(lines.length)lines[lines.length-1]=lines.at(-1).replace(/\|\s*$/,'').trimEnd()+' |]';
const offsets=[];let cursor=header.join('\n').length+1;
for(const row of lines){offsets.push(cursor);cursor+=row.length+1;}
return {abc:header.concat(lines).join('\n'),glyphIndexes,engravedEvents:new Map(tokens.map(t=>[offsets[t.line]+t.offset,t.index]))};
}
function drawStaff(){
if(!window.ABCJS){loadNotation().then(()=>{if(!find('score').hidden)drawStaff();}).catch(loadError);return;}
const staff=find('staff');
const entries=scorePlaybackIndex<0?take:score.pitches.map((m,index)=>({index,pitch:pitchText(m),beats:score.events[index].ticks/4}));
const {abc,glyphIndexes,engravedEvents}=engravedScore(entries);
const renderKey=abc+'\n'+glyphIndexes.join(',');
if(renderKey!==renderedScore||!staff.firstChild){
window.ABCJS.renderAbc(staff,abc,{responsive:'resize',add_classes:true,staffwidth:720,oneSvgPerLine:true,clickListener:element=>{
if(element.el_type!=='note'||scorePlaybackIndex>=0)return;
const index=engravedEvents.get(element.startChar);
if(index===undefined)return;
selectPosition(index);showPlaybackFingering(index);
const controls=find('edit-pitch').closest('details');
if(controls)controls.open=true;
find('edit-pitch').focus({preventScroll:true});
}});
renderedScore=renderKey;scoreGroups=new Map();
staff.querySelectorAll('.abcjs-note,.abcjs-rest').forEach((glyph,i)=>{
const index=glyphIndexes[i];
if(!scoreGroups.has(index))scoreGroups.set(index,[]);
scoreGroups.get(index).push(glyph);
});
}
for(const glyph of scoreGroups.get(scorePlaybackIndex)??[])glyph.classList.add('playing-note');
}
function updateNotation(){
if(!take.length)return;
drawStaff();
const start=take[0].time;
const rows=take.map(entry=>[entry.index+1,entry.pitch,entry.time===null?'':Math.round(entry.time-start),
entry.interval==null?'':Math.round(entry.interval),entry.beats].join(','));
share.value=abcScore()+'\n\nSequence note,Pitch,Onset ms,Interval to next ms,Edited beats\n'+rows.join('\n');
}
find('export').addEventListener('click',()=>{
if(score.events.length)download('ocarina-score.abc',abcScore(scoreEntries(),score.tempo)+'\n');
else report('Add notes before exporting a score.');
});
find('copy').addEventListener('click',async()=>{
const status=find('copy-status');
try{await navigator.clipboard.writeText(share.value);status.textContent='Copied. Paste into chat.'}
catch{share.focus();share.select();status.textContent=document.execCommand('copy')?'Copied. Paste into chat.':'Text selected. Use your copy shortcut, then paste into chat.'}
});

const projectStatus=find('project-status'), projectMenu=find('projects'), projectName=find('project-name'), authorInput=find('author');
const pitchEditor=find('edit-pitch'), beatsEditor=find('edit-beats');
const storageKey='ocarina-song-mapper-v1';
let projects=[], projectId=null, draftChanged=false;
function report(message){projectStatus.textContent=message;}
function download(filename,contents){
if(window.webkit?.messageHandlers?.save){
window.webkit.messageHandlers.save.postMessage({filename,contents});return;
}
const url=URL.createObjectURL(new Blob([contents],{type:'text/plain'}));
const link=document.createElement('a');link.href=url;link.download=filename;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function meterTicks(value){
const match=typeof value==='string'&&value.match(/^([1-9]|1[0-9]|2[0-4])\/(2|4|8|16)$/);
return match?16*Number(match[1])/Number(match[2]):0;
}
const ScoreModel={
validate(p){
return Boolean(p&&typeof p.id==='string'&&typeof p.title==='string'&&
(p.author===undefined||typeof p.author==='string')&&Array.isArray(p.notes)&&p.notes.every(Music.validPitch)&&
Array.isArray(p.lengths)&&p.lengths.length===p.notes.length&&p.lengths.every(n=>Number.isFinite(n)&&n>0)&&
Number.isFinite(p.tempo)&&p.tempo>=20&&p.tempo<=400&&Array.isArray(p.intervals)&&
(p.tempoMap===undefined||(Array.isArray(p.tempoMap)&&p.tempoMap.every((mark,i)=>mark&&Number.isFinite(mark.tick)&&mark.tick>=0&&Number.isFinite(mark.bpm)&&mark.bpm>0&&(!i||mark.tick>p.tempoMap[i-1].tick))))&&
p.intervals.length<=p.notes.length&&p.intervals.every(n=>n===null||(Number.isFinite(n)&&n>0)));
}
};
const keySignatures={Cb:-7,Gb:-6,Db:-5,Ab:-4,Eb:-3,Bb:-2,F:-1,C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7};
function signatureAccidental(letter){
const count=keySignatures[score.key];
return (count<0?'BEADGCF':'FCGDAEB').slice(0,Math.abs(count)).includes(letter)?(count<0?'_':'^'):'=';
}
function snapshot(){
return {id:projectId,title:projectName.value.trim()||'Untitled song',author:authorInput.value.trim(),notes:[...score.pitches],
lengths:[...score.lengths],tempo:score.tempo,tempoMap:score.tempoMap.map(mark=>({...mark})),meter:score.meter,key:score.key,intervals:Array.from(score.intervals,n=>n??null),
tabs:{layout:tabLayout.value,title:tabTitle.value,author:tabAuthor.value}};
}
function validProject(project){return ScoreModel.validate(project);}
function restoreSavedProjects(){
let raw;
try{raw=localStorage.getItem(storageKey);}catch{return;}
if(!raw)return;
try{
const saved=JSON.parse(raw);
if(!Array.isArray(saved?.projects))throw Error('Invalid library');
const recovered=saved.projects.filter(validProject);
if(recovered.length!==saved.projects.length){
localStorage.setItem(storageKey+'-recovery',raw);
report('Some saved scores could not be opened. A recovery copy was kept.');
}
projects=recovered.filter(project=>project.id!=='starter');
projectId=saved.active;
}catch{
try{if(!localStorage.getItem(storageKey+'-recovery'))localStorage.setItem(storageKey+'-recovery',raw);}catch{}
report('The saved library could not be read. You can restore scores from a project backup.');
}
}
function persist(){
try{localStorage.setItem(storageKey,JSON.stringify({projects,active:projectId}));return true;}
catch{report('Local storage is unavailable. Export the project to save a backup.');return false;}
}
function refreshMenu(){
projectMenu.replaceChildren();
if(!projects.length)projectMenu.textContent='No saved scores yet.';
for(const project of projects){
const button=document.createElement('button');
button.className='ctrl';
button.textContent=project.title+(project.author?' · '+project.author:'')+' · '+project.notes.length+' notes';
button.addEventListener('click',()=>{
if(project.id===projectId){openPage('editor');return;}
if(!canReplace())return;
loadProject(project);persist();openPage('editor');
});
projectMenu.append(button);
}
}
let currentPage='home';
function openPage(page){
if(currentPage==='practice'&&page!==currentPage){find('practice-metronome').checked=false;stopPracticeClick();}
if(currentPage!==page){pdfRequest++;report('');stopMic('Microphone stopped.');closeNoteMenu();}
if(currentPage!==page&&(currentPage==='editor'||currentPage==='palette'))stopSound();
for(const id of ['home','library','import','palette','editor','help','tuner','practice','practice-setup'])find('page-'+id).hidden=id!==page;
find('home-nav').hidden=page==='home';
currentPage=page;
if(page==='editor'||page==='palette')prepareSound()?.catch(loadError);
window.scrollTo(0,0);
}
root.querySelectorAll('[data-oc-page]').forEach(button=>{
button.addEventListener('click',()=>{openPage(button.dataset.ocPage);if(button.dataset.ocPage==='practice-setup')choosePractice(null);});
});
find('home').addEventListener('click',()=>openPage('home'));
function stopSound(){
stopStep();stopMelody();for(const id of [...voices.keys()])end(id);
}
function refreshSong(index=0){
find("range-warning").hidden=score.pitches.every(Music.playable);
renderPads();selectPosition(index);
playBtn.disabled=!score.events.length;
playBtn.textContent='▶ Play all '+score.events.length+' notes';
info.textContent=score.events.length+' notes · '+score.tempo+' BPM'+(score.intervals.some(n=>n!=null)?' · Recorded timing':'');
bar.style.width='0%';
syncTabLayout();
}
function loadProject(p){
finishRecording();stopSound();
if(micSession?.mode==='convert')stopMic();
capturedSound=[];soundNote=null;find('convert-use').disabled=true;
find('convert-preview').textContent='';soundStatus.textContent='Start the microphone when you’re ready.';
find('convert-open').open=false;
projectId=p.id;projectName.value=p.title;authorInput.value=p.author??'';
score.load(p);find("meter").value=score.meter;find("score-key").value=score.key;
bpmInput.value=score.tempo;take=[];find('score').hidden=true;
recordStatus.textContent='Select a starting note, then record and tap Enter in rhythm.';
draftChanged=false;refreshMenu();syncTabLayout(true);
if(p.tabs&&typeof p.tabs.layout==='string'&&p.tabs.layout.replace(/\s/g,'')===layoutSequence){
tabLayout.value=p.tabs.layout;tabTitle.value=p.tabs.title??'';tabAuthor.value=p.tabs.author??'';
}
refreshSong();
historyPast.length=0;historyFuture.length=0;lastScore=captureEdit();updateHistoryButtons();drawTimeline();find('editor-tempo').value=score.tempo;
}
function canReplace(){return !draftChanged||window.confirm('Discard unsaved song changes?');}
find('save').addEventListener('click',()=>{
const project=snapshot();
projects=projects.filter(p=>p.id!==projectId).concat(project);
projectName.value=project.title;refreshMenu();
if(persist()){draftChanged=false;report('Saved '+project.title+'.');}
});
projectName.addEventListener('input',()=>{draftChanged=true;});
authorInput.addEventListener('input',()=>{draftChanged=true;});
function newId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
find('new').addEventListener('click',()=>{
if(!canReplace())return;
loadProject({id:newId(),title:'Untitled song',author:'',notes:[],lengths:[],tempo:130,intervals:[]});
openPage('editor');projectName.focus();
});
find('backup').addEventListener('click',()=>download('ocarina-project.json',JSON.stringify(snapshot(),null,2)));
find('restore').addEventListener('change',async e=>{
const file=e.target.files[0];e.target.value='';
if(!file)return;
try{
const project=JSON.parse(await file.text());
if(!validProject(project))throw Error('This file is not an Ocarina Song Mapper project.');
if(canReplace()){loadProject({...project,id:newId()});draftChanged=true;openPage('editor');report('Project imported. Click Save project to keep it in the menu.');}
}catch(error){report(error.message);}
});
function syncEdit(){
const hasNote=score.events.length>0;
find('pitch-shifts').hidden=!hasNote||score.events[position].pitch===null;
pitchEditor.disabled=!hasNote;beatsEditor.disabled=!hasNote;
pitchEditor.querySelector('[data-outside]')?.remove();
if(hasNote&&!Music.playable(score.events[position].pitch)){
const option=new Option(name(score.events[position].pitch)+' (outside A4–F6)',score.events[position].pitch);
option.dataset.outside='';pitchEditor.add(option);
}
if(hasNote){pitchEditor.value=score.events[position].pitch??'rest';beatsEditor.value=score.events[position].ticks/4;}
find('earlier').disabled=!hasNote||position===0;
find('later').disabled=!hasNote||position===score.events.length-1;
find('remove').disabled=!hasNote;find('swap-note').disabled=!hasNote;
}
function previewPitch(m){
stopStep();start('step',-1,m);stepTimer=setTimeout(stopStep,320);
}
const paletteKeys='QWERTYUIOPASDFGHJKLZXCVBNM'.slice(0,21).split('');
const paletteButtons=[];
function fingeringCode(midi){if(midi===null)return "r";return Music.playable(midi)?String.fromCharCode(65+midi-69):"?";}
function selectFingering(midi,play=false){
for(const [i,button] of paletteButtons.entries())button.setAttribute('aria-pressed',String(i===midi-69));
const pitch=name(midi);
find('fingering-pitch').textContent=pitch;
const glyph=find('fingering-glyph');
glyph.textContent=fingeringCode(midi);
glyph.setAttribute('aria-label','12-hole C ocarina fingering for '+pitch);
if(play)previewPitch(midi);
}
for(let midi=69;midi<=89;midi++){
pitchEditor.add(new Option(name(midi),midi));
const button=document.createElement('button');
const key=paletteKeys[midi-69];
button.className='ctrl palette-key';
button.append(name(midi));
const label=document.createElement('kbd');
label.textContent=key;button.append(label);
button.setAttribute('aria-keyshortcuts',key);
button.addEventListener('click',()=>selectFingering(midi,true));
find('palette').append(button);paletteButtons.push(button);
}
selectFingering(69);
function edited(index,structure=false){
stopSound();
if(structure){finishRecording();take=[];find('score').hidden=true;}
draftChanged=true;refreshSong(index);rememberEdit();
if(!find('score').hidden)showScore(false);
}
pitchEditor.addEventListener('change',()=>{
score.events[position].pitch=pitchEditor.value==='rest'?null:Number(pitchEditor.value);edited(position);if(score.events[position].pitch!==null)previewPitch(score.events[position].pitch);
});
beatsEditor.addEventListener('change',()=>{
score.events[position].ticks=Math.max(1,Math.round((Number(beatsEditor.value)||1)*4));
score.events[position].ms=null;edited(position);
});
find('insert').addEventListener('click',()=>{
const i=score.events.length?position+1:0;
score.splice(i,0,[{pitch:score.events[position]?.pitch??72,ticks:4}]);edited(i,true);
});
function removeSelected(){
if(!score.events.length)return;
if(recording||micSession?.mode==='convert'){report('Finish recording before removing a note.');return;}
score.splice(position,1);edited(position,true);
}
find('remove').addEventListener('click',removeSelected);
function move(offset){
const i=position+offset;
[score.events[position],score.events[i]]=[score.events[i],score.events[position]];
edited(i,true);
}
find('earlier').addEventListener('click',()=>move(-1));
find('later').addEventListener('click',()=>move(1));
async function copyField(field,message){
try{await navigator.clipboard.writeText(field.value);report(message);}
catch{
field.focus();field.select();
if(document.execCommand('copy'))report(message);
else report('Text selected. Press Command-C to copy.');
}
}


function parseABC(abc){
const tunes=window.ABCJS.parseOnly(abc);
if(tunes.length!==1)throw Error('Import one ABC tune at a time.');
const tune=tunes[0];
if(tune.warnings?.length)throw Error('ABC could not be read cleanly: '+tune.warnings[0].replace(/<[^>]*>/g,''));
const pitches=[],lengths=[];
const scale=[0,2,4,5,7,9,11];
const alterations={flat:-1,sharp:1,natural:0,dblflat:-2,dblsharp:2};
const tempoMap=[];let elapsed=0;
let triplet=1,tie=false,accidentals=new Map(),key=new Map();
for(const line of tune.lines){
if(!line.staff)continue;
if(line.staff.length!==1||line.staff[0].voices.length!==1)throw Error('ABC import supports a single melody voice.');
const staff=line.staff[0];
function setKey(spec){
key=new Map((spec.accidentals??[]).map(({note,acc})=>[note.toUpperCase(),alterations[acc]??0]));
}
if(staff.key)setKey(staff.key);
for(const event of staff.voices[0]){
if(event.el_type==='key'){setKey(event);accidentals.clear();continue;}
if(event.el_type==='bar'){
if(/repeat/.test(event.type)||event.startEnding)throw Error('Expand repeats and alternate endings before importing ABC.');
accidentals.clear();continue;
}
if(event.el_type==='tempo'){
const bpm=event.bpm*(event.duration?.[0]??.25)*4;
if(Number.isFinite(bpm)&&bpm>0){
if(tempoMap.at(-1)?.tick===elapsed)tempoMap.pop();
tempoMap.push({tick:elapsed,bpm});
}
continue;
}
if(event.el_type!=='note')continue;
if(event.gracenotes?.length||event.pitches?.length>1)throw Error('Remove grace notes and chords before importing.');
if(event.startTriplet)triplet=event.tripletMultiplier??2/3;
const duration=event.duration*triplet*16;
if(event.endTriplet)triplet=1;
if(!Number.isFinite(duration)||duration<=0)throw Error('Unsupported ABC duration.');
const note=event.pitches?.[0];
let midi=null;
if(note){
const step=(note.pitch%7+7)%7,letter='CDEFGAB'[step];
if(note.accidental)accidentals.set(note.pitch,alterations[note.accidental]);
const alter=accidentals.get(note.pitch)??key.get(letter)??0;
midi=60+12*Math.floor(note.pitch/7)+scale[step]+alter;
if(tie&&note.endTie)midi=pitches.at(-1);
}
if(tie&&note?.endTie)lengths[lengths.length-1]+=duration;
else{pitches.push(midi);lengths.push(duration);}
tie=Boolean(note?.startTie);elapsed+=duration;
}
}
return {pitches,lengths,tempoMap};
}
function parseSong(input){
const source=input.trim().replace(/\\(?=\r?$)/gm,'').replace(/\\=/g,'=');
if(!source)throw Error('Paste note names or ABC notation first.');
if(!/^X:/m.test(source)){
const tokens=source.toUpperCase().replace(/♯/g,'#').replace(/♭/g,'B').split(/[\s,;–—-]+/).filter(Boolean);
const notes=tokens.map(token=>{
const match=token.match(/^([A-G])([#B]?)([0-9])([#B]?)$/);
if(!match||(match[2]&&match[4]))throw Error('Could not read “'+token+'”. Use note names like Bb3, C#5, or F6.');
const [,letter,before,octave,after]=match;
const accidental=before||after;
return (Number(octave)+1)*12+pcs[letter]+(accidental==='#'?1:accidental==='B'?-1:0);
});
return {notes,lengths:notes.map(()=>4),tempo:130,intervals:[]};
}
const abc=source.split(/^Sequence note,/m)[0];
const tempo=Number(abc.match(/^Q:\s*(?:1\/4\s*=\s*)?(\d+)/m)?.[1]??130);
const {pitches,lengths,tempoMap}=parseABC(abc);
const raw=source.split(/^Sequence note,.*$/m)[1]?.trim().split(/\r?\n/)??[];
const intervals=raw.length===pitches.length?raw.map(row=>{const n=Number(row.split(',')[3]);return Number.isFinite(n)&&n>0?n:null;}):[];
const key=abc.match(/^K:\s*([A-G][#b]?)(?:maj)?(?=\s|$)/m)?.[1];
return {notes:pitches,lengths,tempo,tempoMap,key,meter:abc.match(/^M:\s*(\d+\/\d+)/m)?.[1],intervals:[],importedIntervals:intervals,
title:abc.match(/^T:\s*(.*)$/m)?.[1]?.trim(),author:abc.match(/^C:\s*(.*)$/m)?.[1]?.trim()};
}
find('import').addEventListener('click',async()=>{
try{
if(/^X:/m.test(find('import-text').value))await loadNotation();
if(currentPage!=='import')return;
const parsed=parseSong(find('import-text').value);
const project={...parsed,id:newId(),title:parsed.title||'Imported score',author:parsed.author||''};
if(!project.notes.length||!validProject(project))throw Error('Use valid note names, positive durations, and a tempo from 20 to 400 BPM.');
if(recording){report('Finish recording before importing a song.');return;}
if(!canReplace())return;
loadProject(project);draftChanged=true;openPage('editor');
if(parsed.importedIntervals?.some(n=>n>0)){
showScore();
let time=0;
take.forEach((entry,i)=>{entry.time=time;entry.interval=parsed.importedIntervals[i];time+=entry.interval??0;});
find('apply-raw').disabled=false;renderTiming();
}
report('Imported '+score.events.length+' notes. Click Save project to keep your changes.');
}catch(error){report(error.message);}
});
function showScore(scroll=true){
if(!score.events.length){report('Add notes before opening the score.');return;}
if(recording){report('Finish recording before opening the score.');return;}
bpmInput.value=score.tempo;
take=score.pitches.map((m,index)=>({index,pitch:pitchText(m),time:null,interval:null,beats:score.events[index].ticks/4}));
find('apply-raw').disabled=true;find('quantize').disabled=true;find('score').hidden=false;renderTiming();
if(scroll)find('score').scrollIntoView({block:'start'});
}
find('view').addEventListener('click',()=>showScore());
function applyTake(raw){
if(!take.length||recording)return;
const indexes=new Set(take.map(entry=>entry.index));
if(indexes.size!==take.length||take.some(entry=>entry.index>=score.events.length)){
report('This take visits a note more than once or belongs to another sequence. Record a forward pass to apply it.');return;
}
if(raw&&take.some((entry,i)=>i>0&&entry.index!==take[i-1].index+1)){
report('Exact timing needs a continuous forward take.');return;
}
stopSound();
score.tempo=tempo();
for(const entry of take){
score.events[entry.index].pitch=entry.pitch==='Rest'?null:toMidi(entry.pitch);
score.events[entry.index].ticks=entry.beats*4;
score.events[entry.index].ms=raw&&entry.interval>0?entry.interval:null;
}
draftChanged=true;refreshSong(position);rememberEdit();
report(raw?'Play all now uses the captured intervals for this take.':'Play all now uses the edited score durations.');
}
find('apply-timing').addEventListener('click',()=>applyTake(false));
find('apply-raw').addEventListener('click',()=>applyTake(true));

find('pdf').addEventListener('click',async()=>{
if(!score.events.length){report('Add notes before exporting a PDF.');return;}
const button=find('pdf');
const title=projectName.value.trim()||'Untitled song';
const credit=authorInput.value.trim();
const staging=document.createElement('div');
staging.setAttribute('aria-hidden','true');
staging.style.cssText='position:fixed;top:0;left:-10000px;width:720px;pointer-events:none';
document.body.append(staging);
button.disabled=true;
try{
await loadPDFExport();
const entries=score.pitches.map((m,index)=>({index,pitch:pitchText(m),beats:score.events[index].ticks/4}));
window.ABCJS.renderAbc(staging,engravedScore(entries,score.tempo).abc,{staffwidth:680,oneSvgPerLine:true});
const systems=[...staging.querySelectorAll('svg')].filter(svg=>svg.querySelector('[data-name="staff"], [class*="abcjs-note"], path'));
if(!systems.length)throw Error('No notation was rendered.');
const pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4'});
pdf.setProperties({title,author:credit});
const margin=42, pageWidth=pdf.internal.pageSize.getWidth(), pageHeight=pdf.internal.pageSize.getHeight();
const width=pageWidth-2*margin;
let y=margin;
pdf.setFontSize(22);
const heading=pdf.splitTextToSize(title,width);
pdf.text(heading,margin,y+22);y+=heading.length*26+8;
if(credit){
pdf.setFontSize(12);
const lines=pdf.splitTextToSize(credit,width);
pdf.text(lines,margin,y+12);y+=lines.length*15+8;
}
for(const svg of systems){
const view=(svg.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);
const naturalWidth=view[2]||parseFloat(svg.getAttribute('width'));
const naturalHeight=view[3]||parseFloat(svg.getAttribute('height'));
if(!(naturalWidth>0&&naturalHeight>0))throw Error('A staff line has no printable dimensions.');
const scale=Math.min(width/naturalWidth,(pageHeight-2*margin)/naturalHeight);
const height=naturalHeight*scale;
if(y+height>pageHeight-margin){pdf.addPage();y=margin;}
await pdf.svg(svg,{x:margin,y,width:naturalWidth*scale,height});
y+=height+6;
}
const filename=title.replace(/[\\/:*?"<>|]/g,'-').trim()||'ocarina-score';
pdf.save(filename+'.pdf');
report('PDF exported.');
}catch(error){report('Could not export the music score: '+error.message);}
finally{staging.remove();button.disabled=false;}
});
for(const field of [projectName,authorInput])field.addEventListener('input',()=>{
if(!find('score').hidden&&!recording)updateNotation();
});

const fingerPaths=[[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM366.0632911392405 534.2666666666667Q366.0632911392405 542.2666666666667 362.0632911392405 549.2666666666667Q358.0632911392405 556.2666666666667 351.0632911392405 560.2666666666667Q344.0632911392405 564.2666666666667 336.0632911392405 564.2666666666667Q323.0632911392405 564.2666666666667 314.0632911392405 555.2666666666667Q305.0632911392405 546.2666666666667 305.0632911392405 533.7666666666667Q305.0632911392405 521.2666666666667 314.0632911392405 512.2666666666667Q323.0632911392405 503.26666666666665 335.5632911392405 503.26666666666665Q348.0632911392405 503.26666666666665 357.0632911392405 512.2666666666667Q366.0632911392405 521.2666666666667 366.0632911392405 534.2666666666667ZM802.0632911392405 181.26666666666665Q786.0632911392405 165.26666666666665 786.0632911392405 143.26666666666665Q786.0632911392405 121.26666666666665 802.0632911392405 105.26666666666665Q818.0632911392405 89.26666666666665 840.0632911392405 89.26666666666665Q862.0632911392405 89.26666666666665 878.0632911392405 105.26666666666665Q894.0632911392405 121.26666666666665 894.0632911392405 143.26666666666665Q894.0632911392405 165.26666666666665 878.0632911392405 181.26666666666665Q862.0632911392405 197.26666666666665 840.0632911392405 197.26666666666665Q818.0632911392405 197.26666666666665 802.0632911392405 181.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM585.0632911392405 265.26666666666665Q593.0632911392405 265.26666666666665 600.0632911392405 269.26666666666665Q607.0632911392405 273.26666666666665 611.0632911392405 280.26666666666665Q615.0632911392405 287.26666666666665 615.0632911392405 296.26666666666665Q615.0632911392405 308.26666666666665 606.0632911392405 317.26666666666665Q597.0632911392405 326.26666666666665 584.5632911392405 326.26666666666665Q572.0632911392405 326.26666666666665 563.0632911392405 317.26666666666665Q554.0632911392405 308.26666666666665 554.0632911392405 295.76666666666665Q554.0632911392405 283.26666666666665 563.0632911392405 274.26666666666665Q572.0632911392405 265.26666666666665 585.0632911392405 265.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM366.0632911392405 534.2666666666667Q366.0632911392405 542.2666666666667 362.0632911392405 549.2666666666667Q358.0632911392405 556.2666666666667 351.0632911392405 560.2666666666667Q344.0632911392405 564.2666666666667 336.0632911392405 564.2666666666667Q323.0632911392405 564.2666666666667 314.0632911392405 555.2666666666667Q305.0632911392405 546.2666666666667 305.0632911392405 533.7666666666667Q305.0632911392405 521.2666666666667 314.0632911392405 512.2666666666667Q323.0632911392405 503.26666666666665 335.5632911392405 503.26666666666665Q348.0632911392405 503.26666666666665 357.0632911392405 512.2666666666667Q366.0632911392405 521.2666666666667 366.0632911392405 534.2666666666667ZM802.0632911392405 181.26666666666665Q786.0632911392405 165.26666666666665 786.0632911392405 143.26666666666665Q786.0632911392405 121.26666666666665 802.0632911392405 105.26666666666665Q818.0632911392405 89.26666666666665 840.0632911392405 89.26666666666665Q862.0632911392405 89.26666666666665 878.0632911392405 105.26666666666665Q894.0632911392405 121.26666666666665 894.0632911392405 143.26666666666665Q894.0632911392405 165.26666666666665 878.0632911392405 181.26666666666665Q862.0632911392405 197.26666666666665 840.0632911392405 197.26666666666665Q818.0632911392405 197.26666666666665 802.0632911392405 181.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM802.0632911392405 181.26666666666665Q786.0632911392405 165.26666666666665 786.0632911392405 143.26666666666665Q786.0632911392405 121.26666666666665 802.0632911392405 105.26666666666665Q818.0632911392405 89.26666666666665 840.0632911392405 89.26666666666665Q862.0632911392405 89.26666666666665 878.0632911392405 105.26666666666665Q894.0632911392405 121.26666666666665 894.0632911392405 143.26666666666665Q894.0632911392405 165.26666666666665 878.0632911392405 181.26666666666665Q862.0632911392405 197.26666666666665 840.0632911392405 197.26666666666665Q818.0632911392405 197.26666666666665 802.0632911392405 181.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM585.0632911392405 265.26666666666665Q593.0632911392405 265.26666666666665 600.0632911392405 269.26666666666665Q607.0632911392405 273.26666666666665 611.0632911392405 280.26666666666665Q615.0632911392405 287.26666666666665 615.0632911392405 296.26666666666665Q615.0632911392405 308.26666666666665 606.0632911392405 317.26666666666665Q597.0632911392405 326.26666666666665 584.5632911392405 326.26666666666665Q572.0632911392405 326.26666666666665 563.0632911392405 317.26666666666665Q554.0632911392405 308.26666666666665 554.0632911392405 295.76666666666665Q554.0632911392405 283.26666666666665 563.0632911392405 274.26666666666665Q572.0632911392405 265.26666666666665 585.0632911392405 265.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM802.0632911392405 181.26666666666665Q786.0632911392405 165.26666666666665 786.0632911392405 143.26666666666665Q786.0632911392405 121.26666666666665 802.0632911392405 105.26666666666665Q818.0632911392405 89.26666666666665 840.0632911392405 89.26666666666665Q862.0632911392405 89.26666666666665 878.0632911392405 105.26666666666665Q894.0632911392405 121.26666666666665 894.0632911392405 143.26666666666665Q894.0632911392405 165.26666666666665 878.0632911392405 181.26666666666665Q862.0632911392405 197.26666666666665 840.0632911392405 197.26666666666665Q818.0632911392405 197.26666666666665 802.0632911392405 181.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM585.0632911392405 265.26666666666665Q593.0632911392405 265.26666666666665 600.0632911392405 269.26666666666665Q607.0632911392405 273.26666666666665 611.0632911392405 280.26666666666665Q615.0632911392405 287.26666666666665 615.0632911392405 296.26666666666665Q615.0632911392405 308.26666666666665 606.0632911392405 317.26666666666665Q597.0632911392405 326.26666666666665 584.5632911392405 326.26666666666665Q572.0632911392405 326.26666666666665 563.0632911392405 317.26666666666665Q554.0632911392405 308.26666666666665 554.0632911392405 295.76666666666665Q554.0632911392405 283.26666666666665 563.0632911392405 274.26666666666665Q572.0632911392405 265.26666666666665 585.0632911392405 265.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM585.0632911392405 265.26666666666665Q593.0632911392405 265.26666666666665 600.0632911392405 269.26666666666665Q607.0632911392405 273.26666666666665 611.0632911392405 280.26666666666665Q615.0632911392405 287.26666666666665 615.0632911392405 296.26666666666665Q615.0632911392405 308.26666666666665 606.0632911392405 317.26666666666665Q597.0632911392405 326.26666666666665 584.5632911392405 326.26666666666665Q572.0632911392405 326.26666666666665 563.0632911392405 317.26666666666665Q554.0632911392405 308.26666666666665 554.0632911392405 295.76666666666665Q554.0632911392405 283.26666666666665 563.0632911392405 274.26666666666665Q572.0632911392405 265.26666666666665 585.0632911392405 265.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM625.5632911392405 394.76666666666665Q610.0632911392405 379.26666666666665 610.0632911392405 356.76666666666665Q610.0632911392405 334.26666666666665 625.5632911392405 318.76666666666665Q641.0632911392405 303.26666666666665 663.5632911392405 303.26666666666665Q686.0632911392405 303.26666666666665 701.5632911392405 318.76666666666665Q717.0632911392405 334.26666666666665 717.0632911392405 356.76666666666665Q717.0632911392405 379.26666666666665 701.5632911392405 394.76666666666665Q686.0632911392405 410.26666666666665 663.5632911392405 410.26666666666665Q641.0632911392405 410.26666666666665 625.5632911392405 394.76666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM553.5632911392405 512.7666666666667Q538.0632911392405 497.26666666666665 538.0632911392405 474.76666666666665Q538.0632911392405 452.26666666666665 553.5632911392405 436.76666666666665Q569.0632911392405 421.26666666666665 591.5632911392405 421.26666666666665Q614.0632911392405 421.26666666666665 629.5632911392405 436.76666666666665Q645.0632911392405 452.26666666666665 645.0632911392405 474.76666666666665Q645.0632911392405 497.26666666666665 629.5632911392405 512.7666666666667Q614.0632911392405 528.2666666666667 591.5632911392405 528.2666666666667Q569.0632911392405 528.2666666666667 553.5632911392405 512.7666666666667ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM353.0632911392405 412.26666666666665Q337.0632911392405 396.26666666666665 337.0632911392405 374.26666666666665Q337.0632911392405 352.26666666666665 353.0632911392405 336.26666666666665Q369.0632911392405 320.26666666666665 391.0632911392405 320.26666666666665Q413.0632911392405 320.26666666666665 429.0632911392405 336.26666666666665Q445.0632911392405 352.26666666666665 445.0632911392405 374.26666666666665Q445.0632911392405 396.26666666666665 429.0632911392405 412.26666666666665Q413.0632911392405 428.26666666666665 391.0632911392405 428.26666666666665Q369.0632911392405 428.26666666666665 353.0632911392405 412.26666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM234.5632911392405 492.76666666666665Q219.0632911392405 477.26666666666665 219.0632911392405 455.26666666666665Q219.0632911392405 433.26666666666665 234.5632911392405 417.26666666666665Q250.0632911392405 401.26666666666665 272.5632911392405 401.26666666666665Q295.0632911392405 401.26666666666665 310.5632911392405 417.26666666666665Q326.0632911392405 433.26666666666665 326.0632911392405 455.26666666666665Q326.0632911392405 477.26666666666665 310.5632911392405 492.76666666666665Q295.0632911392405 508.26666666666665 272.5632911392405 508.26666666666665Q250.0632911392405 508.26666666666665 234.5632911392405 492.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM95.0632911392405 538.2666666666667Q79.0632911392405 522.2666666666667 79.0632911392405 499.26666666666665Q79.0632911392405 476.26666666666665 95.0632911392405 460.26666666666665Q111.0632911392405 444.26666666666665 134.0632911392405 444.26666666666665Q157.0632911392405 444.26666666666665 173.0632911392405 460.26666666666665Q189.0632911392405 476.26666666666665 189.0632911392405 499.26666666666665Q189.0632911392405 522.2666666666667 173.0632911392405 538.2666666666667Q157.0632911392405 554.2666666666667 134.0632911392405 554.2666666666667Q111.0632911392405 554.2666666666667 95.0632911392405 538.2666666666667ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM213.0632911392405 727.2666666666667Q228.0632911392405 727.2666666666667 240.5632911392405 734.7666666666667Q253.0632911392405 742.2666666666667 260.5632911392405 754.7666666666667Q268.0632911392405 767.2666666666667 268.0632911392405 782.2666666666667Q268.0632911392405 805.2666666666667 252.0632911392405 821.2666666666667Q236.0632911392405 837.2666666666667 213.0632911392405 837.2666666666667Q190.0632911392405 837.2666666666667 173.5632911392405 821.2666666666667Q157.0632911392405 805.2666666666667 157.0632911392405 782.2666666666667Q157.0632911392405 759.2666666666667 173.5632911392405 743.2666666666667Q190.0632911392405 727.2666666666667 213.0632911392405 727.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM178.0632911392405 747.7666666666667Q164.0632911392405 762.2666666666667 164.0632911392405 782.2666666666667Q164.0632911392405 802.2666666666667 178.0632911392405 816.7666666666667Q192.0632911392405 831.2666666666667 212.5632911392405 831.2666666666667Q233.0632911392405 831.2666666666667 247.5632911392405 816.7666666666667Q262.0632911392405 802.2666666666667 262.0632911392405 782.2666666666667Q262.0632911392405 762.2666666666667 247.5632911392405 747.7666666666667Q233.0632911392405 733.2666666666667 212.5632911392405 733.2666666666667Q192.0632911392405 733.2666666666667 178.0632911392405 747.7666666666667ZM151.0632911392405 782.2666666666667Q151.0632911392405 765.2666666666667 159.5632911392405 751.2666666666667Q168.0632911392405 737.2666666666667 182.0632911392405 729.2666666666667Q196.0632911392405 721.2666666666667 213.0632911392405 721.2666666666667Q238.0632911392405 721.2666666666667 256.0632911392405 739.2666666666667Q274.0632911392405 757.2666666666667 274.0632911392405 782.7666666666667Q274.0632911392405 808.2666666666667 256.0632911392405 825.7666666666667Q238.0632911392405 843.2666666666667 212.5632911392405 843.2666666666667Q187.0632911392405 843.2666666666667 169.0632911392405 825.7666666666667Q151.0632911392405 808.2666666666667 151.0632911392405 782.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM178.0632911392405 747.7666666666667Q164.0632911392405 762.2666666666667 164.0632911392405 782.2666666666667Q164.0632911392405 802.2666666666667 178.0632911392405 816.7666666666667Q192.0632911392405 831.2666666666667 212.5632911392405 831.2666666666667Q233.0632911392405 831.2666666666667 247.5632911392405 816.7666666666667Q262.0632911392405 802.2666666666667 262.0632911392405 782.2666666666667Q262.0632911392405 762.2666666666667 247.5632911392405 747.7666666666667Q233.0632911392405 733.2666666666667 212.5632911392405 733.2666666666667Q192.0632911392405 733.2666666666667 178.0632911392405 747.7666666666667ZM151.0632911392405 782.2666666666667Q151.0632911392405 765.2666666666667 159.5632911392405 751.2666666666667Q168.0632911392405 737.2666666666667 182.0632911392405 729.2666666666667Q196.0632911392405 721.2666666666667 213.0632911392405 721.2666666666667Q238.0632911392405 721.2666666666667 256.0632911392405 739.2666666666667Q274.0632911392405 757.2666666666667 274.0632911392405 782.7666666666667Q274.0632911392405 808.2666666666667 256.0632911392405 825.7666666666667Q238.0632911392405 843.2666666666667 212.5632911392405 843.2666666666667Q187.0632911392405 843.2666666666667 169.0632911392405 825.7666666666667Q151.0632911392405 808.2666666666667 151.0632911392405 782.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM609.0632911392405 782.2666666666667Q609.0632911392405 759.2666666666667 625.0632911392405 743.2666666666667Q641.0632911392405 727.2666666666667 664.0632911392405 727.2666666666667Q687.0632911392405 727.2666666666667 703.5632911392405 743.2666666666667Q720.0632911392405 759.2666666666667 720.0632911392405 782.2666666666667Q720.0632911392405 805.2666666666667 703.5632911392405 821.2666666666667Q687.0632911392405 837.2666666666667 664.0632911392405 837.2666666666667Q653.0632911392405 837.2666666666667 643.0632911392405 833.2666666666667Q633.0632911392405 829.2666666666667 625.5632911392405 821.7666666666667Q618.0632911392405 814.2666666666667 613.5632911392405 803.7666666666667Q609.0632911392405 793.2666666666667 609.0632911392405 782.2666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM707.5632911392405 285.76666666666665Q692.0632911392405 270.26666666666665 692.0632911392405 247.76666666666665Q692.0632911392405 225.26666666666665 707.5632911392405 209.76666666666665Q723.0632911392405 194.26666666666665 745.5632911392405 194.26666666666665Q768.0632911392405 194.26666666666665 783.5632911392405 209.76666666666665Q799.0632911392405 225.26666666666665 799.0632911392405 247.76666666666665Q799.0632911392405 270.26666666666665 783.5632911392405 285.76666666666665Q768.0632911392405 301.26666666666665 745.5632911392405 301.26666666666665Q723.0632911392405 301.26666666666665 707.5632911392405 285.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM178.0632911392405 747.7666666666667Q164.0632911392405 762.2666666666667 164.0632911392405 782.2666666666667Q164.0632911392405 802.2666666666667 178.0632911392405 816.7666666666667Q192.0632911392405 831.2666666666667 212.5632911392405 831.2666666666667Q233.0632911392405 831.2666666666667 247.5632911392405 816.7666666666667Q262.0632911392405 802.2666666666667 262.0632911392405 782.2666666666667Q262.0632911392405 762.2666666666667 247.5632911392405 747.7666666666667Q233.0632911392405 733.2666666666667 212.5632911392405 733.2666666666667Q192.0632911392405 733.2666666666667 178.0632911392405 747.7666666666667ZM151.0632911392405 782.2666666666667Q151.0632911392405 765.2666666666667 159.5632911392405 751.2666666666667Q168.0632911392405 737.2666666666667 182.0632911392405 729.2666666666667Q196.0632911392405 721.2666666666667 213.0632911392405 721.2666666666667Q238.0632911392405 721.2666666666667 256.0632911392405 739.2666666666667Q274.0632911392405 757.2666666666667 274.0632911392405 782.7666666666667Q274.0632911392405 808.2666666666667 256.0632911392405 825.7666666666667Q238.0632911392405 843.2666666666667 212.5632911392405 843.2666666666667Q187.0632911392405 843.2666666666667 169.0632911392405 825.7666666666667Q151.0632911392405 808.2666666666667 151.0632911392405 782.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM664.0632911392405 831.2666666666667Q678.0632911392405 831.2666666666667 689.0632911392405 824.7666666666667Q700.0632911392405 818.2666666666667 706.5632911392405 806.7666666666667Q713.0632911392405 795.2666666666667 713.0632911392405 782.2666666666667Q713.0632911392405 762.2666666666667 699.0632911392405 747.7666666666667Q685.0632911392405 733.2666666666667 664.5632911392405 733.2666666666667Q644.0632911392405 733.2666666666667 629.5632911392405 747.7666666666667Q615.0632911392405 762.2666666666667 615.0632911392405 782.2666666666667Q615.0632911392405 802.2666666666667 629.5632911392405 816.7666666666667Q644.0632911392405 831.2666666666667 664.0632911392405 831.2666666666667ZM621.0632911392405 825.7666666666667Q603.0632911392405 808.2666666666667 603.0632911392405 782.7666666666667Q603.0632911392405 757.2666666666667 621.0632911392405 739.2666666666667Q639.0632911392405 721.2666666666667 664.5632911392405 721.2666666666667Q690.0632911392405 721.2666666666667 708.0632911392405 739.2666666666667Q726.0632911392405 757.2666666666667 726.0632911392405 782.7666666666667Q726.0632911392405 808.2666666666667 708.0632911392405 825.7666666666667Q690.0632911392405 843.2666666666667 664.5632911392405 843.2666666666667Q639.0632911392405 843.2666666666667 621.0632911392405 825.7666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM447.5632911392405 306.26666666666665Q432.0632911392405 290.26666666666665 432.0632911392405 268.26666666666665Q432.0632911392405 246.26666666666665 447.5632911392405 230.26666666666665Q463.0632911392405 214.26666666666665 485.5632911392405 214.26666666666665Q508.0632911392405 214.26666666666665 523.5632911392405 230.26666666666665Q539.0632911392405 246.26666666666665 539.0632911392405 268.26666666666665Q539.0632911392405 290.26666666666665 523.5632911392405 306.26666666666665Q508.0632911392405 322.26666666666665 485.5632911392405 322.26666666666665Q463.0632911392405 322.26666666666665 447.5632911392405 306.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM178.0632911392405 747.7666666666667Q164.0632911392405 762.2666666666667 164.0632911392405 782.2666666666667Q164.0632911392405 802.2666666666667 178.0632911392405 816.7666666666667Q192.0632911392405 831.2666666666667 212.5632911392405 831.2666666666667Q233.0632911392405 831.2666666666667 247.5632911392405 816.7666666666667Q262.0632911392405 802.2666666666667 262.0632911392405 782.2666666666667Q262.0632911392405 762.2666666666667 247.5632911392405 747.7666666666667Q233.0632911392405 733.2666666666667 212.5632911392405 733.2666666666667Q192.0632911392405 733.2666666666667 178.0632911392405 747.7666666666667ZM151.0632911392405 782.2666666666667Q151.0632911392405 765.2666666666667 159.5632911392405 751.2666666666667Q168.0632911392405 737.2666666666667 182.0632911392405 729.2666666666667Q196.0632911392405 721.2666666666667 213.0632911392405 721.2666666666667Q238.0632911392405 721.2666666666667 256.0632911392405 739.2666666666667Q274.0632911392405 757.2666666666667 274.0632911392405 782.7666666666667Q274.0632911392405 808.2666666666667 256.0632911392405 825.7666666666667Q238.0632911392405 843.2666666666667 212.5632911392405 843.2666666666667Q187.0632911392405 843.2666666666667 169.0632911392405 825.7666666666667Q151.0632911392405 808.2666666666667 151.0632911392405 782.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM664.0632911392405 831.2666666666667Q678.0632911392405 831.2666666666667 689.0632911392405 824.7666666666667Q700.0632911392405 818.2666666666667 706.5632911392405 806.7666666666667Q713.0632911392405 795.2666666666667 713.0632911392405 782.2666666666667Q713.0632911392405 762.2666666666667 699.0632911392405 747.7666666666667Q685.0632911392405 733.2666666666667 664.5632911392405 733.2666666666667Q644.0632911392405 733.2666666666667 629.5632911392405 747.7666666666667Q615.0632911392405 762.2666666666667 615.0632911392405 782.2666666666667Q615.0632911392405 802.2666666666667 629.5632911392405 816.7666666666667Q644.0632911392405 831.2666666666667 664.0632911392405 831.2666666666667ZM621.0632911392405 825.7666666666667Q603.0632911392405 808.2666666666667 603.0632911392405 782.7666666666667Q603.0632911392405 757.2666666666667 621.0632911392405 739.2666666666667Q639.0632911392405 721.2666666666667 664.5632911392405 721.2666666666667Q690.0632911392405 721.2666666666667 708.0632911392405 739.2666666666667Q726.0632911392405 757.2666666666667 726.0632911392405 782.7666666666667Q726.0632911392405 808.2666666666667 708.0632911392405 825.7666666666667Q690.0632911392405 843.2666666666667 664.5632911392405 843.2666666666667Q639.0632911392405 843.2666666666667 621.0632911392405 825.7666666666667Z"],[1014.0329881089375,970.2666666666667,"M338.0632911392405 906.2666666666667Q340.0632911392405 900.2666666666667 350.5632911392405 857.7666666666667Q361.0632911392405 815.2666666666667 360.0632911392405 792.2666666666667Q359.0632911392405 721.2666666666667 319.0632911392405 682.2666666666667Q301.0632911392405 664.2666666666667 266.5632911392405 649.2666666666667Q232.0632911392405 634.2666666666667 208.5632911392405 627.2666666666667Q185.0632911392405 620.2666666666667 137.5632911392405 609.7666666666667Q90.0632911392405 599.2666666666667 85.0632911392405 598.2666666666667Q24.063291139240505 582.2666666666667 13.063291139240507 557.2666666666667Q2.0632911392405067 530.2666666666667 30.563291139240505 488.26666666666665Q59.063291139240505 446.26666666666665 97.0632911392405 414.26666666666665Q182.0632911392405 341.26666666666665 279.0632911392405 287.76666666666665Q376.0632911392405 234.26666666666665 514.0632911392405 173.26666666666665Q625.0632911392405 124.26666666666665 778.5632911392405 69.76666666666665Q932.0632911392405 15.266666666666652 974.0632911392405 10.266666666666652Q989.0632911392405 8.266666666666652 998.5632911392405 21.26666666666665Q1008.0632911392405 34.26666666666665 1001.0632911392405 46.26666666666665Q973.0632911392405 101.26666666666665 866.0632911392405 242.26666666666665Q857.0632911392405 254.26666666666665 819.0632911392405 304.76666666666665Q781.0632911392405 355.26666666666665 766.0632911392405 375.26666666666665Q751.0632911392405 395.26666666666665 722.0632911392405 435.26666666666665Q693.0632911392405 475.26666666666665 672.0632911392405 507.76666666666665Q651.0632911392405 540.2666666666667 630.0632911392405 573.2666666666667Q560.0632911392405 689.2666666666667 509.0632911392405 813.2666666666667Q500.0632911392405 833.2666666666667 488.0632911392405 874.7666666666667Q476.0632911392405 916.2666666666667 468.0632911392405 937.2666666666667Q463.0632911392405 947.2666666666667 453.5632911392405 953.7666666666667Q444.0632911392405 960.2666666666667 434.0632911392405 960.2666666666667Q394.0632911392405 960.2666666666667 357.0632911392405 942.2666666666667Q347.0632911392405 938.2666666666667 341.5632911392405 927.7666666666667Q336.0632911392405 917.2666666666667 338.0632911392405 906.2666666666667ZM351.0632911392405 908.2666666666667Q349.0632911392405 915.2666666666667 352.5632911392405 921.7666666666667Q356.0632911392405 928.2666666666667 362.0632911392405 931.2666666666667Q397.0632911392405 948.2666666666667 434.0632911392405 948.2666666666667Q437.0632911392405 948.2666666666667 440.0632911392405 947.2666666666667Q443.0632911392405 946.2666666666667 446.5632911392405 944.2666666666667Q450.0632911392405 942.2666666666667 452.5632911392405 938.7666666666667Q455.0632911392405 935.2666666666667 456.0632911392405 932.2666666666667Q464.0632911392405 913.2666666666667 476.0632911392405 871.2666666666667Q488.0632911392405 829.2666666666667 497.0632911392405 808.2666666666667Q549.0632911392405 684.2666666666667 620.0632911392405 567.2666666666667Q640.0632911392405 534.2666666666667 661.5632911392405 501.26666666666665Q683.0632911392405 468.26666666666665 712.0632911392405 428.26666666666665Q741.0632911392405 388.26666666666665 756.0632911392405 367.76666666666665Q771.0632911392405 347.26666666666665 809.5632911392405 297.26666666666665Q848.0632911392405 247.26666666666665 857.0632911392405 235.26666666666665Q962.0632911392405 94.26666666666665 990.0632911392405 41.26666666666665Q993.0632911392405 35.26666666666665 988.0632911392405 28.26666666666665Q983.0632911392405 21.26666666666665 976.0632911392405 22.26666666666665Q936.0632911392405 27.26666666666665 782.0632911392405 81.76666666666665Q628.0632911392405 136.26666666666665 519.0632911392405 185.26666666666665Q382.0632911392405 245.26666666666665 285.5632911392405 298.26666666666665Q189.0632911392405 351.26666666666665 105.0632911392405 423.26666666666665Q84.0632911392405 442.26666666666665 63.563291139240505 466.26666666666665Q43.063291139240505 490.26666666666665 31.063291139240505 514.7666666666667Q19.063291139240505 539.2666666666667 24.063291139240505 552.2666666666667Q28.063291139240505 562.2666666666667 48.563291139240505 571.7666666666667Q69.0632911392405 581.2666666666667 88.0632911392405 586.2666666666667Q94.0632911392405 587.2666666666667 140.5632911392405 597.7666666666667Q187.0632911392405 608.2666666666667 211.5632911392405 615.2666666666667Q236.0632911392405 622.2666666666667 272.0632911392405 638.2666666666667Q308.0632911392405 654.2666666666667 328.0632911392405 673.2666666666667Q371.0632911392405 715.2666666666667 373.0632911392405 792.2666666666667Q373.0632911392405 810.2666666666667 369.0632911392405 829.7666666666667Q365.0632911392405 849.2666666666667 359.0632911392405 872.2666666666667Q353.0632911392405 895.2666666666667 351.0632911392405 908.2666666666667ZM239.0632911392405 421.26666666666665Q225.0632911392405 435.26666666666665 225.0632911392405 454.76666666666665Q225.0632911392405 474.26666666666665 239.0632911392405 488.26666666666665Q253.0632911392405 502.26666666666665 272.5632911392405 502.26666666666665Q292.0632911392405 502.26666666666665 306.0632911392405 488.26666666666665Q320.0632911392405 474.26666666666665 320.0632911392405 454.76666666666665Q320.0632911392405 435.26666666666665 306.0632911392405 421.26666666666665Q292.0632911392405 407.26666666666665 272.5632911392405 407.26666666666665Q253.0632911392405 407.26666666666665 239.0632911392405 421.26666666666665ZM230.5632911392405 497.76666666666665Q213.0632911392405 480.26666666666665 213.0632911392405 455.26666666666665Q213.0632911392405 430.26666666666665 230.5632911392405 412.76666666666665Q248.0632911392405 395.26666666666665 272.5632911392405 395.26666666666665Q297.0632911392405 395.26666666666665 314.5632911392405 412.76666666666665Q332.0632911392405 430.26666666666665 332.0632911392405 455.26666666666665Q332.0632911392405 480.26666666666665 314.5632911392405 497.76666666666665Q297.0632911392405 515.2666666666667 272.5632911392405 515.2666666666667Q248.0632911392405 515.2666666666667 230.5632911392405 497.76666666666665ZM134.0632911392405 548.2666666666667Q147.0632911392405 548.2666666666667 158.5632911392405 541.7666666666667Q170.0632911392405 535.2666666666667 176.5632911392405 524.2666666666667Q183.0632911392405 513.2666666666667 183.0632911392405 499.26666666666665Q183.0632911392405 479.26666666666665 168.5632911392405 464.76666666666665Q154.0632911392405 450.26666666666665 134.0632911392405 450.26666666666665Q114.0632911392405 450.26666666666665 99.5632911392405 464.76666666666665Q85.0632911392405 479.26666666666665 85.0632911392405 499.76666666666665Q85.0632911392405 520.2666666666667 99.5632911392405 534.2666666666667Q114.0632911392405 548.2666666666667 134.0632911392405 548.2666666666667ZM134.0632911392405 438.26666666666665Q151.0632911392405 438.26666666666665 165.0632911392405 446.26666666666665Q179.0632911392405 454.26666666666665 187.5632911392405 468.76666666666665Q196.0632911392405 483.26666666666665 196.0632911392405 499.76666666666665Q196.0632911392405 516.2666666666667 187.5632911392405 530.2666666666667Q179.0632911392405 544.2666666666667 165.0632911392405 552.7666666666667Q151.0632911392405 561.2666666666667 134.0632911392405 561.2666666666667Q109.0632911392405 561.2666666666667 91.0632911392405 543.2666666666667Q73.0632911392405 525.2666666666667 73.0632911392405 499.76666666666665Q73.0632911392405 474.26666666666665 91.0632911392405 456.26666666666665Q109.0632911392405 438.26666666666665 134.0632911392405 438.26666666666665ZM343.0632911392405 374.26666666666665Q343.0632911392405 394.26666666666665 357.0632911392405 408.26666666666665Q371.0632911392405 422.26666666666665 391.0632911392405 422.26666666666665Q411.0632911392405 422.26666666666665 425.0632911392405 408.26666666666665Q439.0632911392405 394.26666666666665 439.0632911392405 374.26666666666665Q439.0632911392405 354.26666666666665 425.0632911392405 340.26666666666665Q411.0632911392405 326.26666666666665 391.0632911392405 326.26666666666665Q378.0632911392405 326.26666666666665 367.0632911392405 332.76666666666665Q356.0632911392405 339.26666666666665 349.5632911392405 350.26666666666665Q343.0632911392405 361.26666666666665 343.0632911392405 374.26666666666665ZM348.5632911392405 416.76666666666665Q331.0632911392405 399.26666666666665 331.0632911392405 374.26666666666665Q331.0632911392405 349.26666666666665 348.5632911392405 331.76666666666665Q366.0632911392405 314.26666666666665 391.0632911392405 314.26666666666665Q416.0632911392405 314.26666666666665 433.5632911392405 331.76666666666665Q451.0632911392405 349.26666666666665 451.0632911392405 374.26666666666665Q451.0632911392405 399.26666666666665 433.5632911392405 416.76666666666665Q416.0632911392405 434.26666666666665 391.0632911392405 434.26666666666665Q366.0632911392405 434.26666666666665 348.5632911392405 416.76666666666665ZM452.0632911392405 234.76666666666665Q438.0632911392405 248.26666666666665 438.0632911392405 268.26666666666665Q438.0632911392405 288.26666666666665 452.0632911392405 302.26666666666665Q466.0632911392405 316.26666666666665 485.5632911392405 316.26666666666665Q505.0632911392405 316.26666666666665 519.0632911392405 302.26666666666665Q533.0632911392405 288.26666666666665 533.0632911392405 268.26666666666665Q533.0632911392405 248.26666666666665 519.0632911392405 234.76666666666665Q505.0632911392405 221.26666666666665 485.5632911392405 221.26666666666665Q466.0632911392405 221.26666666666665 452.0632911392405 234.76666666666665ZM486.0632911392405 208.26666666666665Q502.0632911392405 208.26666666666665 516.0632911392405 216.26666666666665Q530.0632911392405 224.26666666666665 538.0632911392405 238.26666666666665Q546.0632911392405 252.26666666666665 546.0632911392405 268.26666666666665Q546.0632911392405 293.26666666666665 528.5632911392405 310.76666666666665Q511.0632911392405 328.26666666666665 486.0632911392405 328.26666666666665Q461.0632911392405 328.26666666666665 443.5632911392405 310.76666666666665Q426.0632911392405 293.26666666666665 426.0632911392405 268.26666666666665Q426.0632911392405 243.26666666666665 443.5632911392405 225.76666666666665Q461.0632911392405 208.26666666666665 486.0632911392405 208.26666666666665ZM544.0632911392405 474.26666666666665Q544.0632911392405 494.26666666666665 558.0632911392405 508.26666666666665Q572.0632911392405 522.2666666666667 591.5632911392405 522.2666666666667Q611.0632911392405 522.2666666666667 625.0632911392405 508.26666666666665Q639.0632911392405 494.26666666666665 639.0632911392405 474.26666666666665Q639.0632911392405 461.26666666666665 632.5632911392405 450.76666666666665Q626.0632911392405 440.26666666666665 615.5632911392405 433.76666666666665Q605.0632911392405 427.26666666666665 592.0632911392405 427.26666666666665Q582.0632911392405 427.26666666666665 573.0632911392405 430.76666666666665Q564.0632911392405 434.26666666666665 558.0632911392405 440.76666666666665Q552.0632911392405 447.26666666666665 548.0632911392405 456.26666666666665Q544.0632911392405 465.26666666666665 544.0632911392405 474.26666666666665ZM592.0632911392405 415.26666666666665Q608.0632911392405 415.26666666666665 621.5632911392405 423.26666666666665Q635.0632911392405 431.26666666666665 643.0632911392405 444.76666666666665Q651.0632911392405 458.26666666666665 651.0632911392405 474.76666666666665Q651.0632911392405 491.26666666666665 643.0632911392405 504.76666666666665Q635.0632911392405 518.2666666666667 621.5632911392405 526.2666666666667Q608.0632911392405 534.2666666666667 592.0632911392405 534.2666666666667Q567.0632911392405 534.2666666666667 549.5632911392405 516.7666666666667Q532.0632911392405 499.26666666666665 532.0632911392405 474.76666666666665Q532.0632911392405 450.26666666666665 549.5632911392405 432.76666666666665Q567.0632911392405 415.26666666666665 592.0632911392405 415.26666666666665ZM698.0632911392405 248.26666666666665Q698.0632911392405 267.26666666666665 712.0632911392405 281.26666666666665Q726.0632911392405 295.26666666666665 745.5632911392405 295.26666666666665Q765.0632911392405 295.26666666666665 779.0632911392405 281.26666666666665Q793.0632911392405 267.26666666666665 793.0632911392405 247.76666666666665Q793.0632911392405 228.26666666666665 779.0632911392405 214.26666666666665Q765.0632911392405 200.26666666666665 745.0632911392405 200.26666666666665Q732.0632911392405 200.26666666666665 721.5632911392405 206.76666666666665Q711.0632911392405 213.26666666666665 704.5632911392405 224.26666666666665Q698.0632911392405 235.26666666666665 698.0632911392405 248.26666666666665ZM703.5632911392405 289.76666666666665Q686.0632911392405 272.26666666666665 686.0632911392405 247.76666666666665Q686.0632911392405 223.26666666666665 703.5632911392405 205.76666666666665Q721.0632911392405 188.26666666666665 745.5632911392405 188.26666666666665Q770.0632911392405 188.26666666666665 787.5632911392405 205.76666666666665Q805.0632911392405 223.26666666666665 805.0632911392405 247.76666666666665Q805.0632911392405 272.26666666666665 787.5632911392405 289.76666666666665Q770.0632911392405 307.26666666666665 745.5632911392405 307.26666666666665Q721.0632911392405 307.26666666666665 703.5632911392405 289.76666666666665ZM663.0632911392405 404.26666666666665Q676.0632911392405 404.26666666666665 687.0632911392405 397.76666666666665Q698.0632911392405 391.26666666666665 704.5632911392405 380.76666666666665Q711.0632911392405 370.26666666666665 711.0632911392405 357.26666666666665Q711.0632911392405 337.26666666666665 697.0632911392405 323.26666666666665Q683.0632911392405 309.26666666666665 663.5632911392405 309.26666666666665Q644.0632911392405 309.26666666666665 630.0632911392405 323.26666666666665Q616.0632911392405 337.26666666666665 616.0632911392405 356.76666666666665Q616.0632911392405 376.26666666666665 630.0632911392405 390.26666666666665Q644.0632911392405 404.26666666666665 663.0632911392405 404.26666666666665ZM663.0632911392405 297.26666666666665Q680.0632911392405 297.26666666666665 693.5632911392405 305.26666666666665Q707.0632911392405 313.26666666666665 715.0632911392405 326.76666666666665Q723.0632911392405 340.26666666666665 723.0632911392405 356.76666666666665Q723.0632911392405 373.26666666666665 715.0632911392405 386.76666666666665Q707.0632911392405 400.26666666666665 693.5632911392405 408.26666666666665Q680.0632911392405 416.26666666666665 663.0632911392405 416.26666666666665Q639.0632911392405 416.26666666666665 621.0632911392405 398.76666666666665Q603.0632911392405 381.26666666666665 603.0632911392405 356.76666666666665Q603.0632911392405 332.26666666666665 621.0632911392405 314.76666666666665Q639.0632911392405 297.26666666666665 663.0632911392405 297.26666666666665ZM318.5632911392405 516.2666666666667Q311.0632911392405 523.2666666666667 311.0632911392405 533.7666666666667Q311.0632911392405 544.2666666666667 318.5632911392405 551.2666666666667Q326.0632911392405 558.2666666666667 336.0632911392405 558.2666666666667Q346.0632911392405 558.2666666666667 353.0632911392405 551.2666666666667Q360.0632911392405 544.2666666666667 360.0632911392405 533.7666666666667Q360.0632911392405 523.2666666666667 353.0632911392405 516.2666666666667Q346.0632911392405 509.26666666666665 336.0632911392405 509.26666666666665Q326.0632911392405 509.26666666666665 318.5632911392405 516.2666666666667ZM336.0632911392405 497.26666666666665Q341.0632911392405 497.26666666666665 345.5632911392405 498.26666666666665Q350.0632911392405 499.26666666666665 354.0632911392405 501.76666666666665Q358.0632911392405 504.26666666666665 361.5632911392405 507.76666666666665Q365.0632911392405 511.26666666666665 367.5632911392405 515.2666666666667Q370.0632911392405 519.2666666666667 371.5632911392405 524.2666666666667Q373.0632911392405 529.2666666666667 373.0632911392405 534.2666666666667Q373.0632911392405 549.2666666666667 362.0632911392405 560.2666666666667Q351.0632911392405 571.2666666666667 335.5632911392405 571.2666666666667Q320.0632911392405 571.2666666666667 309.5632911392405 560.2666666666667Q299.0632911392405 549.2666666666667 299.0632911392405 533.7666666666667Q299.0632911392405 518.2666666666667 309.5632911392405 507.76666666666665Q320.0632911392405 497.26666666666665 336.0632911392405 497.26666666666665ZM806.0632911392405 109.26666666666665Q792.0632911392405 123.26666666666665 792.0632911392405 143.26666666666665Q792.0632911392405 163.26666666666665 806.0632911392405 177.26666666666665Q820.0632911392405 191.26666666666665 840.0632911392405 191.26666666666665Q860.0632911392405 191.26666666666665 874.0632911392405 177.26666666666665Q888.0632911392405 163.26666666666665 888.0632911392405 143.26666666666665Q888.0632911392405 123.26666666666665 874.0632911392405 109.26666666666665Q860.0632911392405 95.26666666666665 840.0632911392405 95.26666666666665Q820.0632911392405 95.26666666666665 806.0632911392405 109.26666666666665ZM900.0632911392405 143.26666666666665Q900.0632911392405 159.26666666666665 892.0632911392405 173.26666666666665Q884.0632911392405 187.26666666666665 870.0632911392405 195.26666666666665Q856.0632911392405 203.26666666666665 840.0632911392405 203.26666666666665Q815.0632911392405 203.26666666666665 797.5632911392405 185.76666666666665Q780.0632911392405 168.26666666666665 780.0632911392405 143.26666666666665Q780.0632911392405 118.26666666666665 797.5632911392405 100.76666666666665Q815.0632911392405 83.26666666666665 840.0632911392405 83.26666666666665Q865.0632911392405 83.26666666666665 882.5632911392405 100.76666666666665Q900.0632911392405 118.26666666666665 900.0632911392405 143.26666666666665ZM178.0632911392405 747.7666666666667Q164.0632911392405 762.2666666666667 164.0632911392405 782.2666666666667Q164.0632911392405 802.2666666666667 178.0632911392405 816.7666666666667Q192.0632911392405 831.2666666666667 212.5632911392405 831.2666666666667Q233.0632911392405 831.2666666666667 247.5632911392405 816.7666666666667Q262.0632911392405 802.2666666666667 262.0632911392405 782.2666666666667Q262.0632911392405 762.2666666666667 247.5632911392405 747.7666666666667Q233.0632911392405 733.2666666666667 212.5632911392405 733.2666666666667Q192.0632911392405 733.2666666666667 178.0632911392405 747.7666666666667ZM151.0632911392405 782.2666666666667Q151.0632911392405 765.2666666666667 159.5632911392405 751.2666666666667Q168.0632911392405 737.2666666666667 182.0632911392405 729.2666666666667Q196.0632911392405 721.2666666666667 213.0632911392405 721.2666666666667Q238.0632911392405 721.2666666666667 256.0632911392405 739.2666666666667Q274.0632911392405 757.2666666666667 274.0632911392405 782.7666666666667Q274.0632911392405 808.2666666666667 256.0632911392405 825.7666666666667Q238.0632911392405 843.2666666666667 212.5632911392405 843.2666666666667Q187.0632911392405 843.2666666666667 169.0632911392405 825.7666666666667Q151.0632911392405 808.2666666666667 151.0632911392405 782.2666666666667ZM560.0632911392405 296.26666666666665Q560.0632911392405 301.26666666666665 562.0632911392405 305.76666666666665Q564.0632911392405 310.26666666666665 567.0632911392405 313.26666666666665Q570.0632911392405 316.26666666666665 575.0632911392405 318.26666666666665Q580.0632911392405 320.26666666666665 585.0632911392405 320.26666666666665Q595.0632911392405 320.26666666666665 602.0632911392405 313.26666666666665Q609.0632911392405 306.26666666666665 609.0632911392405 296.26666666666665Q609.0632911392405 286.26666666666665 602.0632911392405 278.76666666666665Q595.0632911392405 271.26666666666665 584.5632911392405 271.26666666666665Q574.0632911392405 271.26666666666665 567.0632911392405 278.76666666666665Q560.0632911392405 286.26666666666665 560.0632911392405 296.26666666666665ZM558.5632911392405 322.26666666666665Q548.0632911392405 311.26666666666665 548.0632911392405 296.26666666666665Q548.0632911392405 281.26666666666665 558.5632911392405 270.26666666666665Q569.0632911392405 259.26666666666665 584.5632911392405 259.26666666666665Q600.0632911392405 259.26666666666665 610.5632911392405 270.26666666666665Q621.0632911392405 281.26666666666665 621.0632911392405 296.26666666666665Q621.0632911392405 311.26666666666665 610.5632911392405 322.26666666666665Q600.0632911392405 333.26666666666665 584.5632911392405 333.26666666666665Q569.0632911392405 333.26666666666665 558.5632911392405 322.26666666666665ZM664.0632911392405 831.2666666666667Q678.0632911392405 831.2666666666667 689.0632911392405 824.7666666666667Q700.0632911392405 818.2666666666667 706.5632911392405 806.7666666666667Q713.0632911392405 795.2666666666667 713.0632911392405 782.2666666666667Q713.0632911392405 762.2666666666667 699.0632911392405 747.7666666666667Q685.0632911392405 733.2666666666667 664.5632911392405 733.2666666666667Q644.0632911392405 733.2666666666667 629.5632911392405 747.7666666666667Q615.0632911392405 762.2666666666667 615.0632911392405 782.2666666666667Q615.0632911392405 802.2666666666667 629.5632911392405 816.7666666666667Q644.0632911392405 831.2666666666667 664.0632911392405 831.2666666666667ZM621.0632911392405 825.7666666666667Q603.0632911392405 808.2666666666667 603.0632911392405 782.7666666666667Q603.0632911392405 757.2666666666667 621.0632911392405 739.2666666666667Q639.0632911392405 721.2666666666667 664.5632911392405 721.2666666666667Q690.0632911392405 721.2666666666667 708.0632911392405 739.2666666666667Q726.0632911392405 757.2666666666667 726.0632911392405 782.7666666666667Q726.0632911392405 808.2666666666667 708.0632911392405 825.7666666666667Q690.0632911392405 843.2666666666667 664.5632911392405 843.2666666666667Q639.0632911392405 843.2666666666667 621.0632911392405 825.7666666666667Z"]];
const svgNS='http://www.w3.org/2000/svg';
const tabLayout=find('tabs-text'),tabTitle=find('tab-title'),tabAuthor=find('tab-author');
const tabPreview=find('tab-preview'),tabStatus=find('tab-status');
let layoutSequence='', tabCache=new Map();
function scoreEntries(){
return score.pitches.map((m,index)=>({index,pitch:pitchText(m),beats:score.events[index].ticks/4}));
}
function defaultTabLayout(sequence){
return (sequence.match(/.{1,5}/g)||[]).join('\n');
}
function syncTabLayout(reset=false){
const sequence=score.pitches.map(fingeringCode).join('');
if(reset||sequence!==layoutSequence){
tabLayout.value=defaultTabLayout(sequence);
layoutSequence=sequence;tabPreview.replaceChildren();
}
if(reset){tabTitle.value='';tabAuthor.value='';}
}
function tabRows(){
if(!score.pitches.every(Music.playable))throw Error("Shift yellow notes into A4–F6 before exporting fingering tabs.");
if(!score.events.length)throw Error('Add notes before exporting tabs.');
const value=tabLayout.value.replace(/\r/g,'');
if(value.replace(/\s/g,'')!==layoutSequence)throw Error('Keep the note codes in order. Edit pitches in the Score Editor and use this box to add spaces or line breaks.');
let index=0;
return value.split('\n').map(row=>[...row.trimEnd()].map(char=>char===' '||char==='\t'?null:index++));
}
function makeFinger(midi){
if(midi===null||!Music.playable(midi)){
const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('width',60);svg.setAttribute('height',40);svg.setAttribute('viewBox','0 0 60 40');
const text=document.createElementNS(svgNS,'text');text.setAttribute('x',12);text.setAttribute('y',24);text.textContent=midi===null?'Rest':name(midi);svg.append(text);return svg;
}
const [width,height,path]=fingerPaths[midi-69];
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('viewBox','0 0 '+width+' '+height);
svg.setAttribute('width',width);svg.setAttribute('height',height);
const shape=document.createElementNS(svgNS,'path');
shape.setAttribute('d',path);shape.setAttribute('fill','#172126');
svg.append(shape);
return svg;
}
function rhythmShape(parent,tag,attributes){
const shape=document.createElementNS(svgNS,tag);
for(const [key,value] of Object.entries(attributes))shape.setAttribute(key,value);
parent.append(shape);
}
function makeTabRhythm(index){
const midi=score.events[index].pitch,ticks=Math.max(1,Math.round(score.events[index].ticks));
const key=midi+':'+ticks;
if(tabCache.has(key))return tabCache.get(key).cloneNode(true);
let left=ticks;
const parts=[];
while(left>0){
const size=[16,12,8,6,4,3,2,1].find(n=>n<=left);
parts.push(size);left-=size;
}
if(midi===null){
const host=document.createElement('div');host.className='export-staging';document.body.append(host);
try{window.ABCJS.renderAbc(host,'X:1\nM:none\nL:1/16\nK:C\nz'+ticks,{staffwidth:80});return host.querySelector('svg');}
finally{host.remove();}
}
const [,letter,sharp,octave]=pitchText(midi).match(/^([A-G])(#?)(\d)$/);
const step=(Number(octave)-4)*7+'CDEFGAB'.indexOf(letter)-2;
const y=54-step*3;
const width=Math.max(55,parts.length*25+20);
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('viewBox','0 0 '+width+' 76');svg.setAttribute('width',width);svg.setAttribute('height',76);
const ink='#172126';
const line=(x1,y1,x2,y2)=>rhythmShape(svg,'line',{x1,y1,x2,y2,stroke:ink,'stroke-width':.8});
for(let i=0;i<5;i++)line(3,30+i*6,width-3,30+i*6);
parts.forEach((duration,i)=>{
const x=(width-(parts.length-1)*25)/2+i*25;
for(let ledger=10;ledger<=step;ledger+=2)line(x-7,54-ledger*3,x+7,54-ledger*3);
for(let ledger=-2;ledger>=step;ledger-=2)line(x-7,54-ledger*3,x+7,54-ledger*3);
rhythmShape(svg,'ellipse',{cx:x,cy:y,rx:4.3,ry:2.8,transform:'rotate(-18 '+x+' '+y+')',stroke:ink,fill:duration>=8?'white':ink});
if(sharp&&i===0){
const px=x-9;
line(px-1,y-6,px-1,y+6);line(px+2,y-7,px+2,y+5);
line(px-3,y-1,px+4,y-3);line(px-3,y+3,px+4,y+1);
}
if(duration<16){
const down=step>=4, direction=down?1:-1,stem=x+(down?-4:4),endY=y+direction*17;
line(stem,y,stem,endY);
const flags=duration===1?2:duration<4?1:0;
for(let flag=0;flag<flags;flag++){
const tip=endY-direction*flag*5;
rhythmShape(svg,'path',{d:'M '+stem+' '+tip+' q 2 '+(-direction*4)+' 5 '+(-direction*6)+' q 3 '+(-direction*4)+' 1 '+(-direction*8),fill:'none',stroke:ink});
}
}
if([3,6,12].includes(duration))rhythmShape(svg,'circle',{cx:x+7,cy:step%2===0?y-3:y,r:1.15,fill:ink});
if(i<parts.length-1)rhythmShape(svg,'path',{d:'M '+(x+4)+' '+(y+5)+' q 8.5 7 17 0',fill:'none',stroke:ink});
});
tabCache.set(key,svg.cloneNode(true));
return svg;
}
function tabMetadata(){
return {title:tabTitle.value.trim()||projectName.value.trim()||'Untitled song',credit:tabAuthor.value.trim()||authorInput.value.trim()};
}
async function previewTabs(){
try{
if(score.pitches.includes(null))await loadNotation();
const rows=tabRows(), {title,credit}=tabMetadata();
const heading=document.createElement('h3');heading.textContent=title;
const byline=document.createElement('p');byline.textContent=credit;
tabPreview.replaceChildren(heading);
if(credit)tabPreview.append(byline);
for(const row of rows){
const line=document.createElement('div');line.className='tab-row';tabPreview.append(line);
for(const index of row){
const cell=document.createElement('div');
if(index===null){cell.className='tab-gap';line.append(cell);continue;}
cell.className='tab-cell';
const label=document.createElement('small');label.textContent=(index+1)+' · '+name(score.events[index].pitch);
cell.append(makeFinger(score.events[index].pitch),makeTabRhythm(index),label);line.append(cell);
}
}
tabStatus.textContent='Preview updated.';
}catch(error){tabStatus.textContent=error.message;}
}
function selectExport(){
const kind=find('export-kind').value;
find('music-panel').hidden=kind!=='music';
find('tabs-panel').hidden=kind!=='tabs';
find('backup').hidden=kind!=='backup';
}
find('export-kind').addEventListener('change',selectExport);
find('tab-preview-button').addEventListener('click',previewTabs);
find('tabs-reset').addEventListener('click',()=>{syncTabLayout(true);draftChanged=true;tabStatus.textContent='Default layout restored.';});
find('copy-tabs').addEventListener('click',()=>{
try{tabRows();copyField(tabLayout,'Tab codes copied. Paste them into Ocarina Tabs Creator.');}
catch(error){tabStatus.textContent=error.message;}
});
function pdfHeader(title,credit){
const pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4'});
pdf.setProperties({title,author:credit});
const margin=42,width=pdf.internal.pageSize.getWidth()-2*margin,bottom=pdf.internal.pageSize.getHeight()-margin;
let y=margin;
pdf.setFontSize(22);
const heading=pdf.splitTextToSize(title,width);
pdf.text(heading,margin,y+22);y+=heading.length*26+8;
if(credit){
pdf.setFontSize(12);
const lines=pdf.splitTextToSize(credit,width);
pdf.text(lines,margin,y+12);y+=lines.length*15+8;
}
return {pdf,margin,width,bottom,y};
}
function savePDF(pdf,title,suffix=''){
const filename=title.replace(/[\\/:*?"<>|]/g,'-').trim()||'ocarina-score';
pdf.save(filename+suffix+'.pdf');
}
async function svgInBox(pdf,svg,x,y,width,height){
const view=(svg.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);
const w=view[2]||parseFloat(svg.getAttribute('width')), h=view[3]||parseFloat(svg.getAttribute('height'));
if(!(w>0&&h>0))throw Error('A diagram has no printable dimensions.');
const scale=Math.min(width/w,height/h);
await pdf.svg(svg,{x:x+(width-w*scale)/2,y:y+(height-h*scale)/2,width:w*scale,height:h*scale});
}
function tabArtwork(){
const rows=tabRows(), {title,credit}=tabMetadata();
const width=740,cell=110,line=108;
const slots=[];
let y=92;
for(const row of rows){
let x=24;
for(const index of row){
if(index===null){x+=22;continue;}
if(x+cell>width-18){x=24;y+=line;}
slots.push({index,x,y});x+=cell;
}
y+=row.length?line:20;
}
if(y>16000)throw Error('This layout is too tall for one image. Use the paginated PDF.');
const root=document.createElementNS(svgNS,'svg');
root.setAttribute('xmlns',svgNS);root.setAttribute('width',width);root.setAttribute('height',y);
rhythmShape(root,'rect',{width,height:y,fill:'#fff'});
function label(text,x,y,size){
rhythmShape(root,'text',{x,y,'font-size':size,'font-family':'sans-serif',fill:'#172126'});
root.lastChild.textContent=text;
}
label(title,24,36,24);if(credit)label(credit,24,60,14);
for(const {index,x,y} of slots){
const figures=[makeFinger(score.events[index].pitch),makeTabRhythm(index)];
figures.forEach((svg,i)=>{
svg.setAttribute('x',x);svg.setAttribute('y',y+(i?52:0));
svg.setAttribute('width',cell-12);svg.setAttribute('height',i?34:50);
root.append(svg);
});
label((index+1)+' · '+pitchText(score.events[index].pitch),x+26,y+98,11);
}
return {data:new XMLSerializer().serializeToString(root),width,height:y};
}
function saveArtwork(blob,extension){
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download=tabMetadata().title.replace(/[\\/:*?"<>|]/g,'-')+' - tabs.'+extension;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}
find('tabs-svg').onclick=async()=>{
try{if(score.pitches.includes(null))await loadNotation();saveArtwork(new Blob([tabArtwork().data],{type:'image/svg+xml'}),'svg');}catch(error){tabStatus.textContent=error.message;}
};
find('tabs-png').onclick=async()=>{
let url;
try{
if(score.pitches.includes(null))await loadNotation();
const art=tabArtwork();
url=URL.createObjectURL(new Blob([art.data],{type:'image/svg+xml'}));
const image=new Image();image.src=url;await image.decode();
const canvas=document.createElement('canvas');canvas.width=art.width*2;canvas.height=art.height*2;
canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
if(!blob)throw Error('Could not create PNG.');
saveArtwork(blob,'png');
}catch(error){tabStatus.textContent=error.message;}
finally{if(url)URL.revokeObjectURL(url);}
};
find('tabs-pdf').addEventListener('click',async()=>{
const button=find('tabs-pdf');
button.disabled=true;
try{
await loadPDFExport();
const rows=tabRows(), {title,credit}=tabMetadata();
const {pdf,margin,width,bottom,y:startY}=pdfHeader(title,credit);
const cellWidth=width/6,cellHeight=94,gap=cellWidth/5;
let y=startY,x=margin;
for(const row of rows){
if(y+cellHeight>bottom){pdf.addPage();y=margin;}
for(const index of row){
if(index===null){x+=gap;continue;}
if(x+cellWidth>margin+width+.01){x=margin;y+=cellHeight;}
if(y+cellHeight>bottom){pdf.addPage();y=margin;}
await svgInBox(pdf,makeFinger(score.events[index].pitch),x+8,y,cellWidth-16,45);
await svgInBox(pdf,makeTabRhythm(index),x+4,y+45,cellWidth-8,36);
pdf.setFontSize(8);pdf.text((index+1)+' · '+pitchText(score.events[index].pitch),x+cellWidth/2,y+88,{align:'center'});
x+=cellWidth;
}
x=margin;y+=row.length?cellHeight:24;
}
savePDF(pdf,title,' - ocarina tabs');tabStatus.textContent='Fingering PDF exported.';
}catch(error){tabStatus.textContent=error.message;}
finally{button.disabled=false;}
});

for(const field of [tabLayout,tabTitle,tabAuthor])field.addEventListener('input',()=>{draftChanged=true;});

let micSession=null,practiceIndex=0,practiceCards=[];
let pitchConfidence=0,noisePeak=0,calibrationEnd=0;
function signalLevel(samples){
let energy=0;
for(const sample of samples)energy+=sample*sample;
return Math.sqrt(energy/samples.length);
}
function estimatePitch(samples,rate){
pitchConfidence=0;
let energy=0;
for(const sample of samples)energy+=sample*sample;
if(Math.sqrt(energy/samples.length)<.006)return 0;
const maxLag=Math.floor(rate/180),minLag=Math.floor(rate/1800);
const length=Math.min(768,samples.length-maxLag-1);
if(length<=0)return 0;
const values=new Float32Array(maxLag+1);
let total=0;
for(let lag=1;lag<=maxLag;lag++){
let sum=0;
for(let i=0;i<length;i+=2){const diff=samples[i]-samples[i+lag];sum+=diff*diff;}
total+=sum;values[lag]=total?sum*lag/total:1;
}
for(let lag=minLag;lag<maxLag;lag++){
if(values[lag]>.17)continue;
while(lag<maxLag-1&&values[lag+1]<values[lag])lag++;
const a=values[lag-1],b=values[lag],c=values[lag+1];
const offset=a+c===2*b?0:(a-c)/(2*(a+c-2*b));
pitchConfidence=1-b;
return rate/(lag+Math.max(-.5,Math.min(.5,offset)));
}
return 0;
}
function stopMic(message){
const session=micSession;
if(!session)return;
micSession=null;
clearInterval(session.timer);
session.stream?.getTracks().forEach(track=>track.stop());
session.context?.close().catch(()=>{});
const prefix=session.mode;
find(prefix+'-start').disabled=false;
find(prefix+'-stop').disabled=true;
if(prefix==='convert')stopSoundCapture();
if(prefix==='practice')find('practice-pitch').textContent='—';
if(message)find(prefix+'-status').textContent=message;
}
async function listenMic(mode,onPitch){
stopMic('Microphone stopped.');
const startButton=find(mode+'-start');
const stopButton=find(mode+'-stop');
const status=find(mode+'-status');
const session={mode};
micSession=session;startButton.disabled=true;stopButton.disabled=false;
status.textContent='Waiting for microphone permission…';
try{
if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone access is unavailable here. Open the Mac launcher in a browser that allows microphone access.');
const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
if(micSession!==session){stream.getTracks().forEach(track=>track.stop());return;}
session.stream=stream;
const Audio=window.AudioContext||window.webkitAudioContext;
session.context=new Audio();
const analyser=session.context.createAnalyser();
analyser.fftSize=2048;
session.context.createMediaStreamSource(stream).connect(analyser);
await session.context.resume();
if(micSession!==session)return;
const samples=new Float32Array(analyser.fftSize);
if(mode==='convert'&&find('calibrate').checked){
calibrationEnd=performance.now()+1200;
status.textContent='Measuring room noise. Stay quiet for a moment.';
}else status.textContent=mode==='practice'?'Play the fingering outlined in blue.':'Listening. Play a steady note.';
let last=null,frames=0;
session.timer=setInterval(()=>{
analyser.getFloatTimeDomainData(samples);
if(mode==='convert'){
inputMeter(samples);
if(calibrationEnd&&performance.now()<calibrationEnd){
noisePeak=Math.max(noisePeak,signalLevel(samples));return;
}
if(calibrationEnd){calibrationEnd=0;status.textContent='Calibrated. Play one note at a time.';}
}
const frequency=mode==='convert'&&signalLevel(samples)<noisePeak*1.7?0:estimatePitch(samples,session.context.sampleRate);
const exact=frequency?69+12*Math.log2(frequency/440):null;
const midi=exact===null?null:Math.round(exact);
const cents=exact===null?0:Math.round((exact-midi)*100);
if(mode==='convert'){onPitch(midi,frequency,cents,performance.now());return;}
if(midi!==last){last=midi;frames=0;}
if(++frames>=2)onPitch(midi,frequency,cents);
},40);
for(const track of stream.getTracks())track.addEventListener('ended',()=>{
if(micSession===session)stopMic('Microphone disconnected.');
});
}catch(error){
if(micSession===session)stopMic(error.name==='NotAllowedError'?'Microphone permission was denied. Allow access in your browser and try again.':error.message);
}
}
let tunerNote=null;
function showTunerPitch(midi,frequency,cents){
const chart=find('tuner-chart');
if(midi!==tunerNote){
tunerNote=midi;chart.replaceChildren();
if(midi>=69&&midi<=89&&midi!==null)chart.append(makeFinger(midi));
}
find('tuner-pitch').textContent=midi===null?'—':name(midi);
const tuning=Math.abs(cents)<=5?'In tune':Math.abs(cents)+' cents '+(cents<0?'flat':'sharp');
find('tuner-status').textContent=midi===null?'Listening. Play a steady note.':
frequency.toFixed(1)+' Hz · '+tuning+(midi<69||midi>89?' · Outside the 12-hole C fingering range':'');
}
find('tuner-start').addEventListener('click',()=>{showTunerPitch(null,0,0);listenMic('tuner',showTunerPitch);});
find('tuner-stop').addEventListener('click',()=>{showTunerPitch(null,0,0);stopMic('Microphone stopped.');});
function showPracticeFingering(){
const chart=find('practice-chart');
chart.replaceChildren();
const midi=practiceNotes[practiceIndex];
chart.setAttribute('aria-label',midi===undefined?'Practice complete':'Next fingering: '+name(midi));
if(midi!==undefined)chart.append(makeFinger(midi));
}
let practiceCorrect=0, practiceAttempts=0, practiceTimes=[], timedOrigin=null;
let practiceDurations=[], fullPracticeDurations=[];
function resetPracticeTiming(){
timedOrigin=null;practiceTimes=[];
find('timing-feedback').textContent='';
}
function scorePracticeTiming(){
if(!find('timed').checked)return;
const now=performance.now(),beat=60000/Math.max(30,Math.min(240,Number(find('practice-bpm').value)||100));
const elapsed=practiceDurations.slice(0,practiceIndex).reduce((a,b)=>a+b,0)*beat/4;
const offset=Math.max(-500,Math.min(500,Number(find('latency').value)||0));
if(timedOrigin===null)timedOrigin=now-elapsed;
const delta=Math.round(now-offset-timedOrigin-elapsed);
practiceTimes.push(Math.abs(delta));
find('timing-feedback').textContent=
Math.abs(delta)<=80?'On time':Math.abs(delta)+' ms '+(delta<0?'early':'late');
}
let practiceNotes=[], fullPracticeNotes=[], practiceOffset=0, practiceReturn='editor', practiceExpanded=false;
const rangeDialog=find('practice-range');
let rangeStart=null, rangeEnd=null;
find('practice-part').addEventListener('click',()=>{
const list=find('range-notes');
list.replaceChildren();rangeStart=null;rangeEnd=null;
find('range-status').textContent='Choose a starting note.';
find('range-use').disabled=true;
fullPracticeNotes.forEach((midi,i)=>{
const button=document.createElement('button');
button.className='ctrl';
button.textContent=(i+1)+' · '+name(midi);
button.setAttribute('aria-pressed','false');
button.addEventListener('click',()=>{
if(rangeStart===null||rangeEnd!==null){rangeStart=i;rangeEnd=null;}
else rangeEnd=i;
const first=Math.min(rangeStart,rangeEnd??rangeStart),last=Math.max(rangeStart,rangeEnd??rangeStart);
[...list.children].forEach((card,j)=>card.setAttribute('aria-pressed',String(j>=first&&j<=last)));
find('range-status').textContent=rangeEnd===null?'Start: note '+(first+1)+'. Choose an ending note.':
'Selected notes '+(first+1)+'–'+(last+1)+' ('+(last-first+1)+').';
find('range-use').disabled=rangeEnd===null;
});
list.append(button);
});
rangeDialog.showModal();
});
find('range-cancel').addEventListener('click',()=>rangeDialog.close());
find('range-use').addEventListener('click',()=>{
if(rangeEnd===null)return;
const first=Math.min(rangeStart,rangeEnd),last=Math.max(rangeStart,rangeEnd);
rangeDialog.close();setPracticePart(first,last+1);
});
find('practice-full').addEventListener('click',()=>setPracticePart(0,fullPracticeNotes.length));
function setPracticePart(first,end){
stopMic();practiceOffset=first;practiceNotes=fullPracticeNotes.slice(first,end);practiceDurations=fullPracticeDurations.slice(first,end);
find('practice-full').hidden=first===0&&end===fullPracticeNotes.length;
renderPracticeCards();
}
function updatePracticeWindow(){
const start=Math.floor(Math.min(practiceIndex,practiceCards.length-1)/8)*8;
practiceCards.forEach((card,i)=>{card.hidden=!practiceExpanded&&(i<start||i>=start+8);});
const button=find('practice-expand');
button.hidden=practiceCards.length<=8;
button.textContent=practiceExpanded?'↑ Show eight notes':'↓ Show all notes';
button.setAttribute('aria-expanded',String(practiceExpanded));
}
let practiceClickTimer=null;
function stopPracticeClick(){clearInterval(practiceClickTimer);practiceClickTimer=null;}
function startPracticeClick(){
stopPracticeClick();
if(!find('practice-metronome').checked)return;
const context=audio();
if(!context){find('practice-metronome').checked=false;report('Audio unavailable.');return;}
const bpm=Math.min(240,Math.max(30,Number(find('practice-bpm').value)||100));
find('practice-bpm').value=bpm;
const click=()=>{
const now=context.currentTime, pulse=context.createOscillator(), gain=context.createGain();
pulse.frequency.value=1200;gain.gain.setValueAtTime(.08,now);gain.gain.exponentialRampToValueAtTime(.001,now+.035);
pulse.connect(gain);gain.connect(context.destination);pulse.onended=()=>{pulse.disconnect();gain.disconnect();};
pulse.start(now);pulse.stop(now+.04);
};
click();practiceClickTimer=setInterval(click,60000/bpm);
}
find('practice-metronome').onchange=startPracticeClick;
find('practice-bpm').onchange=startPracticeClick;
window.addEventListener('pagehide',stopPracticeClick);
document.addEventListener('visibilitychange',()=>{
if(document.hidden){find('practice-metronome').checked=false;stopPracticeClick();}
});
function restartPractice(){
practiceCorrect=0;practiceAttempts=0;resetPracticeTiming();updatePracticeFeedback();
practiceIndex=0;
for(const card of practiceCards)card.classList.remove('practice-next','practice-hit');
practiceCards[0]?.classList.add('practice-next');
showPracticeFingering();updatePracticeWindow();
find('practice-status').textContent=micSession?.mode==='practice'?
'Follow the blue outline, or press Enter to continue.':
'Start the microphone to match notes, or press Enter to step through them.';
find('practice-grid').focus({preventScroll:true});
}
find('practice-restart').addEventListener('click',restartPractice);
find('practice-expand').addEventListener('click',()=>{
practiceExpanded=!practiceExpanded;updatePracticeWindow();
find('practice-grid').focus({preventScroll:true});
});
function showPractice(pitches,back=practiceReturn,lengths=pitches.map(()=>4)){
if(!pitches.every(Music.playable)){report("Shift yellow notes into A4–F6 before starting Play Along.");return;}
practiceReturn=back;
if(!pitches.length){report('Add notes before starting Play Along.');return;}
openPage('practice');
find('practice-back').textContent=back==='editor'?'Back to Score Editor':'Back to Practice';
fullPracticeNotes=[];fullPracticeDurations=[];
pitches.forEach((pitch,i)=>{
if(pitch===null){
if(fullPracticeDurations.length)fullPracticeDurations[fullPracticeDurations.length-1]+=lengths[i];
}else{fullPracticeNotes.push(pitch);fullPracticeDurations.push(lengths[i]);}
});
if(!fullPracticeNotes.length){openPage(back);report('Add a pitched note to practice.');return;}
setPracticePart(0,fullPracticeNotes.length);
}
function renderPracticeCards(){
const grid=find('practice-grid');grid.replaceChildren();grid.tabIndex=-1;grid.focus({preventScroll:true});
practiceCards=practiceNotes.map((midi,i)=>{
const card=document.createElement('div');card.className='practice-card';
const label=document.createElement('span');label.textContent=practiceOffset+i+1;
card.append(makeFinger(midi),label);grid.append(card);return card;
});
find('practice-pitch').textContent='—';
practiceExpanded=false;restartPractice();
}
find('play-along').addEventListener('click',()=>showPractice(score.pitches,'editor',score.lengths));
find('practice-back').addEventListener('click',()=>openPage(practiceReturn));
find('practice-stop').addEventListener('click',()=>stopMic('Paused. Start the microphone to resume.'));
find('practice-start').addEventListener('click',()=>{
if(practiceIndex===practiceNotes.length)restartPractice();
let previous=null,countInEnd=null;
find('practice-grid').focus({preventScroll:true});
listenMic('practice',(midi,frequency,cents)=>{
find('practice-pitch').textContent=midi===null?'—':name(midi);
if(find('timed').checked&&practiceIndex===0&&!practiceAttempts){
const now=performance.now(),beat=60000/Math.max(30,Math.min(240,Number(find('practice-bpm').value)||100));
if(countInEnd===null)countInEnd=now+4*beat;
if(now<countInEnd){find('timing-feedback').textContent='Count-in: '+Math.ceil((countInEnd-now)/beat);return;}
timedOrigin=countInEnd;
}
if(midi===null){previous=null;return;}
if(midi===previous||Math.abs(cents)>40)return;
previous=midi;
practiceAttempts++;
if(midi!==practiceNotes[practiceIndex]){
updatePracticeFeedback('Expected '+name(practiceNotes[practiceIndex])+', heard '+name(midi));return;
}
practiceCorrect++;scorePracticeTiming();updatePracticeFeedback();
advancePractice(true);
});
});
function updatePracticeFeedback(message=''){
const stats=practiceCorrect+' / '+practiceNotes.length+' matched';
find('practice-feedback').textContent=stats+(practiceAttempts?' · '+Math.round(100*practiceCorrect/practiceAttempts)+'% pitch accuracy':'')+(message?' · '+message:'');
}
function advancePractice(matched){
const card=practiceCards[practiceIndex];
if(!card)return;
const midi=practiceNotes[practiceIndex++];
card.classList.remove('practice-next');
if(matched)card.classList.add('practice-hit');
showPracticeFingering();
const next=practiceCards[practiceIndex];
if(!next){
if(practiceAttempts){
try{
const key='osm-practice-history',history=JSON.parse(localStorage.getItem(key)||'[]');
history.unshift({date:new Date().toISOString(),matched:practiceCorrect,attempts:practiceAttempts,notes:practiceNotes.length,meanTiming:practiceTimes.length>1?Math.round(practiceTimes.slice(1).reduce((a,b)=>a+b,0)/(practiceTimes.length-1)):null});
localStorage.setItem(key,JSON.stringify(history.slice(0,30)));
}catch{}
}
if(find('practice-loop').checked){restartPractice();return;}
stopMic();find('practice-metronome').checked=false;stopPracticeClick();
find('practice-status').textContent='End of sequence.';
return;
}
next.classList.add('practice-next');updatePracticeWindow();
find('practice-status').textContent=matched&&practiceNotes[practiceIndex]===midi?
'Briefly release before repeating.':'Follow the blue outline, or press Enter to continue.';
}

window.addEventListener('pagehide',()=>stopMic());
document.addEventListener('visibilitychange',()=>{
if(document.hidden)stopMic('Microphone stopped when you left the page.');
});

let capturedSound=[], soundNote=null, soundEnd=0, soundCandidate=null;
const soundStatus=find('convert-status');
function closeSoundNote(end){
if(!soundNote)return;
soundNote.end=Math.max(soundNote.time+40,end);
capturedSound.push(soundNote);
soundNote=null;
}
function updateSoundPreview(){
const count=capturedSound.length;
find('convert-preview').textContent=capturedSound.map(note=>name(note.midi)).join(' → ');
find('convert-use').disabled=!count;
soundStatus.textContent=count?count+' notes captured. Review them, then add them to the score.':'No playable notes captured. Try a steady note close to the microphone.';
}
function stopSoundCapture(){
closeSoundNote(soundEnd+40);
soundCandidate=null;
updateSoundPreview();reviewTake();
}
function captureSoundFrame(midi,frequency,cents,time){
const closeToHeldNote=soundNote&&midi!==null&&Math.abs((midi-soundNote.midi)*100+cents)<=62;
if(closeToHeldNote){
soundEnd=time;soundNote.confidence=Math.min(soundNote.confidence,pitchConfidence);soundCandidate=null;return;
}
const playable=midi!==null&&midi>=69&&midi<=89&&Math.abs(cents)<=45?midi:null;
if(!soundNote&&playable===null){soundCandidate=null;return;}
if(!soundCandidate||soundCandidate.midi!==playable)soundCandidate={midi:playable,time};
const required=playable===null?110:75;
if(time-soundCandidate.time<required)return;
const changeTime=soundCandidate.time;
closeSoundNote(playable===null?Math.min(changeTime,soundEnd+40):changeTime);
soundCandidate=null;
if(playable!==null){soundNote={midi:playable,time:changeTime,confidence:pitchConfidence};soundEnd=time;}
const pitches=capturedSound.map(note=>name(note.midi));
if(soundNote)pitches.push(name(soundNote.midi));
find('convert-preview').textContent=pitches.join(' → ');
soundStatus.textContent='Listening · '+pitches.length+' notes';
}
find('convert-start').addEventListener('click',()=>{
if(recording){report('Finish Enter timing recording before converting sound.');return;}
stopSound();capturedSound=[];soundNote=null;soundEnd=0;soundCandidate=null;
find('convert-preview').textContent='';find('convert-use').disabled=true;find('take-review').replaceChildren();
noisePeak=0;calibrationEnd=0;
listenMic('convert',captureSoundFrame);
});
find('convert-stop').addEventListener('click',()=>stopMic());
find('convert-use').addEventListener('click',()=>{
if(!capturedSound.length||micSession?.mode==='convert'||!canReplace())return;
const bpm=Number(find('take-tempo').value);
if(!Number.isFinite(bpm)||bpm<20||bpm>400){report('Enter a tempo from 20 to 400 BPM.');return;}
const take=takeEvents(capturedSound,bpm);
loadProject({id:newId(),title:'Captured score',author:'',tempo:bpm,...take});
draftChanged=true;openPage('editor');report('Imported '+take.notes.length+' notes and rests.');
});


const noteMenu=find('note-menu'), swapDialog=find('swap-dialog'), swapStatus=find('swap-status');
const swapChoices=find('swap-choices'), swapConfirm=find('swap-confirm');
let swapIndex=-1, swapPitch=null;
function closeNoteMenu(){
noteMenu.hidden=true;
}
function openNoteMenu(index,x,y){
selectPosition(index);
find('note-menu-earlier').disabled=index===0;
find('note-menu-later').disabled=index===score.events.length-1;
noteMenu.hidden=false;
noteMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-noteMenu.offsetWidth-8))+'px';
noteMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-noteMenu.offsetHeight-8))+'px';
find('note-menu-swap').focus();
}
function openSwap(){
if(!score.events.length||recording||micSession?.mode==='convert'){
report('Finish recording before swapping a note.');return;
}
closeNoteMenu();stopSound();
swapIndex=position;swapPitch=null;swapConfirm.disabled=true;
swapStatus.textContent='Replacing note '+(swapIndex+1)+' ('+name(score.events[swapIndex].pitch)+'). Click a pitch to hear it.';
for(const button of swapChoices.children)button.setAttribute('aria-pressed','false');
swapDialog.showModal();
}
for(let midi=69;midi<=89;midi++){
const button=document.createElement('button');
button.type='button';button.className='ctrl swap-choice';
button.setAttribute('aria-pressed','false');
const label=document.createElement('span');label.textContent=name(midi);
button.append(makeFinger(midi),label);
button.addEventListener('click',()=>{
swapPitch=midi;swapConfirm.disabled=false;
for(const choice of swapChoices.children)choice.setAttribute('aria-pressed',String(choice===button));
swapStatus.textContent=name(midi)+' selected. Choose it to replace note '+(swapIndex+1)+'.';
previewPitch(midi);
});
swapChoices.append(button);
}
find('swap-note').addEventListener('click',openSwap);
find('swap-cancel').addEventListener('click',()=>swapDialog.close());
swapConfirm.addEventListener('click',()=>{
if(swapPitch===null||swapIndex<0||swapIndex>=score.events.length)return;
const index=swapIndex;
score.events[index].pitch=swapPitch;
edited(index);
swapDialog.close();
report('Note '+(index+1)+' changed to '+name(score.events[index].pitch)+'.');
});
swapDialog.addEventListener('close',()=>{
stopStep();swapIndex=-1;swapPitch=null;
pads[position]?.focus({preventScroll:true});
});
const menuActions={
swap:openSwap,
hear:()=>{stopStep();start('step',position);stepTimer=setTimeout(stopStep,320);},
insert:()=>find('insert').click(),
earlier:()=>move(-1),
later:()=>move(1),
remove:removeSelected,
};
for(const [key,action] of Object.entries(menuActions)){
find('note-menu-'+key).addEventListener('click',()=>{
closeNoteMenu();action();
if(key!=='swap')pads[position]?.focus({preventScroll:true});
});
}
document.addEventListener('pointerdown',e=>{
if(!noteMenu.hidden&&!noteMenu.contains(e.target))closeNoteMenu();
});
document.addEventListener('keydown',e=>{
if(!noteMenu.hidden&&e.key==='Escape'){
e.preventDefault();closeNoteMenu();pads[position]?.focus({preventScroll:true});
}
});
window.addEventListener('resize',closeNoteMenu);


const tutorial=find('tour');
const tutorialSteps=[
 [
  "Home and sounds",
  "home",
  "[data-oc-page='help']",
  "Find your way around",
  "OSM groups composing, importing, saved scores, playable notes, practice, and tuning on the home screen. The lower-right link opens kiri’s GitHub profile."
 ],
 [
  "Home and sounds",
  "home",
  "#oc93-sound-open",
  "Choose an ocarina sound",
  "Open the gear and choose oc1, oc2, or oc3. Hear sample plays Ode to Joy. The browser remembers your choice for score playback and note previews."
 ],
 [
  "Home and sounds",
  "palette",
  "#oc93-palette",
  "Hear and see fingerings",
  "Click a pitch or press its displayed letter. The centered chart shows the matching fingering and pitch."
 ],
 [
  "Home and sounds",
  "tuner",
  "#oc93-tuner-start",
  "Tune a real ocarina",
  "Start the microphone and play a steady note. The tuner shows pitch, frequency, sharp or flat feedback, and the corresponding Alto C fingering."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-text",
  "Paste notes or ABC",
  "Paste note names or single-voice ABC. Supported ABC can include key signatures, accidentals, rests, ties, tuplets, and inline tempo changes."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-image",
  "Read a fingering image",
  "Upload clear PNG or JPG fingering diagrams or a PDF. OSM reads numbered PDF labels when present and otherwise tries scanning the diagrams. Correct detected pitches in the review dialog before continuing. Image imports start with one beat per event."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-midi-file",
  "Import a MIDI melody",
  "Choose a monophonic track. Written durations and rests are retained, and tempo changes are used in playback and notation. If possible, OSM offers to transpose an out-of-range melody."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-musicxml-file",
  "Import MusicXML",
  "Import a single partwise melody. OSM reads pitch, key, meter, rests, forward gaps, ties, tuplet durations, and tempo directions. Multipart scores, chords, grace notes, and multiple simultaneous voices need preparation elsewhere."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-audio-file",
  "Transcribe a recording",
  "Select a solo WAV or MP3. Review the resulting pitches and estimated tempo before opening the take as a score."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-calibrate",
  "Record with the microphone",
  "Optionally measure room noise, then play one note at a time. The waveform and input meter show what the microphone receives. Leave a clear gap between repeated pitches."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-take-tempo",
  "Review a detected melody",
  "Stop capture to see pitch choices, uncertain notes, durations, and the estimated tempo. Correct pitches and adjust the tempo before opening the take. Detected pauses can become rests."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-restore",
  "Restore a project backup",
  "Import an exported JSON project to restore its score and settings. Saved scores are stored in this browser and listed under View existing scores."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-compose-panel",
  "Compose a score",
  "Make new score opens a blank editor. Choose a playable pitch to hear it and insert it after the current selection."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-save",
  "Name and save a score",
  "Enter a title and optional source or author. Save score stores the project in this browser. Use a project backup for another device or browser."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-sequence",
  "Edit the sequence",
  "Click a card to select and hear it. Arrow keys move the selection. Delete removes it. Right-click to hear, insert, move, remove, or audition a replacement with Swap note."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-edit-pitch",
  "Change pitch or duration",
  "Use the selected-note controls to edit pitch and beats. The fingering, playback, staff, and exports share the same score events."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-rest",
  "Insert, split, and merge",
  "Insert a rest for silence. Split divides a duration. Merge combines adjacent events of the same pitch. Copy event and Paste event reuse a pitch and duration."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-undo",
  "Undo and redo",
  "Use Undo and Redo for note and notation changes in the current editing session. Command-Z or Control-Z undoes an edit. Add Shift to redo."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-timeline",
  "Edit in the piano roll",
  "Select a note in the timeline. Drag its right edge to resize its written duration. The Beats field is a keyboard-friendly alternative."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-transpose",
  "Fit the instrument range",
  "Shift the whole melody by semitones or shift one selected note by an octave. OSM checks the 12-hole Alto C range, A4 through F6."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-meter",
  "Set meter, key, and tempo",
  "Choose a time signature, major key signature, and base tempo. A key signature changes how accidentals are written while preserving pitches. Applying a new global tempo replaces the imported tempo map and exact timing."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-view",
  "Read and edit the staff",
  "Open notation and click a note to focus its pitch control. The timing table lets you edit written beats and apply them to playback. Long pitches can be tied across barlines."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-view",
  "Read triplets and tempo changes",
  "Eligible equal-duration 3:2 triplets show a triplet marking. Imported tempo changes appear in the staff and carry through ABC and MusicXML exports."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-play",
  "Play a score",
  "Play all follows the rhythm and updates the large fingering and staff highlights without scrolling the page. Use Stop, Loop, or Playback speed. Press Enter to step through notes manually."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-record",
  "Tap in a rhythm",
  "Select a starting note, start Record Enter timing, and tap Enter in rhythm. Finish recording, then apply exact intervals or quantized written durations."
 ],
 [
  "Practice",
  "practice-setup",
  "#oc93-practice-options",
  "Practice without saving",
  "Choose pasted notes or ABC, uploaded fingering tabs, or a JSON project backup. Play Along is also available directly from the Score Editor."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-chart",
  "Follow the fingering",
  "The large diagram shows the next fingering. With the microphone running, the corner shows the detected pitch. A blue outline marks the target, and a correct match turns the card green."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-start",
  "Advance and restart",
  "Play a matching note or press Enter to advance manually. Pause stops listening. Restart clears progress in the current range. The arrow below the cards expands the default eight-note view."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-part",
  "Work on a specific part",
  "Choose the first and last notes in the range picker. Practice selected notes uses only that range. Loop section repeats it, and Practice full sequence restores the song."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-metronome",
  "Practice with a beat",
  "Set the practice BPM and enable the metronome for a reference click. Timed practice gives a visual four-beat count-in, then reports early or late matches. The input offset is a manual adjustment."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-feedback",
  "Review feedback",
  "Play Along tracks matched notes and reports expected versus heard pitch. Completed microphone sessions appear in Recent practice. Pitch accuracy measures detected attempts, including wrong notes."
 ],
 [
  "Export",
  "editor",
  "#oc93-music-panel",
  "Export sheet music",
  "Choose Music score for ABC, MusicXML, or an engraved PDF. ABC and MusicXML retain supported triplets and tempo marks. Copy for chat includes notation and available measured timing."
 ],
 [
  "Export",
  "editor",
  "#oc93-tabs-panel",
  "Export fingering tabs",
  "Choose Ocarina tabs. Edit the title, credit, spaces, and line breaks. Preview the fingerings and rhythm, then download PDF, SVG, or PNG, or copy codes for Ocarina Tabs Creator."
 ],
 [
  "Export",
  "editor",
  "#oc93-backup",
  "Keep a project backup",
  "Choose Project backup and download JSON. Reimport it to edit the project or open it in Practice. The separate installable preview package supports offline use after a first online visit in a compatible browser."
 ]
];
let tutorialIndex=0,tutorialTarget=null;
const tutorialTopic=find('tour-topic');
for(const topic of new Set(tutorialSteps.map(step=>step[0])))tutorialTopic.add(new Option(topic,topic));
tutorialTopic.onchange=()=>{
tutorialIndex=tutorialSteps.findIndex(step=>step[0]===tutorialTopic.value);
showTutorialStep();
};
function showTutorialStep(){
tutorialTarget?.classList.remove('tutorial-target');
const [topic,page,selector,heading,description]=tutorialSteps[tutorialIndex];
tutorialTopic.value=topic;
if(page==='practice'&&currentPage!=='practice')showPractice([72,74,76,77,79,77,76,74,72],'help');
else openPage(page);
if(page==='practice-setup')choosePractice(null);
const exportModes={'#oc93-music-panel':'music','#oc93-tabs-panel':'tabs','#oc93-backup':'backup'};
if(exportModes[selector]){
const menu=find('export-kind');menu.value=exportModes[selector];menu.dispatchEvent(new Event('change'));
}
tutorialTarget=root.querySelector(selector);
for(let parent=tutorialTarget?.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
tutorialTarget?.classList.add('tutorial-target');
tutorialTarget?.scrollIntoView({block:'center'});
find('tour-progress').textContent=(tutorialIndex+1)+' of '+tutorialSteps.length;
find('tour-heading').textContent=heading;
find('tour-text').textContent=description;
const example=find('tour-example');
example.hidden=heading!=='Read triplets and tempo changes';
if(!example.hidden)loadNotation().then(()=>{if(!example.hidden)window.ABCJS.renderAbc(example,'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n(3cde [Q:1/4=90] f2 z4 |]',{responsive:'resize',staffwidth:300});}).catch(loadError);
else example.replaceChildren();
find('tour-back').disabled=tutorialIndex===0;
find('tour-next').textContent=tutorialIndex===tutorialSteps.length-1?'Finish':'Next';
}
function startTutorial(index){
tutorialIndex=index;showTutorialStep();tutorial.show();find('tour-next').focus();
}
find('tutorial').addEventListener('click',()=>startTutorial(0));
root.querySelectorAll('[data-tour-topic]').forEach(button=>{
button.onclick=()=>startTutorial(tutorialSteps.findIndex(step=>step[0]===button.dataset.tourTopic));
});
find('tour-back').addEventListener('click',()=>{tutorialIndex--;showTutorialStep();});
find('tour-next').addEventListener('click',()=>{
if(tutorialIndex===tutorialSteps.length-1){tutorial.close();return;}
tutorialIndex++;showTutorialStep();
});
find('tour-close').addEventListener('click',()=>tutorial.close());
tutorial.addEventListener('close',()=>{
tutorialTarget?.classList.remove('tutorial-target');tutorialTarget=null;
openPage('help');find('tutorial').focus();
});
document.addEventListener('keydown',e=>{
if(e.code==='Escape'&&tutorial.open){e.preventDefault();tutorial.close();}
});

const composeKeys=find('compose-keys');
for(let midi=69;midi<=89;midi++){
const button=document.createElement('button');
button.className='ctrl';button.textContent=name(midi);
button.addEventListener('click',()=>{
if(recording){report('Finish recording before adding notes.');return;}
const index=score.events.length?position+1:0;
score.splice(index,0,[{pitch:midi,ticks:4}]);
edited(index,true);showPlaybackFingering(index);previewPitch(midi);
});
composeKeys.append(button);
}
let practiceMode=null;
function choosePractice(mode){
if(mode===null){
const list=find('practice-history');list.replaceChildren();
let history=[];try{history=JSON.parse(localStorage.getItem('osm-practice-history')||'[]');}catch{}
for(const session of Array.isArray(history)&&history.length?history:[null]){
const item=document.createElement('li');
item.textContent=session?new Date(session.date).toLocaleDateString()+' · '+session.matched+'/'+session.notes+' matched'+(session.meanTiming===null?'':' · '+session.meanTiming+' ms mean timing error'):'No completed sessions yet.';
list.append(item);
}
}
practiceMode=mode;pdfRequest++;find('reference-hint').hidden=true;
find('practice-options').hidden=mode!==null;
find('practice-mode-back').hidden=mode===null;
for(const choice of ['paste','tabs','backup'])find('practice-'+choice).hidden=choice!==mode;
report('');
}
for(const button of root.querySelectorAll('[data-practice-mode]')){
button.addEventListener('click',()=>choosePractice(button.dataset.practiceMode));
}
find('practice-mode-back').addEventListener('click',()=>choosePractice(null));

async function readTabPitches(file){
if(!window.pdfjsLib)await loadAsset('pdf-reader.js');
const embedded=document.getElementById('osm-pdf-worker');
const workerURL=embedded?URL.createObjectURL(new Blob([embedded.textContent],{type:'text/javascript'})):'./pdf-worker.js';
let task;
try{
window.pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
task=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true});
const pdf=await task.promise;
const labels=new Map();
if(pdf.numPages>30)throw Error('Upload up to 30 pages at a time.');
for(let i=1;i<=pdf.numPages;i++){
const page=await pdf.getPage(i);
const content=await page.getTextContent();
const text=content.items.map(item=>item.str??'').join(' ');
for(const [,number,pitch] of text.matchAll(/(?:^|\s)(\d+)\s*[·•]\s*([A-G](?:#|♯)?[456]|Rest)\b/g)){
const index=Number(number);
if(labels.has(index))throw Error('The PDF has duplicate note numbers. Export one score as an OSM fingering PDF.');
labels.set(index,pitch==='Rest'?null:toMidi(pitch.replace('♯','#')));
}
}
const pitches=Array.from({length:labels.size},(_,i)=>labels.get(i+1));
if(!labels.size){
const scanned=[];
for(let i=1;i<=pdf.numPages;i++){
const page=await pdf.getPage(i);
const viewport=page.getViewport({scale:Math.min(3,1800/page.getViewport({scale:1}).width)});
const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
const context=canvas.getContext('2d',{willReadFrequently:true});
await page.render({canvasContext:context,viewport}).promise;
try{scanned.push(...scanFingerings(canvas,context));}
catch(error){throw Error('Page '+i+': '+error.message);}
}
return scanned;
}
if(pitches.some(m=>!Music.playable(m)))throw Error('Could not read a complete numbered note sequence.');
return pitches;
}finally{
try{await task?.destroy();}finally{if(embedded)URL.revokeObjectURL(workerURL);}
}
}
function scanFingerings(canvas, context, Path=Path2D, paths=fingerPaths){
const {width,height}=canvas;
const rgba=context.getImageData(0,0,width,height).data;
const ink=new Uint8Array(width*height);
for(let i=0;i<ink.length;i++)ink[i]=rgba[4*i+3]>100&&rgba[4*i]+rgba[4*i+1]+rgba[4*i+2]<690?1:0;
const visited=new Uint8Array(ink.length), boxes=[];
for(let i=0;i<ink.length;i++){
if(!ink[i]||visited[i])continue;
const queue=[i];visited[i]=1;
let l=width,r=0,t=height,b=0;
for(let j=0;j<queue.length;j++){
const p=queue[j],x=p%width,y=Math.floor(p/width);
l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
const n=p+dy*width+dx;
if(ink[n]&&!visited[n]){visited[n]=1;queue.push(n);}
}
}
const w=r-l+1,h=b-t+1;
if(w>=22&&h>=20&&w/h>.78&&w/h<1.45)boxes.push({l,t,w,h});
}
if(!boxes.length)throw Error('No matching ocarina diagrams found. Use a clear PNG with dark diagrams on a light background.');
const size=64;
const sample=context;
const template=paths.map(([w,h,d])=>{
sample.save();sample.resetTransform();
sample.clearRect(0,0,size,size);
sample.setTransform(size/(w-20),0,0,size/(h-20),-10*size/(w-20),-10*size/(h-20));
sample.fillStyle='#000';sample.fill(new Path(d));sample.restore();
const data=sample.getImageData(0,0,size,size).data;
return Array.from({length:size*size},(_,i)=>data[4*i+3]>128);
});
const rows=[];
for(const box of boxes.sort((a,b)=>a.t-b.t)){
if(!rows.some(row=>Math.abs(row.t-box.t)<box.h*.4))rows.push(box);
}
const nominal=boxes.sort((a,b)=>a.w-b.w)[Math.floor(boxes.length/2)];
const step=Math.round(nominal.w*64/62);
const origin=Math.min(...boxes.map(box=>box.l));
const slots=[];
for(const row of rows){
for(let x=origin;x+nominal.w<=width;x+=step){
let density=0;
for(let y=row.t;y<row.t+nominal.h*.72;y++)for(let col=x;col<x+nominal.w;col++)density+=ink[y*width+col];
if(density>nominal.w*nominal.h*.03)slots.push({l:x,t:row.t,w:nominal.w,h:nominal.h});
}
}
const varying=template[0].map((v,i)=>template.some(mask=>mask[i]!==v));
return slots.map(({l,t,w,h},index)=>{
const observed=[];
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
const p=((t+Math.floor((y+.5)*h/size))*width+l+Math.floor((x+.5)*w/size))*4;
observed.push(rgba[p+3]>128&&rgba[p]+rgba[p+1]+rgba[p+2]<405);
}
const scores=template.map((mask,i)=>({midi:69+i,error:mask.reduce((sum,v,j)=>sum+(varying[j]&&v!==observed[j]),0)})).sort((a,b)=>a.error-b.error);
if(scores[1].error-scores[0].error<3)throw Error('Could not read fingering '+(index+1)+' confidently. Try a clearer crop of the tabs.');
return scores[0].midi;
});
}
async function readPracticeTab(file){
const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
if((signature.join(',')==='137,80,78,71,13,10,26,10'||(signature[0]===255&&signature[1]===216&&signature[2]===255))){
const bitmap=await createImageBitmap(file);
try{
if(bitmap.width*bitmap.height>12000000)throw Error('Crop the PNG to the tab area and try again.');
const canvas=document.createElement('canvas');
canvas.width=bitmap.width;canvas.height=bitmap.height;
const context=canvas.getContext('2d',{willReadFrequently:true});
context.drawImage(bitmap,0,0);
return scanFingerings(canvas,context);
}finally{bitmap.close();}
}
if(new TextDecoder().decode(signature).startsWith('%PDF-'))return readTabPitches(file);
throw Error('Choose a valid PNG, JPG, or PDF file.');
}
let pdfRequest=0;
function bindTabUpload(id,isPractice){
const input=find(id),hint=find(id+'-hint');
const help=hint.querySelector('button');
help.addEventListener('click',event=>{
if(event.pointerType!=='mouse'&&event.pointerType!=='pen')hint.toggleAttribute('data-open');
});
help.addEventListener('pointerleave',()=>hint.removeAttribute('data-open'));
help.addEventListener('blur',()=>hint.removeAttribute('data-open'));
input.addEventListener('change',async()=>{
const file=input.files[0];input.value='';
if(!file)return;
hint.hidden=true;hint.removeAttribute('data-open');
const request=++pdfRequest;
const active=()=>request===pdfRequest&&(isPractice?
currentPage==='practice-setup'&&practiceMode==='tabs':currentPage==='import');
try{
report('Reading the ocarina tabs…');
const pitches=await readPracticeTab(file);
if(!active())return;
const review=find('scan-review');
const text=find('scan-pitches');text.value=pitches.map(p=>p===null?'Rest':pitchText(p)).join(' ');
review.returnValue='';review.showModal();
const confirmed=await new Promise(resolve=>review.addEventListener('close',()=>resolve(review.returnValue==='use'),{once:true}));
if(!active()||!confirmed){if(active())report('');return;}
const tokens=text.value.trim().split(/\s+/);
if(!tokens.length||!tokens.every(t=>/^(Rest|[A-G]#?[456])$/i.test(t)))throw Error('Use pitch names separated by spaces, or Rest.');
pitches.splice(0,pitches.length,...tokens.map(t=>t.toLowerCase()==='rest'?null:toMidi(t.toUpperCase())));
if(!pitches.every(Music.playable))throw Error('Use pitches between A4 and F6.');
if(isPractice){showPractice(pitches,'practice-setup');return;}
if(!canReplace()){report('');return;}
const title=file.name.replace(/\.[^.]+$/,'')||'Imported score';
loadProject({id:newId(),title,author:'',notes:pitches,lengths:pitches.map(()=>4),tempo:130,intervals:[]});
draftChanged=true;openPage('editor');
report('Imported '+pitches.length+' notes. Edit their durations in the score.');
}catch(error){
if(active()){hint.hidden=false;report(error.message);}
}
});
}
bindTabUpload('reference',true);
bindTabUpload('import-image',false);
find('practice-load').addEventListener('click',async()=>{
try{
if(/^X:/m.test(find('practice-input').value))await loadNotation();
if(currentPage!=='practice-setup')return;
const {notes:pitches,lengths}=parseSong(find('practice-input').value);
if(!pitches.length||pitches.some(m=>!Music.playable(m)))throw Error('Use playable pitches from A4 through F6.');
showPractice(pitches,'practice-setup',lengths);
}catch(error){report(error.message);}
});
find('practice-file').addEventListener('change',async e=>{
const file=e.target.files[0];e.target.value='';
if(!file)return;
try{
const project=JSON.parse(await file.text());
if(!validProject(project)||!project.notes.length)throw Error('Choose a project backup containing notes.');
if(currentPage==='practice-setup')showPractice(project.notes,'practice-setup',project.lengths);
}catch(error){if(currentPage==='practice-setup')report(error.message);}
});


const soundSettings=find('sound-settings');
const soundRadios=[...soundSettings.querySelectorAll('input[type=radio]')];
let soundChoice='oc2';
try{
const savedSound=localStorage.getItem('osm-ocarina-sound');
if(soundRadios.some(radio=>radio.value===savedSound))soundChoice=savedSound;
}catch{}
for(const radio of soundRadios){
radio.checked=radio.value===soundChoice;
radio.addEventListener('change',()=>{
if(!radio.checked)return;
stopSoundSample();soundChoice=radio.value;prepareSound()?.catch(loadError);
try{localStorage.setItem('osm-ocarina-sound',soundChoice);}catch{}
});
}
find('sound-open').addEventListener('click',()=>soundSettings.showModal());
const odeToJoy=[
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[76,1.5],[74,.5],[74,2],
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[74,1.5],[72,.5],[72,2],
[74,1],[74,1],[76,1],[72,1],[74,1],[76,.5],[77,.5],[76,1],[72,1],
[74,1],[76,.5],[77,.5],[76,1],[74,1],[72,1],[74,1],[67,2],
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[74,1.5],[72,.5],[72,2]
];
let soundSampleTimer=null;
function stopSoundSample(){
clearTimeout(soundSampleTimer);soundSampleTimer=null;end('sound-sample');
}
find('sound-preview').addEventListener('click',()=>{
stopSoundSample();stopStep();
let index=0;
function next(){
if(!soundSettings.open||index>=odeToJoy.length)return;
const [pitch,beats]=odeToJoy[index++];
start('sound-sample',-1,pitch);
const duration=340*beats;
soundSampleTimer=setTimeout(()=>{
end('sound-sample');
soundSampleTimer=setTimeout(next,duration*.14);
},duration*.86);
}
next();
});
find('sound-done').addEventListener('click',()=>soundSettings.close());
soundSettings.addEventListener('close',stopSoundSample);


const historyPast=[], historyFuture=[];
let lastScore;
function captureEdit(){
  return {notes:[...score.pitches],lengths:[...score.lengths],intervals:[...score.intervals],tempo:score.tempo,tempoMap:score.tempoMap.map(mark=>({...mark})),meter:score.meter,key:score.key,position};
}
function updateHistoryButtons(){
  find('undo').disabled=!historyPast.length;
  find('redo').disabled=!historyFuture.length;
}
function rememberEdit(){
  const next=captureEdit();
  if(lastScore&&JSON.stringify({...lastScore,position:0})!==JSON.stringify({...next,position:0})){
    historyPast.push(lastScore);historyFuture.length=0;
  }
  lastScore=next;updateHistoryButtons();drawTimeline();
}
function restoreEdit(from,to){
  if(!from.length||recording)return;
  stopSound();
  to.push(captureEdit());
  const state=from.pop();
  score.load(state);find("meter").value=score.meter;find("score-key").value=score.key;find("editor-tempo").value=score.tempo;
  lastScore=captureEdit();draftChanged=true;
  refreshSong(state.position);updateHistoryButtons();drawTimeline();
  if(!find('score').hidden)showScore(false);
}
find('undo').onclick=()=>restoreEdit(historyPast,historyFuture);
find('redo').onclick=()=>restoreEdit(historyFuture,historyPast);
let copiedNote=null;
find('copy-note').onclick=()=>{
  if(score.events.length)copiedNote={pitch:score.events[position].pitch,ticks:score.events[position].ticks};
  find('paste-note').disabled=!copiedNote;
};
function insertEvent(pitch,ticks=4){
  if(recording)return;
  const at=score.events.length?position+1:0;
  score.splice(at,0,[{pitch,ticks}]);edited(at,true);
}
find('paste-note').onclick=()=>{if(copiedNote)insertEvent(copiedNote.pitch,copiedNote.ticks);};
find('rest').onclick=()=>insertEvent(null);
find('split').onclick=()=>{
  if(!score.events.length||recording||score.events[position].ticks<2)return;
  const size=score.events[position].ticks,half=Math.floor(size/2);
  score.events[position].ticks=half;insertEvent(score.events[position].pitch,size-half);
};
find('merge').onclick=()=>{
  if(recording||position>=score.events.length-1||score.events[position].pitch!==score.events[position+1]?.pitch){report('Select adjacent notes of the same pitch to merge.');return;}
  score.events[position].ticks+=score.events[position+1].ticks;
  score.splice(position+1,1);score.events[position].ms=null;edited(position,true);
};
function shiftSelectedOctave(steps){
if(recording||!score.events.length||score.events[position].pitch===null)return;
const pitch=score.events[position].pitch+steps;
if(!Music.validPitch(pitch)){report("That shift exceeds the supported pitch range.");return;}
score.events[position].pitch=pitch;edited(position);previewPitch(pitch);
}
find('semitone-up').onclick=()=>shiftSelectedOctave(1);
find('semitone-down').onclick=()=>shiftSelectedOctave(-1);
find('octave-up').onclick=()=>shiftSelectedOctave(12);
find('octave-down').onclick=()=>shiftSelectedOctave(-12);
find('transpose').onclick=()=>{
  const steps=Number(find('transpose-steps').value);
  if(!Number.isInteger(steps)||!score.events.length||recording)return;
  const shifted=Music.transpose(score.pitches,steps);
  if(!shifted.every(Music.validPitch)){report('That shift exceeds the supported pitch range.');return;}
  shifted.forEach((pitch,i)=>{score.events[i].pitch=pitch;});edited(position);
};
for(const key of Object.keys(keySignatures))find('score-key').add(new Option(key+' major',key));
find('score-key').onchange=()=>{
if(recording){find('score-key').value=score.key;return;}
score.key=find('score-key').value;edited(position);
};
find('meter').onchange=()=>{if(recording){find('meter').value=score.meter;return;}const value=find('meter').value.trim();if(!meterTicks(value)){find('meter').value=score.meter;report('Use a time signature like 5/4 or 7/8.');return;}score.meter=value;edited(position);};
find('tempo-set').onclick=()=>{
  const bpm=Number(find('editor-tempo').value);
  if(bpm<20||bpm>400||!Number.isFinite(bpm)){report('Enter a tempo from 20 to 400 BPM.');return;}
  score.tempo=bpm;score.tempoMap=[];score.events.forEach(event=>{event.ms=null;});edited(position);
};
function drawTimeline(){
  const host=find('timeline');host.replaceChildren();
  const total=score.lengths.reduce((sum,n)=>sum+n,0);
  if(!total)return;
  const grid=document.createElement('div');grid.className='osm-roll';
  grid.style.width=Math.max(300,total*9)+'px';
  let tick=0;
  score.pitches.forEach((m,i)=>{
    const card=document.createElement('button');card.className='ctrl';
    card.style.left=tick*9+'px';card.style.top=(m===null?21:Math.min(21,Math.max(0,89-m)))*18+'px';
    card.style.width=Math.max(16,score.events[i].ticks*9)+'px';
    card.textContent=m===null?'Rest':name(m);card.title='Note '+(i+1)+' · '+card.textContent;
    card.onclick=()=>{selectPosition(i);showPlaybackFingering(i);if(m!==null)previewPitch(m);};
const grip=document.createElement('span');grip.className='osm-roll-grip';grip.title='Drag to change duration';
grip.addEventListener('pointerdown',event=>{
if(event.button!==0||recording)return;
event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);
const start=event.clientX, original=score.events[i].ticks;
const length=e=>Math.max(1,Math.round(original+(e.clientX-start)/9));
grip.onpointermove=e=>{card.style.width=Math.max(22,length(e)*9)+'px';};
grip.onpointerup=e=>{
const ticks=length(e);
if(ticks===original){drawTimeline();return;}
score.events[i].ticks=ticks;score.events[i].ms=null;edited(i);
};
grip.onpointercancel=drawTimeline;
});
card.append(grip);
    grid.append(card);tick+=score.events[i].ticks;
  });
  host.append(grid);
}
document.addEventListener('keydown',event=>{
  if(currentPage!=='editor'||editable(event.target)||swapDialog.open||tutorial.open||!(event.metaKey||event.ctrlKey)||event.altKey)return;
  if(event.key.toLowerCase()==='z'){event.preventDefault();(event.shiftKey?find('redo'):find('undo')).click();}
});

function reviewTake(){
  const host=find('take-review');host.replaceChildren();
  const bpm=Music.tempo(capturedSound.map(n=>n.time));
  find('take-tempo').value=bpm;
  host.hidden=!capturedSound.length;
  capturedSound.forEach((entry,i)=>{
    const row=document.createElement('label');
    row.textContent='Note '+(i+1)+(entry.confidence<.85?' · Check pitch':'')+' ';
    const select=document.createElement('select');
    for(let m=69;m<=89;m++)select.add(new Option(name(m),m));
    select.value=entry.midi;select.onchange=()=>{entry.midi=Number(select.value);};
    row.append(select,document.createTextNode(' · '+Math.round(entry.end-entry.time)+' ms'));
    host.append(row);
  });
}
function takeEvents(take,bpm){
  const events=[];
  take.forEach((note,i)=>{
    const ms=note.end-note.time;
    events.push({pitch:note.midi,ms});
    const gap=(take[i+1]?.time??note.end)-note.end;
    if(gap>=110)events.push({pitch:null,ms:gap});
    else if(gap>0)events.at(-1).ms+=gap;
  });
  return {notes:events.map(e=>e.pitch),lengths:events.map(e=>Music.ticks(e.ms,bpm)),intervals:events.map(e=>e.ms)};
}
function inputMeter(samples){
  let peak=0;
  const points=[];
  for(let i=0;i<samples.length;i+=16){
    peak=Math.max(peak,Math.abs(samples[i]));
    points.push((i/samples.length*240).toFixed(1)+','+(22-samples[i]*21).toFixed(1));
  }
  find('take-wave').setAttribute('points',points.join(' '));
  find('take-level').value=peak;
}


function readMusicXML(xml){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  const parts=doc.querySelectorAll('score-partwise > part');
  if(parts.length>1)throw Error('Export the ocarina melody as a single MusicXML part before importing.');
  const part=parts[0];
  if(!part||doc.querySelector('parsererror'))throw Error('Choose a partwise MusicXML file.');
  let divisions=1,bpm=120,meter='4/4',key='C',tied=false,elapsed=0;
  const tempoMap=[];
  const notes=[],lengths=[];
  for(const measure of part.children){
    for(const item of measure.children){
      if(item.localName==='attributes'){
divisions=Number(item.querySelector('divisions')?.textContent??divisions);
const fifths=item.querySelector('key > fifths');
if(fifths){
const signature=Object.keys(keySignatures).find(name=>keySignatures[name]===Number(fifths.textContent));
if(signature)key=signature;
}
const time=item.querySelector('time');
if(time){
const signature=time.querySelector('beats')?.textContent+'/'+time.querySelector('beat-type')?.textContent;
if(!meterTicks(signature))throw Error('Unsupported MusicXML time signature.');
if(notes.length&&signature!==meter)throw Error('Changing MusicXML time signatures are unsupported.');
meter=signature;
}
}
      if(item.localName==='direction'){
const value=Number(item.querySelector('sound[tempo]')?.getAttribute('tempo'));
if(Number.isFinite(value)&&value>0){
const tick=elapsed+Number(item.querySelector('offset')?.textContent??0)*4/divisions;
if(tick===0)bpm=value;
else if(tick>0)tempoMap.push({tick,bpm:value});
}
}
      if(item.localName==='backup')throw Error('Import supports one monophonic voice.');
      if(item.localName==='forward'){
        const gap=Number(item.querySelector('duration')?.textContent)*4/divisions;
        if(!Number.isFinite(gap)||gap<=0)throw Error('Invalid MusicXML gap duration.');
        notes.push(null);lengths.push(gap);elapsed+=gap;tied=false;continue;
      }
      if(item.localName!=='note')continue;
      if(item.querySelector('chord, grace'))throw Error('Chords and grace notes are unsupported.');
      const get=tag=>item.querySelector(tag)?.textContent;
      const pitch=item.querySelector('rest')?null:(Number(get('octave'))+1)*12+pcs[get('step')]+Number(get('alter')??0);
      const length=Number(get('duration'))*4/divisions;
      if(!Number.isFinite(length)||length<=0||!Music.playable(pitch))throw Error('This score contains an unsupported duration or pitch outside A4–F6.');
      if(tied&&item.querySelector('tie[type="stop"]')&&notes.at(-1)===pitch)lengths[lengths.length-1]+=length;
      else{notes.push(pitch);lengths.push(length);}
      tied=Boolean(item.querySelector('tie[type="start"]'));elapsed+=length;
    }
  }
  return {notes,lengths,tempo:bpm,tempoMap:[...new Map(tempoMap.map(m=>[m.tick,m])).values()].sort((a,b)=>a.tick-b.tick),meter,key,intervals:[],title:doc.querySelector("work-title")?.textContent,author:doc.querySelector("creator")?.textContent};
}
function musicXML(){
  const escape=value=>value.replace(/[<>&]/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;'})[ch]);
  const [beats,beatType]=score.meter.split('/');
  const division=960, measureSize=meterTicks(score.meter)*240;
  const measures=[];
  let used=0, body='', cursor=0, mark=0, group=0;
  const marks=score.tempoMap.map(m=>({tick:Math.round(m.tick*240),bpm:m.bpm}));
  const entries=scoreEntries();
  function flush(){
    measures.push('<measure number="'+(measures.length+1)+'"'+(used<measureSize?' implicit="yes"':'')+'>'+
      (measures.length?'':'<attributes><divisions>'+division+'</divisions><key><fifths>'+keySignatures[score.key]+'</fifths><mode>major</mode></key><time><beats>'+beats+'</beats><beat-type>'+beatType+'</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>'+score.tempo+'</per-minute></metronome></direction-type><sound tempo="'+score.tempo+'"/></direction>')+body+'</measure>');
    body='';used=0;
  }
  for(const [index,event] of score.events.entries()){
    const nextMark=marks.slice(mark).find(change=>change.tick>cursor);
    const available=Math.min(measureSize-used,(nextMark?.tick??Infinity)-cursor)/240;
    if(!group&&tripletAt(entries,index,available))group=3;
    const pitch=event.pitch===null?null:pitchText(event.pitch);
    const head=pitch===null?'<rest/>':'<pitch><step>'+pitch[0]+'</step><alter>'+Number(pitch.includes('#'))+'</alter><octave>'+pitch.at(-1)+'</octave></pitch>';
    let remaining=Math.max(1,Math.round(event.ticks*240)),continued=false;
    while(remaining){
      while(marks[mark]&&marks[mark].tick<=cursor){
        const bpm=Number(marks[mark++].bpm.toFixed(3));
        body+='<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>'+bpm+'</per-minute></metronome></direction-type><sound tempo="'+bpm+'"/></direction>';
      }
      const length=Math.min(remaining,measureSize-used,(marks[mark]?.tick??Infinity)-cursor);
      remaining-=length;used+=length;cursor+=length;
      const ties=pitch===null?[]:[...(continued?['stop']:[]),...(remaining?['start']:[])];
      const tuplet=group===3?'<tuplet type="start" bracket="yes"/>':group===1?'<tuplet type="stop"/>':'';
      const notation=ties.map(type=>'<tied type="'+type+'"/>').join('')+tuplet;
      const rhythm=group?'<type>'+({1:'16th',2:'eighth',4:'quarter',8:'half'})[Math.round(event.ticks*1.5)]+'</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>':'';
      body+='<note>'+head+'<duration>'+length+'</duration>'+ties.map(type=>'<tie type="'+type+'"/>').join('')+
        rhythm+(notation?'<notations>'+notation+'</notations>':'')+'</note>';
      if(group)group--;
      continued=true;
      if(used===measureSize)flush();
    }
  }
  if(body)flush();
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>'+escape(projectName.value)+'</work-title></work><identification><creator type="composer">'+escape(authorInput.value)+'</creator></identification><part-list><score-part id="P1"><part-name>Ocarina</part-name></score-part></part-list><part id="P1">'+measures.join('')+'</part></score-partwise>';
}
find('musicxml-export').onclick=()=>{if(score.events.length)download('ocarina.musicxml',musicXML());};
find('musicxml-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  try{
    const imported=readMusicXML(await file.text());
    const score={...imported,id:newId(),title:imported.title||file.name.replace(/\.[^.]+$/,''),author:imported.author||''};
    if(currentPage!=='import')return;
    if(!score.notes.length||!validProject(score))throw Error('No supported melody found.');
    if(!canReplace())return;
    loadProject(score);draftChanged=true;openPage('editor');
  }catch(error){if(currentPage==='import')report(error.message);}
};
find('audio-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  let ctx;
  try{
    if(micSession)stopMic();
    ctx=new Audio();
    report('Analyzing solo recording…');
    const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration>180)throw Error('Use a solo recording under three minutes.');
    if(currentPage!=='import')return;
    capturedSound=[];soundNote=null;soundCandidate=null;soundEnd=0;
    const samples=buffer.getChannelData(0),windowSize=2048;
    const step=Math.round(buffer.sampleRate*.02);
    for(let offset=0;offset+windowSize<=samples.length;offset+=step){
      const frame=samples.subarray(offset,offset+windowSize);
      const hz=estimatePitch(frame,buffer.sampleRate);
      const exact=hz?69+12*Math.log2(hz/440):null,midi=exact===null?null:Math.round(exact);
      captureSoundFrame(midi,hz,midi===null?0:Math.round((exact-midi)*100),offset/buffer.sampleRate*1000);
      if(offset%(step*40)===0){await new Promise(resolve=>setTimeout(resolve,0));if(currentPage!=='import')return;}
    }
    find('convert-open').open=true;stopSoundCapture();report('');
  }catch(error){if(currentPage==='import')report(error.message);}
  finally{await ctx?.close().catch(()=>{});}
};

function readMIDI(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=i=>String.fromCharCode(...bytes.subarray(i,i+4));
  if(bytes.length<14||tag(0)!=='MThd')throw Error('Invalid MIDI header.');
  const division=view.getUint16(12), tracks=view.getUint16(10);
  if(!division||division&32768)throw Error('MIDI must use beats as its time base.');
  const format=view.getUint16(8);
  if(format>1)throw Error('MIDI format 2 sequences are unsupported.');
  const tempoEvents=new Map([[0,500000]]);
  let offset=8+view.getUint32(4);
  const melodies=[];
  for(let n=0;n<tracks;n++){
    if(offset+8>bytes.length||tag(offset)!=='MTrk')throw Error('Invalid MIDI track.');
    const end=offset+8+view.getUint32(offset+4);offset+=8;
    if(end>bytes.length)throw Error('Incomplete MIDI track.');
    const byte=()=>{if(offset>=end)throw Error('Incomplete MIDI event.');return bytes[offset++];};
    const vlq=()=>{let value=0;for(let i=0;i<4;i++){const b=byte();value=value*128+(b&127);if(!(b&128))return value;}throw Error('Invalid MIDI event length.');};
    let tick=0,status=0;
    const active=new Map(),events=[];
    while(offset<end){
      tick+=vlq();
      let command=byte();
      if(command<128){offset--;command=status;}
      if(command===255){
        const kind=byte(),length=vlq();
        if(offset+length>end)throw Error('Incomplete MIDI metadata.');
        if(kind===81&&length===3){
          const micros=bytes[offset]*65536+bytes[offset+1]*256+bytes[offset+2];
          if(micros)tempoEvents.set(tick,micros);
        }
        offset+=length;continue;
      }
      if(command===240||command===247){const length=vlq();offset+=length;continue;}
      if(command<128||command>=240)throw Error('Unsupported MIDI event.');
      status=command;
      const kind=command>>4,key=byte(),velocity=kind===12||kind===13?0:byte();
      if((command&15)===9)continue;
      const id=(command&15)*128+key;
      if(kind===9&&velocity){active.set(id,tick);continue;}
      if((kind===8||kind===9)&&active.has(id)){
        const start=active.get(id);active.delete(id);
        if(tick>start)events.push({key,start,end:tick});
      }
    }
    if(events.length)melodies.push({number:n+1,events:events.sort((a,b)=>a.start-b.start)});
  }
  const supported=melodies.filter(({events})=>events.every((event,i)=>!i||event.start>=events[i-1].end));
  if(!supported.length)throw Error('No monophonic melody track found.');
  const changes=[...tempoEvents].sort((a,b)=>a[0]-b[0]);
  return supported.map(({number,events})=>({number,...midiTrackScore(events,division,changes)}));
}
function midiTrackScore(events,division,changes){
  const notes=[],lengths=[],intervals=[];
  const tempo=Math.min(400,Math.max(20,60000000/changes[0][1]));
  let last=0,tempoIndex=0;
  function append(pitch,start,end){
    let cursor=start, micros=0;
    while(tempoIndex+1<changes.length&&changes[tempoIndex+1][0]<=cursor)tempoIndex++;
    while(cursor<end){
      const stop=Math.min(end,changes[tempoIndex+1]?.[0]??end);
      micros+=(stop-cursor)*changes[tempoIndex][1]/division;
      cursor=stop;
      if(cursor===changes[tempoIndex+1]?.[0])tempoIndex++;
    }
    notes.push(pitch);lengths.push((end-start)*4/division);intervals.push(micros/1000);
  }
  for(const event of events){
    if(event.start>last)append(null,last,event.start);
    append(event.key,event.start,event.end);last=event.end;
  }
  return {notes,lengths,tempo,intervals,tempoMap:changes.slice(1).map(([tick,micros])=>({tick:tick*4/division,bpm:60000000/micros}))};
}
let pendingMIDI=null;
find('midi-file').onchange=async event=>{
const file=event.target.files[0];event.target.value='';
if(!file)return;
pendingMIDI=null;find('midi-picker').hidden=true;
const request=++pdfRequest;
try{
const scores=readMIDI(new Uint8Array(await file.arrayBuffer()));
if(currentPage!=='import'||request!==pdfRequest)return;
pendingMIDI={scores,title:file.name.replace(/\.[^.]+$/,'')};
const picker=find('midi-track');picker.replaceChildren();
scores.forEach((score,i)=>picker.add(new Option('Track '+score.number+' · '+score.notes.filter(m=>m!==null).length+' notes',i)));
find('midi-picker').hidden=false;report('');
}catch(error){if(currentPage==='import'&&request===pdfRequest)report(error.message);}
};
find('midi-use').onclick=()=>{
if(!pendingMIDI)return;
try{
const score={...pendingMIDI.scores[Number(find('midi-track').value)]};
if(!score.notes.every(Music.playable)){
const pitches=score.notes.filter(m=>m!==null);
const min=Math.min(...pitches),max=Math.max(...pitches);
if(max-min>20)throw Error('This melody spans more than A4–F6. Narrow its range before importing.');
const steps=min<69?69-min:89-max;
if(!window.confirm('Transpose the melody by '+steps+' semitones to fit A4–F6?'))return;
score.notes=Music.transpose(score.notes,steps);
}
const project={...score,id:newId(),title:pendingMIDI.title,author:''};
if(!validProject(project))throw Error('The MIDI tempo or durations are unsupported.');
if(!canReplace())return;
loadProject(project);draftChanged=true;openPage('editor');
}catch(error){report(error.message);}
};


restoreSavedProjects();
loadProject(projects.find(p=>p.id===projectId)??projects[0]??{id:newId(),title:'Untitled song',author:'',notes:[],lengths:[],tempo:130,intervals:[]});

window.addEventListener('beforeunload',e=>{if(draftChanged){e.preventDefault();e.returnValue='';}});
window.addEventListener('blur',()=>{stopStep();stopMelody();for(const id of [...voices.keys()])end(id)});

})();
