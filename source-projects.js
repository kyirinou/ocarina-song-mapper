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

