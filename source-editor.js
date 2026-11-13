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

