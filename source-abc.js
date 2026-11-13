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
const tokens=source.toUpperCase().replace(/♯/g,'#').split(/[\s,–—-]+/).filter(Boolean);
if(!tokens.every(token=>/^[A-G]#?[46]$|^[A-G]#?5$/.test(token)))throw Error('Use note names such as A4 - D#5 - C5 - F6.');
return {notes:tokens.map(toMidi),lengths:tokens.map(()=>4),tempo:130,intervals:[]};
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
if(!project.notes.length||!validProject(project))throw Error('Use playable pitches A4 through F6, positive durations, and a tempo from 20 to 400 BPM.');
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
