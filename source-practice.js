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
if(prefix==='recognition')resetRecognitionFeedback();
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


const recognitionPitches=Array.from({length:21},(_,i)=>69+i);
let recognitionPool=new Set(recognitionPitches);
let recognitionPitch=null,recognitionTimer=null,recognitionNeedsRelease=false;
const recognitionTarget=find('recognition-target');
const recognitionButtons=new Map();
function resetRecognitionFeedback(){
clearTimeout(recognitionTimer);
recognitionTimer=null;
recognitionNeedsRelease=false;
recognitionTarget.classList.remove('recognition-hit');
}
function nextRecognitionPitch(){
const pitches=[...recognitionPool];
const choices=pitches.length>1?pitches.filter(pitch=>pitch!==recognitionPitch):pitches;
recognitionPitch=choices.length?choices[Math.floor(Math.random()*choices.length)]:null;
recognitionTarget.textContent=recognitionPitch===null?'—':name(recognitionPitch);
}
function updateRecognitionPool(){
resetRecognitionFeedback();
for(const [pitch,button] of recognitionButtons)button.setAttribute('aria-pressed',String(recognitionPool.has(pitch)));
if(!recognitionPool.size&&micSession?.mode==='recognition')stopMic();
find('recognition-start').disabled=!recognitionPool.size||micSession?.mode==='recognition';
find('recognition-status').textContent=!recognitionPool.size?'Choose at least one pitch.':
micSession?.mode==='recognition'?'Play the displayed pitch.':'Start the microphone and play the displayed pitch.';
nextRecognitionPitch();
}
for(const pitch of recognitionPitches){
const button=document.createElement('button');
button.type='button';button.className='ctrl';button.textContent=name(pitch);
function togglePitch(){
if(recognitionPool.has(pitch))recognitionPool.delete(pitch);else recognitionPool.add(pitch);
updateRecognitionPool();
}
button.onclick=togglePitch;
button.oncontextmenu=event=>{event.preventDefault();togglePitch();};
recognitionButtons.set(pitch,button);
find('recognition-pool').append(button);
}
find('recognition-all').onclick=()=>{recognitionPool=new Set(recognitionPitches);updateRecognitionPool();};
find('recognition-clear').onclick=()=>{recognitionPool.clear();updateRecognitionPool();};
find('recognition-stop').onclick=()=>stopMic('Paused. Start the microphone to resume.');
find('recognition-start').onclick=()=>listenMic('recognition',(midi,frequency,cents)=>{
if(recognitionNeedsRelease){
if(midi!==recognitionPitch)recognitionNeedsRelease=false;
return;
}
if(recognitionTimer!==null||midi!==recognitionPitch||Math.abs(cents)>45)return;
recognitionTarget.classList.add('recognition-hit');
find('recognition-status').textContent='Correct!';
recognitionTimer=setTimeout(()=>{
recognitionTimer=null;
recognitionTarget.classList.remove('recognition-hit');
recognitionNeedsRelease=recognitionPool.size===1;
nextRecognitionPitch();
find('recognition-status').textContent=recognitionNeedsRelease?'Release the note, then play it again.':'Play the displayed pitch.';
},650);
});
updateRecognitionPool();
