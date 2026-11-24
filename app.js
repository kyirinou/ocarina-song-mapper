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


const pitchClasses={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const pitchNames=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function toMidi(text){
  const match=typeof text==='string'&&text.trim().match(/^([A-G])([#♯b♭]?)([0-9])$/i);
  if(!match)throw Error('Use a pitch such as A4 or D#5.');
  const pitch=(Number(match[3])+1)*12+pitchClasses[match[1].toUpperCase()]+
    (['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0);
  if(!Music.validPitch(pitch))throw Error('Pitch is outside C0–G9.');
  return pitch;
}
function pitchName(pitch){
  if(pitch===null)return 'Rest';
  if(!Music.validPitch(pitch))throw Error('Invalid pitch.');
  return pitchNames[pitch%12]+(Math.floor(pitch/12)-1);
}
function meterTicks(value){
  const match=typeof value==='string'&&value.match(/^([1-9]|1[0-9]|2[0-4])\/(2|4|8|16)$/);
  return match?16*Number(match[1])/Number(match[2]):0;
}
function validateProject(p){
return Boolean(p&&typeof p.id==='string'&&p.id.length>0&&typeof p.title==='string'&&
(p.author===undefined||typeof p.author==='string')&&Array.isArray(p.notes)&&p.notes.every(Music.validPitch)&&
Array.isArray(p.lengths)&&p.lengths.length===p.notes.length&&p.lengths.every(n=>Number.isFinite(n)&&n>0)&&
Number.isFinite(p.tempo)&&p.tempo>=20&&p.tempo<=400&&Array.isArray(p.intervals)&&
(p.tempoMap===undefined||(Array.isArray(p.tempoMap)&&p.tempoMap.every((mark,i)=>mark&&Number.isFinite(mark.tick)&&mark.tick>=0&&Number.isFinite(mark.bpm)&&mark.bpm>0&&(!i||mark.tick>p.tempoMap[i-1].tick))))&&
(p.performance===undefined||(Array.isArray(p.performance)&&p.performance.length===p.notes.length&&p.performance.every(e=>e&&(e.velocity===undefined||(Number.isInteger(e.velocity)&&e.velocity>=1&&e.velocity<=127))&&(e.muted===undefined||typeof e.muted==='boolean'))))&&
(p.schemaVersion===undefined||p.schemaVersion===1)&&
(p.meter===undefined||meterTicks(p.meter)>0)&&
(p.key===undefined||['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'].includes(p.key))&&
(p.tabDraft===undefined||p.tabDraft===null||(typeof p.tabDraft==='object'&&typeof p.tabDraft.text==='string'&&
['title','credit'].every(field=>p.tabDraft[field]===undefined||typeof p.tabDraft[field]==='string')&&
(p.tabDraft.size===undefined||(Number.isFinite(Number(p.tabDraft.size))&&Number(p.tabDraft.size)>=12&&Number(p.tabDraft.size)<=160))))&&
p.intervals.length<=p.notes.length&&p.intervals.every(n=>n===null||(Number.isFinite(n)&&n>0)));
}
function migrateProject(project){
  if(!validateProject(project))throw Error('This project has invalid notes, durations, or timing.');
  if(project.schemaVersion!==undefined&&project.schemaVersion!==1)throw Error('This project requires a newer OSM version.');
  if(project.meter!==undefined&&!meterTicks(project.meter))throw Error('Invalid time signature.');
  const result=structuredClone(project);
  result.schemaVersion=1;
  result.author??='';
  result.key??='C';
  result.meter??='4/4';
  result.tempoMap??=[];
  result.intervals=project.notes.map((_,index)=>project.intervals[index]??null);
  return result;
}

function detectPitch(samples,rate){
let energy=0;
for(const sample of samples)energy+=sample*sample;
if(Math.sqrt(energy/samples.length)<.006)return {frequency:0,confidence:0};
const maxLag=Math.floor(rate/180),minLag=Math.floor(rate/1800);
const length=Math.min(768,samples.length-maxLag-1);
if(length<=0)return {frequency:0,confidence:0};
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
const confidence=1-b;
return {frequency:rate/(lag+Math.max(-.5,Math.min(.5,offset))),confidence};
}
return {frequency:0,confidence:0};
}

// This checksum detects accidental truncation and corruption. It is not authentication.
function checksum(text){
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
function encode(payload,revision){
  return JSON.stringify({schemaVersion:1,revision,payload,checksum:checksum(JSON.stringify(payload))});
}
function decode(raw){
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object')throw Error('Saved data is not a library.');
  if(value.schemaVersion===undefined)return {payload:value,revision:0};
  if(value.schemaVersion!==1){
    const error=new Error('Saved data requires a newer OSM version.');
    error.code='UNSUPPORTED_SCHEMA';
    throw error;
  }
  if(!Number.isSafeInteger(value.revision)||value.revision<1||checksum(JSON.stringify(value.payload))!==value.checksum){
    throw Error('Saved data failed its integrity check.');
  }
  return value;
}
class ProjectStore {
  constructor(storage,{key='ocarina-song-mapper-v1'}={}){
    this.storage=storage;
    this.key=key;
    this.revision=0;
    this.blocked=false;
  }
  read(){
    const candidates=[],issues=[];
    for(const suffix of ['', '-pending','-previous']){
      try{
        const raw=this.storage.getItem(this.key+suffix);
        if(!raw)continue;
        const value=decode(raw);
        if(!Array.isArray(value.payload?.projects))throw Error('The saved library has no project list.');
        const projects=[];
        for(const project of value.payload.projects){
          try{
            if(project?.id==='starter')continue;
            projects.push(migrateProject(project));
          }
          catch(error){
            issues.push(error.message);
            try{this.preserve(raw);}
            catch{
              this.blocked=true;
              issues.push('The original library is retained, but storage could not hold a recovery copy.');
            }
          }
        }
        candidates.push({...value,projects,suffix,raw});
      }catch(error){
        issues.push(error.message);
        try{
          const raw=this.storage.getItem(this.key+suffix);
          if(raw)this.preserve(raw);
          let value;
          try{value=JSON.parse(raw);}catch{}
          if(value?.schemaVersion!==undefined&&value.schemaVersion!==1)this.blocked=true;
        }catch{this.blocked=true;}
      }
    }
    // A newer pending write is a recoverable interrupted save.
    candidates.sort((a,b)=>b.revision-a.revision||a.suffix.length-b.suffix.length);
    const chosen=candidates[0];
    this.revision=chosen?.revision??0;
    this.lastVerifiedRaw=chosen?.raw??null;
    return {projects:chosen?.projects??[],active:chosen?.payload.active??null,
      recovered:Boolean(chosen?.suffix)||issues.length>0,issues};
  }
  preserve(raw){
    if(!this.storage.getItem(this.key+'-recovery'))this.storage.setItem(this.key+'-recovery',raw);
  }
  save(projects,active){
    if(this.blocked)throw Error('Saved data could not be safely recovered. Download a backup before replacing browser data.');
    const normalized=projects.map(migrateProject);
    if(new Set(normalized.map(project=>project.id)).size!==normalized.length)throw Error('Duplicate project identifiers.');
    const pending=this.storage.getItem(this.key+'-pending');
    if(pending&&pending!==this.pendingRaw){
      let journal;
      try{journal=decode(pending);}catch{this.preserve(pending);}
      if(journal?.revision>this.revision)throw Error('Another OSM tab has a recoverable save. Reload this tab before saving.');
    }
    let current=this.storage.getItem(this.key);
    let currentRevision=0;
    if(current){
      let value;
      try{value=decode(current);}
      catch(error){
        this.preserve(current);
        if(error.code==='UNSUPPORTED_SCHEMA')throw error;
        current=this.lastVerifiedRaw;
        if(current)value=decode(current);
      }
      currentRevision=value?.revision??0;
      if(currentRevision>this.revision)throw Error('Another OSM tab saved changes. Reload this tab before saving.');
    }
    const revision=Math.max(this.revision,currentRevision)+1;
    const raw=encode({projects:normalized,active},revision);
    this.pendingRaw=raw;
    this.storage.setItem(this.key+'-pending',raw);
    if(this.storage.getItem(this.key+'-pending')!==raw)throw Error('The recovery write could not be verified.');
    if(current){
      // Retain the last verified library before replacing it.
      decode(current);
      this.storage.setItem(this.key+'-previous',current);
    }
    this.storage.setItem(this.key,raw);
    if(this.storage.getItem(this.key)!==raw)throw Error('The saved library could not be verified.');
    this.revision=revision;
    this.lastVerifiedRaw=raw;
    try{this.storage.removeItem(this.key+'-pending');}catch{}
    this.pendingRaw=null;
    return true;
  }
  checkpoints(){
    const raw=this.storage.getItem(this.key+'-checkpoints');
    if(!raw)return [];
    const {payload}=decode(raw);
    if(!Array.isArray(payload.entries))throw Error('Recovery snapshots could not be read.');
    return payload.entries.flatMap(entry=>{
      try{return [{...entry,project:migrateProject(entry.project)}];}catch{return [];}
    });
  }
  checkpoint(project,reason='Automatic recovery'){
    const normalized=migrateProject(project),entries=this.checkpoints();
    const previous=entries.find(entry=>entry.project.id===project.id);
    if(previous&&JSON.stringify(previous.project)===JSON.stringify(normalized))return null;
    const createdAt=new Date().toISOString();
    const entry={id:createdAt+'-'+Math.random().toString(36).slice(2),createdAt,reason,project:normalized};
    const next=[entry,...entries.filter(item=>item.project.id!==project.id).slice(0,24),
      ...entries.filter(item=>item.project.id===project.id).slice(0,5)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30);
    // Keep the newest recoverable edit when older snapshots exhaust storage.
    while(true){
      try{
        this.storage.setItem(this.key+'-checkpoints',encode({entries:next},Date.now()));
        break;
      }catch(error){
        if(next.length===1)throw error;
        next.pop();
      }
    }
    return entry;
  }
  removeCheckpoints(projectId){
    const entries=this.checkpoints().filter(entry=>entry.project.id!==projectId);
    this.storage.setItem(this.key+'-checkpoints',encode({entries},Date.now()));
  }
}

class InTuneHold {
  constructor(pitch,{seconds=3,tolerance=40}={}){
    this.pitch=pitch;
    this.seconds=seconds;
    this.tolerance=tolerance;
    this.reset();
  }
  reset(){
    this.frames=0;
    this.chunks=[];
    this.centsTotal=0;
    this.rate=null;
  }
  push(samples,rate){
    const {frequency,confidence}=detectPitch(samples,rate);
    const exact=frequency?69+12*Math.log2(frequency/440):null;
    const cents=exact===null?null:(exact-this.pitch)*100;
    const inTune=cents!==null&&confidence>=.8&&Math.abs(cents)<=this.tolerance;
    if(!inTune||this.rate!==null&&this.rate!==rate)this.reset();
    if(inTune){
      this.rate=rate;
      this.chunks.push(Float32Array.from(samples));
      this.frames+=samples.length;
      this.centsTotal+=cents*samples.length;
    }
    return {inTune,cents,heard:exact===null?null:Math.round(exact),
      progress:Math.min(1,this.frames/(rate*this.seconds)),complete:this.frames>=rate*this.seconds};
  }
  recording(){
    if(this.rate===null||this.frames<this.rate*this.seconds)throw Error('Hold the note in tune for three seconds.');
    const pcm=new Float32Array(Math.round(this.rate*this.seconds));
    let offset=0;
    for(const chunk of this.chunks){
      const length=Math.min(chunk.length,pcm.length-offset);
      pcm.set(chunk.subarray(0,length),offset);offset+=length;
      if(offset===pcm.length)break;
    }
    return {pitch:this.pitch,rate:this.rate,pcm,cents:this.centsTotal/this.frames};
  }
}

function soundLoop(recording){
  const {pcm,rate}=recording;
  const trim=Math.round(rate*.15),fade=Math.round(rate*.04);
  const input=pcm.subarray(trim,pcm.length-trim);
  const output=Float32Array.from(input.subarray(fade));
  const mean=output.reduce((sum,value)=>sum+value,0)/output.length;
  for(let i=0;i<fade;i++){
    const mix=(1-Math.cos(Math.PI*i/(fade-1)))/2;
    const index=output.length-fade+i;
    output[index]=output[index]*(1-mix)+input[i]*mix;
  }
  let energy=0,peak=0;
  for(let i=0;i<output.length;i++){
    output[i]-=mean;energy+=output[i]**2;peak=Math.max(peak,Math.abs(output[i]));
  }
  const gain=peak?Math.min(.22/Math.sqrt(energy/output.length),.9/peak):1;
  for(let i=0;i<output.length;i++)output[i]*=gain;
  return output;
}

class CustomSoundStore {
  constructor(database){this.database=database;this.connection=null;}
  open(){
    if(!this.database)return Promise.reject(Error('Sound recording storage is unavailable in this browser.'));
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const request=this.database.open('osm-custom-sounds-v1',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('notes'))db.createObjectStore('notes',{keyPath:'pitch'});
        if(!db.objectStoreNames.contains('profiles'))db.createObjectStore('profiles',{keyPath:'id'});
        if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();this.connection=null;};
        resolve(db);
      };
      request.onerror=()=>reject(request.error??Error('Could not open sound storage.'));
      request.onblocked=()=>reject(Error('Close other OSM tabs to open sound storage.'));
    }).catch(error=>{this.connection=null;throw error;});
    return this.connection;
  }
  async all(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('notes','readonly');
      const request=transaction.objectStore('notes').getAll();
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error??Error('Could not read recorded sounds.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not read recorded sounds.'));
    });
  }
  async put(recording){
    if(!Number.isInteger(recording.pitch)||recording.pitch<69||recording.pitch>89||
      !Number.isFinite(recording.rate)||recording.rate<8000||recording.rate>192000||
      !(recording.pcm instanceof Float32Array)||recording.pcm.length!==Math.round(recording.rate*3)||
      !recording.pcm.every(Number.isFinite)||!Number.isFinite(recording.cents))throw Error('Invalid sound recording.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','settings'],'readwrite');
      transaction.objectStore('notes').put(recording);
      const draft=transaction.objectStore('settings').get('draft');
      draft.onsuccess=()=>transaction.objectStore('settings').put({...draft.result,key:'draft',dirty:true});
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('The recording could not be saved.'));
      transaction.onerror=()=>reject(transaction.error??Error('The recording could not be saved.'));
    });
  }
  async state(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readonly');
      const notes=transaction.objectStore('notes').getAll();
      const profiles=transaction.objectStore('profiles').getAll();
      const draft=transaction.objectStore('settings').get('draft');
      transaction.oncomplete=()=>resolve({recordings:notes.result,profiles:profiles.result,draft:draft.result??{profileId:null,name:'',dirty:notes.result.length>0}});
      transaction.onabort=()=>reject(transaction.error??Error('Could not load custom sounds.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not load custom sounds.'));
    });
  }
  async saveProfile(name,id=null){
    name=name.trim();
    if(!name)throw Error('Give this custom sound a name.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readwrite');
      const request=transaction.objectStore('notes').getAll();
      let profile;
      request.onsuccess=()=>{
        profile={id:id??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
          name,recordings:request.result,updatedAt:new Date().toISOString()};
        transaction.objectStore('profiles').put(profile);
        transaction.objectStore('settings').put({key:'draft',profileId:profile.id,name,dirty:false});
      };
      transaction.oncomplete=()=>resolve(profile);
      transaction.onabort=()=>reject(transaction.error??Error('Could not save this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not save this custom sound.'));
    });
  }
  async loadProfile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readwrite');
      let profile,error;
      const request=transaction.objectStore('profiles').get(id);
      request.onsuccess=()=>{
        profile=request.result;
        if(!profile){error=Error('This saved custom sound is no longer available.');transaction.abort();return;}
        const notes=transaction.objectStore('notes');notes.clear();
        for(const recording of profile.recordings)notes.put(recording);
        transaction.objectStore('settings').put({key:'draft',profileId:id,name:profile.name,dirty:false});
      };
      transaction.oncomplete=()=>resolve(profile);
      transaction.onabort=()=>reject(error??transaction.error??Error('Could not load this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not load this custom sound.'));
    });
  }
  async newDraft(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','settings'],'readwrite');
      transaction.objectStore('notes').clear();
      transaction.objectStore('settings').put({key:'draft',profileId:null,name:'',dirty:false});
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('Could not create a custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not create a custom sound.'));
    });
  }
  async deleteProfile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['profiles','notes','settings'],'readwrite');
      transaction.objectStore('profiles').delete(id);
      const draft=transaction.objectStore('settings').get('draft');
      draft.onsuccess=()=>{
        if(draft.result?.profileId===id){
          transaction.objectStore('notes').clear();
          transaction.objectStore('settings').put({key:'draft',profileId:null,name:'',dirty:false});
        }
      };
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('Could not delete this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not delete this custom sound.'));
    });
  }

}
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
const previous=scorePlaybackIndex;
for(const glyph of scoreGroups.get(previous)??[])glyph.classList.remove('playing-note');
scorePlaybackIndex=index;
if(editorView==='staff'&&(previous<0||index<0))drawStaff();
for(const glyph of scoreGroups.get(index)??[])glyph.classList.add('playing-note');

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
}else if(tick%4===0||length>=4||(!tripletLeft&&!Number.isInteger(length))){line+=' ';}
}
}
if(line.trim())lines.push(line.trimEnd());
if(lines.length)lines[lines.length-1]=lines.at(-1).replace(/\|\s*$/,'').trimEnd()+' |]';
const offsets=[];let cursor=header.join('\n').length+1;
for(const row of lines){offsets.push(cursor);cursor+=row.length+1;}
return {abc:header.concat(lines).join('\n'),glyphIndexes,engravedEvents:new Map(tokens.map(t=>[offsets[t.line]+t.offset,t.index]))};
}
function drawStaff(){
// ABCJS measures the visible container. Rendering while it is hidden caches
// zero-height SVGs that stay blank when the same notation is shown again.
if(currentPage!=='editor'||editorView!=='staff')return;
const staff=find('staff');
if(!score.events.length){staff.replaceChildren();scoreGroups.clear();return;}
if(!window.ABCJS){loadNotation().then(drawStaff).catch(loadError);return;}
const showTake=scorePlaybackIndex<0&&timingPanel.open&&!find('score').hidden&&take.length;
const entries=scoreEntries();
if(showTake){
for(const entry of take){
if(entries[entry.index])entries[entry.index]=entry;
}
}
const {abc,glyphIndexes,engravedEvents}=engravedScore(entries,showTake?tempo():score.tempo);
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
highlightWorkspace();
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
const projectStorage=new ProjectStore({
getItem:key=>localStorage.getItem(key),
setItem:(key,value)=>localStorage.setItem(key,value),
removeItem:key=>localStorage.removeItem(key)
});
let projects=[], projectId=null, draftChanged=false, scoreActivity=[];
const maxScoreActivity=30;
function renderScoreActivity(){
const list=find('edit-history');
const tabDraft=readNativeTabDraft(projectId)??initialTabDraft;
const tabActivity=Array.isArray(tabDraft?.activity)?tabDraft.activity:[];
const entries=[...scoreActivity,...tabActivity]
  .filter(entry=>typeof entry?.label==='string'&&typeof entry.at==='string'&&Number.isFinite(Date.parse(entry.at)))
  .sort((a,b)=>b.at.localeCompare(a.at)).slice(0,maxScoreActivity);
find('edit-history-empty').hidden=entries.length>0;
list.replaceChildren(...entries.map(({at,label})=>{
const item=document.createElement('li'),date=document.createElement('time');
date.dateTime=at;date.textContent=new Date(at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
item.append(document.createTextNode(label),date);
return item;
}));
}
function addScoreActivity(label){
scoreActivity=[...scoreActivity,{label,at:new Date().toISOString()}].slice(-maxScoreActivity);
renderScoreActivity();
}
function report(message){projectStatus.textContent=message;}
function download(filename,contents){
if(window.webkit?.messageHandlers?.save){
window.webkit.messageHandlers.save.postMessage({filename,contents});return;
}
const url=URL.createObjectURL(new Blob([contents],{type:'text/plain'}));
const link=document.createElement('a');link.href=url;link.download=filename;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const ScoreModel={validate:validateProject};
const keySignatures={Cb:-7,Gb:-6,Db:-5,Ab:-4,Eb:-3,Bb:-2,F:-1,C:0,G:1,D:2,A:3,E:4,B:5,'F#':6,'C#':7};
function signatureAccidental(letter){
const count=keySignatures[score.key];
return (count<0?'BEADGCF':'FCGDAEB').slice(0,Math.abs(count)).includes(letter)?(count<0?'_':'^'):'=';
}
function snapshot(){
return {schemaVersion:1,appVersion:'0.2.0',id:projectId,title:projectName.value.trim()||'Untitled song',author:authorInput.value.trim(),notes:[...score.pitches],
lengths:[...score.lengths],tempo:score.tempo,tempoMap:score.tempoMap.map(mark=>({...mark})),meter:score.meter,key:score.key,intervals:Array.from(score.intervals,n=>n??null),
performance:score.events.map(({velocity,muted})=>({velocity,muted})),
activity:scoreActivity.slice(),
tabDraft:nativeTabProject===projectId?nativeTabDraft():readNativeTabDraft(projectId)??initialTabDraft};
}
function validProject(project){return ScoreModel.validate(project);}
function restoreSavedProjects(){
try{
const saved=projectStorage.read();
projects=saved.projects;projectId=saved.active;
if(saved.recovered)report('Recovered saved data. Open File → Recovery snapshots to review your work.');
else if(saved.issues.length)report(saved.issues[0]);
}catch(error){report('Saved scores could not be loaded. '+error.message);}
}
function persist(library=projects,active=projectId){
try{return projectStorage.save(library,active);}
catch(error){report('Save failed. '+error.message+' Download a project backup to keep your changes.');return false;}
}
const recentScoreMenu=find('recent-score-menu');
let recentScoreTarget;
function closeRecentScoreMenu(restoreFocus=false){
if(recentScoreMenu.hidden)return;
recentScoreMenu.hidden=true;
if(restoreFocus)recentScoreTarget?.focus({preventScroll:true});
recentScoreTarget=null;
}
function openRecentScoreMenu(button,project,x,y){
recentScoreTarget=button;
recentScoreMenu.hidden=false;
recentScoreMenu.style.left=Math.max(0,Math.min(x,window.innerWidth-recentScoreMenu.offsetWidth))+'px';
recentScoreMenu.style.top=Math.max(0,Math.min(y,window.innerHeight-recentScoreMenu.offsetHeight))+'px';
const remove=find('recent-score-delete');
remove.onclick=()=>{
closeRecentScoreMenu(true);
deleteSavedScore(project);
};
remove.focus({preventScroll:true});
}
document.addEventListener('pointerdown',event=>{
if(!recentScoreMenu.contains(event.target))closeRecentScoreMenu();
});
document.addEventListener('keydown',event=>{
if(event.key==='Escape'&&!recentScoreMenu.hidden){
event.preventDefault();
closeRecentScoreMenu(true);
}
});
function deleteSavedScore(project){
const active=project.id===projectId;
const message='Delete “'+project.title+'” from saved scores?'+(active&&draftChanged?' Unsaved changes will also be discarded.':'');
if(!window.confirm(message))return false;
const remaining=projects.filter(saved=>saved.id!==project.id);
if(!persist(remaining,active?null:projectId))return false;
projects=remaining;
try{projectStorage.removeCheckpoints(project.id);}catch{}
try{localStorage.removeItem(nativeTabKey(project.id));}catch{}
if(active)loadProject(emptyProject());
else refreshMenu();
if(currentPage==='editor')openPage('home');
const list=currentPage==='library'?projectMenu:find('recent-scores');
(list.querySelector('button')??find(currentPage==='library'?'home':'new')).focus({preventScroll:true});
report('Deleted '+project.title+'.');
}
function refreshMenu(){
closeRecentScoreMenu();
const recent=find('recent-scores');
projectMenu.replaceChildren();
recent.replaceChildren();
const ordered=[...projects].reverse();
if(!ordered.length){
projectMenu.textContent='No saved scores yet.';
recent.textContent='No saved scores yet.';
}
function scoreRow(project,isRecent=false){
const row=document.createElement('div');row.className='osm-library-row';
const button=document.createElement('button');
button.type='button';button.className='ctrl osm-score-row';
const title=document.createElement('strong');title.textContent=project.title;
const detail=document.createElement('small');
detail.textContent=[project.author,project.notes.length+' notes'].filter(Boolean).join(' · ');
button.append(title,detail);
button.addEventListener('click',()=>{
if(project.id===projectId){openPage('editor');return;}
if(!canReplace())return;
loadProject(project);persist();openPage('editor');
});
if(isRecent){
button.setAttribute('aria-haspopup','menu');
button.addEventListener('contextmenu',event=>{
event.preventDefault();
const bounds=button.getBoundingClientRect();
openRecentScoreMenu(button,project,event.clientX||bounds.left,event.clientY||bounds.bottom);
});
button.addEventListener('keydown',event=>{
if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
event.preventDefault();
const bounds=button.getBoundingClientRect();
openRecentScoreMenu(button,project,bounds.left,bounds.bottom);
});
return button;
}
const remove=document.createElement('button');
remove.type='button';remove.className='ctrl osm-delete-score';remove.textContent='Delete';
remove.setAttribute('aria-label','Delete '+project.title);
remove.onclick=()=>deleteSavedScore(project);
row.append(button,remove);
return row;
}
projectMenu.append(...ordered.map(project=>scoreRow(project)));
recent.append(...ordered.slice(0,6).map(project=>scoreRow(project,true)));
}
let currentPage='home';
function openPage(page){
if(currentPage==='practice'&&page!==currentPage){stopStep();find('practice-metronome').checked=false;stopPracticeClick();}
if(currentPage!==page){flushRecoverySnapshot();closeRecentScoreMenu();if(currentPage==='editor')rollWindow.close();if(currentPage==='practice-setup')leaveRecognition();pdfRequest++;report('');stopMic('Microphone stopped.');closeNoteMenu();}
if(currentPage!==page&&(currentPage==='editor'||currentPage==='palette'))stopSound();
for(const id of ['home','library','import','palette','editor','help','tuner','practice','practice-setup'])find('page-'+id).hidden=id!==page;
find('home-nav').hidden=['home','practice-setup','palette','tuner','help'].includes(page);
currentPage=page;
if(page==='editor')updateWorkspace();
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
updatePlaybackAvailability();
updatePlayButton(false);
info.textContent=score.events.length+' notes · '+score.tempo+' BPM'+(score.intervals.some(n=>n!=null)?' · Recorded timing':'');
bar.style.width='0%';
if(currentPage==='editor')updateWorkspace();
}
function loadProject(p){
flushRecoverySnapshot();
p=migrateProject(p);
finishRecording();stopSound();
if(micSession?.mode==='convert')stopMic();
capturedSound=[];soundNote=null;find('convert-use').disabled=true;
find('convert-preview').textContent='';soundStatus.textContent='Start the microphone when you’re ready.';
find('convert-open').open=false;
projectId=p.id;projectName.value=p.title;authorInput.value=p.author??'';
scoreActivity=(Array.isArray(p.activity)?p.activity:[])
  .filter(entry=>typeof entry?.label==='string'&&typeof entry.at==='string'&&Number.isFinite(Date.parse(entry.at)))
  .slice(-maxScoreActivity);
score.load(p);find("meter").value=score.meter;find("score-key").value=score.key;
bpmInput.value=score.tempo;take=[];find('score').hidden=true;
recordStatus.textContent='Select a starting note, then record and tap Enter in rhythm.';
draftChanged=false;refreshMenu();
initialTabDraft=p.tabDraft??(typeof p.tabs?.layout==='string'?{text:p.tabs.layout,title:p.tabs.title,credit:p.tabs.author}:null);
nativeTabProject=null;
renderScoreActivity();
refreshSong();
historyPast.length=0;historyFuture.length=0;lastScore=captureEdit();updateHistoryButtons();drawTimeline();find('editor-tempo').value=score.tempo;
}
function canReplace(){return !draftChanged||window.confirm('Discard unsaved song changes?');}
find('save').addEventListener('click',()=>{
const project=migrateProject(snapshot());
project.activity=[...project.activity,{label:'Saved score',at:new Date().toISOString()}].slice(-maxScoreActivity);
const next=projects.filter(saved=>saved.id!==projectId).concat(project);
if(!persist(next))return;
projects=next;scoreActivity=project.activity;renderScoreActivity();
projectName.value=project.title;refreshMenu();updateWorkspace();
draftChanged=false;flushRecoverySnapshot('Saved score');report('Saved '+project.title+'.');
});
const renameDialog=find('rename-score');
let previousTitle,previousAuthor;
function openRenameScore(){
previousTitle=projectName.value;previousAuthor=authorInput.value;
renameDialog.returnValue='';
renameDialog.showModal();
}
renameDialog.addEventListener('close',()=>{
if(renameDialog.returnValue!=='rename'){
projectName.value=previousTitle;authorInput.value=previousAuthor;
return;
}
projectName.value=projectName.value.trim()||'Untitled song';
authorInput.value=authorInput.value.trim();
if(projectName.value===previousTitle&&authorInput.value===previousAuthor)return;
draftChanged=true;
addScoreActivity('Updated title or author');scheduleRecoverySnapshot();
updateWorkspace();
if(!find('score').hidden&&!recording)updateNotation();
});
function newId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
function emptyProject(){
return {id:newId(),title:'Untitled song',author:'',notes:[],lengths:[],tempo:130,intervals:[]};
}
find('new').addEventListener('click',()=>{
if(!canReplace())return;
loadProject(emptyProject());
openPage('editor');
});
find('backup').addEventListener('click',()=>download('ocarina-project.json',JSON.stringify(snapshot(),null,2)));
find('restore').addEventListener('change',async e=>{
const file=e.target.files[0];e.target.value='';
if(!file)return;
try{
await assertImportFile(file,'project');
const project=migrateProject(JSON.parse(await file.text()));
if(!validProject(project))throw Error('This file is not an Ocarina Song Mapper project.');
if(canReplace()){const restored={...project,id:newId()};loadProject(restored);if(typeof restored.tabDraft?.text==='string'){try{localStorage.setItem(nativeTabKey(restored.id),JSON.stringify(restored.tabDraft));}catch{}}draftChanged=true;openPage('editor');report('Project imported. Click Save project to keep it in the menu.');}
}catch(error){report(error.message);}
});
function syncEdit(){
const hasNote=score.events.length>0;
find('pitch-shifts').hidden=![...selectedNotes].some(i=>score.events[i]?.pitch!=null);
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
function previewPitch(m,key=null){
playStep(-1,key,m);
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
draftChanged=true;refreshSong(index);rememberEdit();scheduleRecoverySnapshot();
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

const ImportLimits=Object.freeze({
  project:20*1024*1024,tabs:20*1024*1024,image:20*1024*1024,
  midi:10*1024*1024,musicxml:1024*1024,audio:50*1024*1024,
  text:1024*1024,pixels:12000000,pdfPages:30
});
function assertImportText(text,label='Notation'){
  if(typeof text!=='string'||text.length>ImportLimits.text||new TextEncoder().encode(text).byteLength>ImportLimits.text){
    throw Error(label+' is too large. Import up to 1 MiB of text at a time.');
  }
}
async function assertImportFile(file,kind){
  const maximum=ImportLimits[kind];
  if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Choose a file containing data.');
  if(!maximum||file.size>maximum){
    throw Error('This file is too large. Import up to '+Math.round(maximum/1024/1024)+' MiB at a time.');
  }
  const header=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const ascii=String.fromCharCode(...header);
  if(kind==='midi'&&!ascii.startsWith('MThd'))throw Error('Choose a valid Standard MIDI file.');
  if(kind==='project'&&!/\.json$/i.test(file.name))throw Error('Choose an OSM JSON project backup.');
  if(kind==='musicxml'&&!/\.(xml|musicxml)$/i.test(file.name))throw Error('Choose an uncompressed XML or MusicXML file.');
  if(kind==='audio'){
    const wav=ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE';
    const mp3=ascii.startsWith('ID3')||(header[0]===255&&(header[1]&224)===224);
    if(!wav&&!mp3)throw Error('Choose a valid WAV or MP3 recording.');
  }
  return header;
}
function assertImageDimensions(width,height){
  if(!(width>0&&height>0)||!Number.isFinite(width*height)||width*height>ImportLimits.pixels){
    throw Error('Use an image up to 12 megapixels. Crop it to the tab area or resize it and try again.');
  }
}
async function assertImportImage(file,allowWebP=false){
  await assertImportFile(file,'image');
  const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer());
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=String.fromCharCode(...bytes.subarray(0,16));
  if(bytes.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10'){
    if(bytes.length<24)throw Error('This PNG is incomplete.');
    assertImageDimensions(view.getUint32(16),view.getUint32(20));return;
  }
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
    let offset=2;
    while(offset+4<=bytes.length&&bytes[offset]===255){
      const marker=bytes[offset+1];
      if(marker===217||marker===218)break;
      if(marker===255){offset++;continue;}
      const length=view.getUint16(offset+2);
      if(length<2)throw Error('This JPEG has an invalid segment.');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(offset+9>bytes.length)throw Error('This JPEG is incomplete.');
        assertImageDimensions(view.getUint16(offset+7),view.getUint16(offset+5));return;
      }
      offset+=length+2;
    }
    return;
  }
  if(allowWebP&&ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'){
    if(ascii.slice(12,16)==='VP8X'&&bytes.length>=30){
      const dimension=index=>1+bytes[index]+bytes[index+1]*256+bytes[index+2]*65536;
      assertImageDimensions(dimension(24),dimension(27));
    }
    return;
  }
  throw Error(allowWebP?'Choose a valid PNG, JPEG, or WebP image.':'Choose a valid PNG or JPG image.');
}

function parseABC(abc){
assertImportText(abc,'ABC notation');
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
assertImportText(input);
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
if(editorView!=='staff')switchEditorView('staff');
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
if(scroll){timingPanel.open=true;switchEditorView('staff');}
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
openNativeTabEditor();
const button=find('pdf');
const title=projectName.value.trim()||'Untitled song';
const credit=authorInput.value.trim();
const entries=scoreEntries(),bpm=score.tempo;
button.disabled=true;
try{
await loadPDFExport();
const pages=await staffPaper(title,credit,entries,bpm);
const filename=title.replace(/[\\/:*?"<>|]/g,'-').trim()||'ocarina-score';
await saveScorePaper(pages,{title,author:credit},filename);
report('PDF exported.');
}catch(error){report('Could not export the music score: '+error.message);}
finally{button.disabled=false;}
});


const svgNS='http://www.w3.org/2000/svg';
function scoreEntries(){
return score.pitches.map((m,index)=>({index,pitch:pitchText(m),beats:score.events[index].ticks/4}));
}
function defaultTabLayout(sequence){
return (sequence.match(/.{1,5}/g)||[]).join('\n');
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

const tabHighlight=find('tab-highlight');
const tabPlayback=tabHighlight.parentElement;
const nativeTabText=find('native-tab-text');
const nativeTabTitle=find('native-tab-title');
const nativeTabCredit=find('native-tab-credit');
const nativeTabSize=find('native-tab-size');
const nativeTabStatus=find('native-tab-status');
let nativeTabProject=null,initialTabDraft=null,nativeTabActivity=[],lastTabEdit=null,nativeTabRaw=null;
let tabPlaybackCells=[],tabPlaybackCell=null,tabStepIndex=-1;

function nativeTabKey(id){return 'osm-tab-draft-v1:'+id;}
function readNativeTabDraft(id){
try{
const value=JSON.parse(localStorage.getItem(nativeTabKey(id)));
if(typeof value?.text==='string')return value;
}catch{}
return null;
}
function nativeTabDraft(){
return {text:nativeTabText.value,title:nativeTabTitle.value,credit:nativeTabCredit.value,size:nativeTabSize.value,paperLayouts,activity:nativeTabActivity};
}
function saveNativeTabDraft(label){
if(nativeTabProject===null)return;
const now=Date.now();
if(label&&(!lastTabEdit||lastTabEdit.label!==label||now-lastTabEdit.time>15000)){
nativeTabActivity=[...nativeTabActivity,{label,at:new Date(now).toISOString()}].slice(-maxScoreActivity);
}
if(label)lastTabEdit={label,time:now};
initialTabDraft=nativeTabDraft();
let saved=true;
try{
const key=nativeTabKey(nativeTabProject),raw=JSON.stringify(initialTabDraft);
if(localStorage.getItem(key)!==nativeTabRaw)throw Error('Another OSM tab changed this tab draft. Download a project backup, then reload.');
localStorage.setItem(key,raw);
if(localStorage.getItem(key)!==raw)throw Error('The tab draft could not be verified.');
nativeTabRaw=raw;
nativeTabStatus.textContent=projects.some(project=>project.id===nativeTabProject)
  ?'Tab draft saved in this browser.'
  :'Save the score to reopen this draft from Recent scores.';
}catch(error){saved=false;nativeTabStatus.textContent=error.message+' Download a project backup to keep these changes.';}
renderScoreActivity();
updatePlaybackAvailability();
scheduleRecoverySnapshot();
return saved;
}
function updateNativeTabStyle(){
nativeTabText.parentElement.style.setProperty('--native-tab-size',nativeTabSize.value+'px');
}
function openNativeTabEditor(){
if(nativeTabProject===projectId){
if(!initialTabDraft&&!nativeTabText.readOnly)nativeTabText.value=defaultTabLayout(score.pitches.map(fingeringCode).join(''));
return;
}
nativeTabProject=projectId;
try{nativeTabRaw=localStorage.getItem(nativeTabKey(projectId));}catch{nativeTabRaw=null;}
tabStepIndex=-1;
const draft=readNativeTabDraft(projectId)??initialTabDraft;
loadPaperLayouts(draft?.paperLayouts);
const sequence=score.pitches.map(fingeringCode).join('');
nativeTabText.value=draft?.text??defaultTabLayout(sequence);
nativeTabTitle.value=draft?.title||projectName.value.trim()||'Untitled song';
nativeTabCredit.value=draft?.credit??authorInput.value.trim();
const size=String(paperNumber(draft?.size,52,12,160));
nativeTabSize.querySelector('[data-custom]')?.remove();
if(![...nativeTabSize.options].some(option=>option.value===size)){
const custom=new Option(size+' pt',size);custom.dataset.custom='';nativeTabSize.add(custom);
}
nativeTabSize.value=size;
nativeTabActivity=Array.isArray(draft?.activity)?draft.activity:[];
lastTabEdit=null;
updateNativeTabStyle();
nativeTabStatus.textContent='';
}
const nativeTabPitch=code=>code==='r'?null:code.charCodeAt(0)-65+69;
function nativeTabNotes(){
return (nativeTabText.value.match(/[A-Ur]/g)??[]).map(nativeTabPitch);
}
function tabNotesMatchScore(notes){
return notes.length===score.events.length&&notes.every((pitch,i)=>pitch===score.events[i].pitch);
}
function prepareTabPlayback(){
tabHighlight.replaceChildren();
tabPlaybackCells=[];
for(const code of nativeTabText.value){
if(/[A-Ur]/.test(code)){
const cell=document.createElement('span');
cell.textContent=code;tabPlaybackCells.push(cell);tabHighlight.append(cell);
}else tabHighlight.append(document.createTextNode(code));
}
tabPlayback.hidden=false;
nativeTabText.readOnly=true;
syncTabPlaybackScroll();
}
function syncTabPlaybackScroll(){
tabHighlight.style.transform='translate('+(-nativeTabText.scrollLeft)+'px,'+(-nativeTabText.scrollTop)+'px)';
}
function highlightTabPlayback(index){
tabPlaybackCell?.classList.remove('is-playing');
tabPlaybackCell=tabPlaybackCells[index]??null;
tabPlaybackCell?.classList.add('is-playing');
if(tabPlaybackCell&&editorView==='tabs'){
const cell=tabPlaybackCell.getBoundingClientRect(),editor=nativeTabText.getBoundingClientRect();
if(cell.bottom>editor.bottom-8)nativeTabText.scrollTop+=cell.bottom-editor.bottom+8;
if(cell.top<editor.top+8)nativeTabText.scrollTop-=editor.top+8-cell.top;
if(cell.right>editor.right-20)nativeTabText.scrollLeft+=cell.right-editor.right+20;
if(cell.left<editor.left+8)nativeTabText.scrollLeft-=editor.left+8-cell.left;
syncTabPlaybackScroll();
}
}
function clearTabPlayback(){
if(heldStepKey&&editorView==='tabs')stopStep();
highlightTabPlayback(-1);
tabPlaybackCells=[];
tabPlayback.hidden=true;
nativeTabText.readOnly=false;
}
nativeTabText.addEventListener('scroll',syncTabPlaybackScroll);
for(const [field,label] of [[nativeTabText,'Edited tab fingerings or layout'],[nativeTabTitle,'Edited tab title'],[nativeTabCredit,'Edited tab author']]){
field.addEventListener('input',()=>{
  if(field===nativeTabText)tabStepIndex=-1;
  saveNativeTabDraft(label);
});
}
nativeTabSize.onchange=()=>{paperLayouts.tabs.tabSize=null;updateNativeTabStyle();saveNativeTabDraft('Changed tab diagram size');};
find('native-tab-save-score').onclick=()=>find('save').click();
for(const [label,code] of [
...Array.from({length:21},(_,i)=>[name(i+69),fingeringCode(i+69)]),
['Rest','r'],['Space',' '],['Bar line','|'],['New line','\n']
]){
const button=document.createElement('button');
button.type='button';button.className='ctrl';button.textContent=label;
button.addEventListener('pointerdown',event=>event.preventDefault());
button.onclick=()=>{
if(melody)return;
if(nativeTabText.readOnly)clearTabPlayback();
nativeTabText.focus();
// Use the browser’s text editing operation so insertions join Undo history.
if(!document.execCommand('insertText',false,code)){
nativeTabText.setRangeText(code,nativeTabText.selectionStart,nativeTabText.selectionEnd,'end');
tabStepIndex=-1;
saveNativeTabDraft('Edited tab fingerings or layout');
}
};
find('native-tab-keys').append(button);
}

function nativeTabFilename(){
return (nativeTabTitle.value.trim()||'Ocarina tabs').replace(/[\\/:*?"<>|]/g,'-');
}
find('native-tab-text-export').onclick=()=>download(nativeTabFilename()+'.txt',nativeTabText.value);

function nativeTabRows(text,columns=Infinity){
return text.split('\n').flatMap(line=>{
const cells=Array.from(line.replace(/\t/g,'    '));
if(!cells.length)return [[]];
const rows=[];
for(let start=0;start<cells.length;start+=columns)rows.push(cells.slice(start,start+columns));
return rows;
});
}
function nativeTabArtwork({columns=Infinity,rows,heading=true,indexed=true}={}){
const draft=nativeTabDraft();
rows??=nativeTabRows(draft.text,columns);
const size=Number(draft.size),margin=heading?20:0,top=heading?72:0;
const width=Math.max(heading?360:1,margin*2+size*rows.reduce((max,row)=>Math.max(max,row.length),0));
const height=top+rows.length*(size+8)+(heading?28:0);
if(width>8000||height>16000)throw Error('Shorten the tab rows or split the draft into smaller sheets.');
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('xmlns',svgNS);svg.setAttribute('width',width);svg.setAttribute('height',height);
rhythmShape(svg,'rect',{width,height,fill:'white'});
function label(value,x,y,fontSize){
rhythmShape(svg,'text',{x,y,'font-size':fontSize,'font-family':'sans-serif',fill:'#172126'});
svg.lastChild.textContent=value;
}
if(heading){label(draft.title,margin,34,22);label(draft.credit,margin,55,13);}
let index=0;
rows.forEach((row,line)=>row.forEach((symbol,column)=>{
const x=margin+column*size,y=top+line*(size+8);
if(/[A-Ur]/.test(symbol)){
if(indexed){
rhythmShape(svg,'rect',{x,y,width:size,height:size,fill:'none','data-tab-index':index});
}
index++;
if(symbol==='r'){label('Rest',x+4,y+size*.66,Math.min(size*.42,18));return;}
const glyph=makeFinger(nativeTabPitch(symbol));
glyph.setAttribute('x',x);glyph.setAttribute('y',y);
glyph.setAttribute('width',size-4);glyph.setAttribute('height',size);
svg.append(glyph);
}else if(symbol.trim())label(symbol,x+4,y+size*.66,Math.min(size*.42,18));
}));
return {svg,width,height};
}
function saveNativeArtwork(blob,extension){
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download=nativeTabFilename()+'.'+extension;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}
find('native-tab-svg').onclick=()=>{
try{saveNativeArtwork(new Blob([new XMLSerializer().serializeToString(nativeTabArtwork().svg)],{type:'image/svg+xml'}),'svg');}
catch(error){nativeTabStatus.textContent=error.message;}
};
find('native-tab-pdf').onclick=async()=>{
const button=find('native-tab-pdf');button.disabled=true;
try{
const draft=nativeTabDraft();
const filename=nativeTabFilename();
await loadPDFExport();
const pages=await tabPaper(draft);
await saveScorePaper(pages, {title:draft.title,author:draft.credit,
  keywords:'osm-tab-draft-v1:'+encodeURIComponent(draft.text)},filename);
}catch(error){nativeTabStatus.textContent=error.message;}
finally{button.disabled=false;}
};

function stepNativeTab(direction,key){
const notes=nativeTabNotes();
if(!notes.length)return;
if(melody)stopMelody();
if(tabPlayback.hidden)prepareTabPlayback();
tabStepIndex=Math.max(0,Math.min(notes.length-1,tabStepIndex+direction));
highlightTabPlayback(tabStepIndex);
previewPitch(notes[tabStepIndex],key);
}
nativeTabText.addEventListener('pointerdown',()=>{
if(!melody&&nativeTabText.readOnly)clearTabPlayback();
});

const paperFonts=['Helvetica, Arial, sans-serif','Times New Roman, serif','Georgia, serif','Palatino, serif','Courier New, monospace'];
function defaultPaperLayout(){
return {format:'a4',orientation:'portrait',margin:32,lineSpacing:1.15,tabSize:null,extraPages:0,
title:{font:paperFonts[0],size:22,align:'left',bold:false,italic:false,color:'#000000',dx:0,dy:0},
credit:{font:paperFonts[0],size:12,align:'left',bold:false,italic:false,color:'#000000',dx:0,dy:0},
objects:[]};
}
function paperNumber(value,fallback,min,max){
return Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
}
function cleanPaperLayout(value){
const layout=defaultPaperLayout();
if(!value||typeof value!=='object')return layout;
layout.format=['a4','letter','a3'].includes(value.format)?value.format:'a4';
layout.orientation=value.orientation==='landscape'?'landscape':'portrait';
layout.margin=paperNumber(value.margin,32,12,120);
layout.lineSpacing=paperNumber(value.lineSpacing,1.15,1,3);
layout.tabSize=value.tabSize==null?null:paperNumber(value.tabSize,52,12,160);
layout.extraPages=Math.round(paperNumber(value.extraPages,0,0,50));
for(const key of ['title','credit']){
const style=value[key]??{};
Object.assign(layout[key],{
font:paperFonts.includes(style.font)?style.font:paperFonts[0],size:paperNumber(style.size,key==='title'?22:12,6,120),
align:['left','center','right'].includes(style.align)?style.align:'left',bold:style.bold===true,italic:style.italic===true,
color:/^#[\da-f]{6}$/i.test(style.color)?style.color:'#000000',dx:paperNumber(style.dx,0,-600,600),dy:paperNumber(style.dy,0,-800,800)});
}
layout.objects=(Array.isArray(value.objects)?value.objects:[]).filter(object=>object&&['text','image'].includes(object.type)).map(object=>({
id:typeof object.id==='string'?object.id:newId(),type:object.type,
text:typeof object.text==='string'?object.text:'',
src:typeof object.src==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(object.src)?object.src:'',
x:paperNumber(object.x,48,0,1190),y:paperNumber(object.y,100,0,1190),
width:paperNumber(object.width,200,12,1190),height:paperNumber(object.height,80,12,1190),
page:Math.round(paperNumber(object.page,1,1,1000)),repeat:object.repeat===true,
opacity:paperNumber(object.opacity,1,0,1),rotation:paperNumber(object.rotation,0,-180,180),
font:paperFonts.includes(object.font)?object.font:paperFonts[0],size:paperNumber(object.size,16,6,120),
align:['left','center','right'].includes(object.align)?object.align:'left',bold:object.bold===true,italic:object.italic===true,
color:/^#[\da-f]{6}$/i.test(object.color)?object.color:'#000000',
layer:object.layer==='background'?'background':'foreground',locked:object.locked===true
})).filter(object=>object.type!=='image'||object.src);
return layout;
}
let paperLayouts={tabs:defaultPaperLayout(),staff:defaultPaperLayout()};
function loadPaperLayouts(saved){
paperLayouts={tabs:cleanPaperLayout(saved?.tabs),staff:cleanPaperLayout(saved?.staff)};
}
function paperGeometry(layout){
let [width,height]=({a4:[595.28,841.89],letter:[612,792],a3:[841.89,1190.55]})[layout.format];
if(layout.orientation==='landscape')[width,height]=[height,width];
return {width,height,margin:layout.margin,contentWidth:width-2*layout.margin,contentHeight:height-2*layout.margin};
}
function paperFont(style){
return (style.italic?'italic ':'')+(style.bold?'bold ':'')+style.size+'px '+style.font;
}
const paperImages=new Map();
function paperImage(src){
if(!paperImages.has(src))paperImages.set(src,new Promise((resolve,reject)=>{
const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('An image in this layout could not be opened.'));
image.src=src;
}));
return paperImages.get(src);
}
function wrappedPaperText(text,width,style){
paperMeasure.font=paperFont(style);
const lines=[];
for(const paragraph of text.split('\n')){
let line='';
for(const word of paragraph.split(/\s+/)){
if(line&&paperMeasure.measureText(line+' '+word).width>width){lines.push(line);line='';}
if(paperMeasure.measureText(word).width<=width){line+=(line?' ':'')+word;continue;}
for(const letter of word){
if(line&&paperMeasure.measureText(line+letter).width>width){lines.push(line);line='';}
line+=letter;
}
}
lines.push(line);
}
return lines;
}
function drawPaperText(context,text,width,height,style){
context.font=paperFont(style);context.fillStyle=style.color;context.textAlign=style.align;
const x=style.align==='right'?width:style.align==='center'?width/2:0;
for(const [index,line] of wrappedPaperText(text,width,style).entries()){
const y=style.size+index*style.size*1.25;
if(y>height)break;
context.fillText(line,x,y);
}
}
function paperObjectsForPage(layout,page,layer){
return layout.objects.filter(object=>(object.repeat||object.page===page+1)&&object.layer===layer);
}
async function paintPaperObject(object,resolution){
const image=object.type==='image'?await paperImage(object.src):null;
const canvas=document.createElement('canvas');
canvas.width=Math.ceil(object.width*resolution);canvas.height=Math.ceil(object.height*resolution);
const context=canvas.getContext('2d');
context.scale(canvas.width/object.width,canvas.height/object.height);
if(image)context.drawImage(image,0,0,object.width,object.height);
else drawPaperText(context,object.text,object.width,object.height,object);
return canvas;
}
async function paintPaperObjects(layout,paper,page,layer,resolution){
const objects=paperObjectsForPage(layout,page,layer);
if(!objects.length)return null;
const images=await Promise.all(objects.map(object=>object.type==='image'?paperImage(object.src):null));
const canvas=document.createElement('canvas');
canvas.width=Math.ceil(paper.width*resolution);canvas.height=Math.ceil(paper.height*resolution);
const context=canvas.getContext('2d');
context.scale(canvas.width/paper.width,canvas.height/paper.height);
objects.forEach((object,index)=>{
context.save();context.globalAlpha=object.opacity;
context.translate(object.x+object.width/2,object.y+object.height/2);context.rotate(object.rotation*Math.PI/180);
context.translate(-object.width/2,-object.height/2);
context.beginPath();context.rect(0,0,object.width,object.height);context.clip();
if(images[index])context.drawImage(images[index],0,0,object.width,object.height);
else drawPaperText(context,object.text,object.width,object.height,object);
context.restore();
});
return canvas;
}

const paperMeasure=document.createElement('canvas').getContext('2d');

function paperHeading(text,key,style,paper){
if(!text.trim())return [];
const lines=wrappedPaperText(text,paper.contentWidth,style);
return lines.map((line,i)=>{
const height=style.size*1.25+(i===lines.length-1?8:0);
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('width',paper.contentWidth);svg.setAttribute('height',height);
const x=style.align==='center'?paper.contentWidth/2:style.align==='right'?paper.contentWidth:0;
rhythmShape(svg,'text',{x,y:style.size,'font-size':style.size,'font-family':style.font,
'font-weight':style.bold?'bold':'normal','font-style':style.italic?'italic':'normal',
'text-anchor':style.align==='center'?'middle':style.align==='right'?'end':'start',fill:style.color});
svg.lastChild.textContent=line;
return {svg,width:paper.contentWidth,height,heading:key,style,text:line,dx:style.dx,dy:style.dy};
});
}

function paginateScorePaper(blocks,layout){
const paper=paperGeometry(layout),pages=[[]];
let y=paper.margin;
for(const block of blocks){
if(y>paper.margin&&y+block.height>paper.height-paper.margin+.001){pages.push([]);y=paper.margin;}
pages.at(-1).push({...block,y});
y+=block.height;
}
const lastObjectPage=layout.objects.reduce((max,object)=>Math.max(max,object.repeat?1:object.page),1);
const count=Math.max(pages.length+layout.extraPages,lastObjectPage);
while(pages.length<count)pages.push([]);
pages.paper=paper;pages.layout=layout;
return pages;
}

async function staffPaper(title,credit,entries,bpm,layout=structuredClone(paperLayouts.staff)){
await loadNotation();
const paper=paperGeometry(layout),staging=document.createElement('div');
staging.setAttribute('aria-hidden','true');
staging.style.cssText='position:fixed;top:0;left:-10000px;width:760px;pointer-events:none';
document.body.append(staging);
try{
const {abc,glyphIndexes}=engravedScore(entries,bpm);
window.ABCJS.renderAbc(staging,abc,{add_classes:true,staffwidth:720,oneSvgPerLine:true});
const systems=[...staging.querySelectorAll('svg')].filter(svg=>svg.querySelector('path'));
if(!systems.length)throw Error('No notation was rendered.');
let glyphIndex=0;
const blocks=systems.map(svg=>{
const view=svg.viewBox.baseVal;
const width=view.width||parseFloat(svg.getAttribute('width'));
const height=view.height||parseFloat(svg.getAttribute('height'));
if(!(width>0&&height>0))throw Error('A staff line has no printable dimensions.');
const scale=Math.min(paper.contentWidth/width,paper.contentHeight/height);
const printedWidth=width*scale,printedHeight=height*scale;
if(!view.width||!view.height)svg.setAttribute('viewBox','0 0 '+width+' '+height);
svg.setAttribute('width',printedWidth);svg.setAttribute('height',printedHeight);
const notes=[...svg.querySelectorAll('.abcjs-note,.abcjs-rest')].map(node=>[glyphIndexes[glyphIndex++],node]);
return {svg,width:printedWidth,svgHeight:printedHeight,height:Math.min(paper.contentHeight,printedHeight+6),notes};
});
return paginateScorePaper([...paperHeading(title,'title',layout.title,paper),...paperHeading(credit,'credit',layout.credit,paper),...blocks],layout);
}finally{staging.remove();}
}

async function tabPaper(draft){
const layout=cleanPaperLayout(draft.paperLayouts?.tabs??paperLayouts.tabs),paper=paperGeometry(layout);
const size=layout.tabSize??Number(draft.size),rowHeight=size*layout.lineSpacing,font=size+'px OcarinaFingering, monospace';
await document.fonts.load(font,'A');
paperMeasure.font=font;
const metrics=paperMeasure.measureText('A'),tabWidth=paperMeasure.measureText(' ').width*4;
const baseline=(rowHeight+metrics.fontBoundingBoxAscent-metrics.fontBoundingBoxDescent)/2;
let noteIndex=0,widest=0;
const rows=draft.text.split('\n').map(line=>{
let width=0;
const notes=[];
const segments=line.split('\t').map((text,i)=>{
if(i)width=(Math.floor(width/tabWidth)+1)*tabWidth;
const x=width;
for(const note of text.matchAll(/[A-Ur]/g)){
const start=paperMeasure.measureText(text.slice(0,note.index)).width;
notes.push({index:noteIndex++,x:x+start});
}
width+=paperMeasure.measureText(text).width;
return {text,x};
});
widest=Math.max(widest,width);
return {segments,notes};
});
// Preserve manually arranged rows when fitting them to the chosen paper.
const scale=Math.min(1,paper.contentWidth/Math.max(1,widest),paper.contentHeight/rowHeight);
const blocks=rows.map(({segments,notes})=>({
segments,font,scale,baseline,height:rowHeight*scale,noteWidth:size*scale,
notes:notes.map(note=>({...note,x:note.x*scale}))
}));
return paginateScorePaper([...paperHeading(draft.title,'title',layout.title,paper),...paperHeading(draft.credit,'credit',layout.credit,paper),...blocks],layout);
}

function paintTabPage(blocks,resolution,paper){
const rows=blocks.filter(block=>block.segments);
if(!rows.length)return null;
const top=rows[0].y-4,height=rows.at(-1).y+rows.at(-1).height-top+4;
const canvas=document.createElement('canvas');
canvas.width=Math.ceil(paper.contentWidth*resolution);canvas.height=Math.ceil(height*resolution);
const context=canvas.getContext('2d');
context.scale(canvas.width/paper.contentWidth,canvas.height/height);
context.fillStyle='#000';
for(const row of rows){
context.save();
context.translate(0,row.y-top);context.scale(row.scale,row.scale);context.font=row.font;
for(const {text,x} of row.segments)context.fillText(text,x,row.baseline);
context.restore();
}
return {canvas,top,height};
}

function paintPaperHeading(block,resolution){
const canvas=document.createElement('canvas');
canvas.width=Math.ceil(block.width*resolution);canvas.height=Math.ceil(block.height*resolution);
const context=canvas.getContext('2d');context.scale(canvas.width/block.width,canvas.height/block.height);
drawPaperText(context,block.text,block.width,block.height,block.style);
return canvas;
}

async function saveScorePaper(pages,properties,filename){
const paper=pages.paper,layout=pages.layout;
const pdf=new window.jspdf.jsPDF({unit:'pt',format:[paper.width,paper.height],
orientation:paper.width>paper.height?'landscape':'portrait',compress:true});
pdf.setProperties(properties);
for(const [index,blocks] of pages.entries()){
if(index)pdf.addPage();
const background=await paintPaperObjects(layout,paper,index,'background',3);
if(background)pdf.addImage(background,'PNG',0,0,paper.width,paper.height);
for(const block of blocks){
const {svg,width,height,svgHeight,y}=block;
if(block.heading){
pdf.addImage(paintPaperHeading(block,3),'PNG',paper.margin+block.dx,y+block.dy,width,height);
}else if(svg)await pdf.svg(svg,{x:paper.margin,y,width,height:svgHeight??height});
}
const tabs=paintTabPage(blocks,4,paper);
if(tabs)pdf.addImage(tabs.canvas,'PNG',paper.margin,tabs.top,paper.contentWidth,tabs.height);
const foreground=await paintPaperObjects(layout,paper,index,'foreground',3);
if(foreground)pdf.addImage(foreground,'PNG',0,0,paper.width,paper.height);
}
pdf.save(filename+'.pdf');
}

const scorePreview=find('score-preview');
const previewKind=find('preview-kind');
const previewPaper=find('preview-paper');
const previewScroll=find('preview-scroll');
let previewNotes=[],previewActive=[],previewRequest=0,previewPages=null,previewSaveWarning='';

function fitScorePreview(){
if(!scorePreview.open||!previewPages)return;
const zoom=find('preview-zoom').value,paper=previewPages.paper;
const fitted=Math.min(1.25,(previewScroll.clientWidth-24)/paper.width,(previewScroll.clientHeight-24)/paper.height);
previewPaper.style.zoom=String(zoom==='fit'?Math.max(.1,fitted):Number(zoom));
}

async function drawPreviewPage(blocks,index,pages,noteGroups){
const {paper,layout}=pages;
const page=document.createElement('div');
page.className='osm-preview-page';page.dataset.page=index+1;
page.style.width=paper.width+'px';page.style.height=paper.height+'px';
const tabs=paintTabPage(blocks,2,paper);
if(tabs){
tabs.canvas.style.top=tabs.top+'px';tabs.canvas.style.left=paper.margin+'px';
tabs.canvas.style.width=paper.contentWidth+'px';tabs.canvas.style.height=tabs.height+'px';
tabs.canvas.className='osm-paper-content';
page.append(tabs.canvas);
}
for(const block of blocks){
const {svg,notes,y,height,noteWidth}=block;
if(svg){
svg.style.top=y+(block.dy??0)+'px';svg.style.left=paper.margin+(block.dx??0)+'px';
svg.classList.add('osm-paper-content');page.append(svg);
if(block.heading){
svg.dataset.heading=block.heading;svg.classList.add('osm-paper-heading');svg.style.cursor='move';
}
for(const [noteIndex,node] of notes??[]){
if(noteIndex!==undefined)(noteGroups[noteIndex]??=[]).push(node);
}
}else{
for(const note of notes){
const cell=document.createElement('span');
cell.dataset.tabIndex=note.index;
cell.style.left=paper.margin+note.x+'px';cell.style.top=y+'px';
cell.style.width=noteWidth+'px';cell.style.height=height+'px';
cell.className='osm-paper-content';page.append(cell);
noteGroups[note.index]=[cell];
}
}
}
for(const object of layout.objects.filter(object=>object.repeat||object.page===index+1)){
const handle=document.createElement('div');
handle.className='osm-paper-object';handle.dataset.objectId=object.id;
handle.setAttribute('aria-label',object.type==='image'?'Image':object.text||'Text box');
handle.tabIndex=0;
handle.style.cssText='left:'+object.x+'px;top:'+object.y+'px;width:'+object.width+'px;height:'+object.height+'px;transform:rotate('+object.rotation+'deg)';
handle.classList.add('osm-object-'+object.layer);
const artwork=await paintPaperObject(object,2);
artwork.style.opacity=object.opacity;handle.append(artwork);
if(!object.locked){
const resize=document.createElement('span');resize.className='osm-paper-resize';resize.dataset.resize='true';handle.append(resize);
}
page.append(handle);
}
return page;
}

async function drawScorePreview(preserve=false){
const request=++previewRequest,tabView=previewKind.value==='tabs';
const status=find('preview-status'),playButton=find('preview-play');
const scrollTop=previewScroll.scrollTop,scrollLeft=previewScroll.scrollLeft;
previewPaper.replaceChildren();previewNotes=[];previewActive=[];
playButton.disabled=true;status.textContent='Preparing pages…';
const draft=tabView?structuredClone(nativeTabDraft()):null;
const title=tabView?draft.title.trim():projectName.value.trim()||'Untitled song';
find('score-preview-title').textContent=(title||'Untitled score')+' — Page editor';
try{
if(tabView&&!nativeTabNotes().length)throw Error('Add fingerings before previewing tabs.');
if(!tabView&&!score.events.length)throw Error('Add notes before previewing the staff.');
const pages=tabView?await tabPaper(draft):await staffPaper(title,authorInput.value.trim(),scoreEntries(),score.tempo);
const elements=[],noteGroups=[];
for(const [index,blocks] of pages.entries()){
if(request!==previewRequest||!scorePreview.open)return;
elements.push(await drawPreviewPage(blocks,index,pages,noteGroups));
}
if(request!==previewRequest||!scorePreview.open)return;
previewPages=pages;previewNotes=noteGroups;previewPaper.append(...elements);fitScorePreview();
if(preserve)previewScroll.scrollTo(scrollLeft,scrollTop);else previewScroll.scrollTo(0,0);
find('preview-page-count').textContent=pages.length+' '+(pages.length===1?'page':'pages');
status.textContent=previewSaveWarning;
playButton.disabled=false;
updatePreviewObjectSelection();
syncPreviewFields();
}catch(error){
if(request!==previewRequest||!scorePreview.open)return;
status.textContent=error.message;
}
}

function highlightScorePreview(index){
if(!scorePreview.open)return;
for(const node of previewActive)node.classList.remove('playing-note','preview-tab-active');
previewActive=previewNotes[index]??[];
for(const node of previewActive)node.classList.add(previewKind.value==='tabs'?'preview-tab-active':'playing-note');
const active=previewActive.at(-1);
if(!active)return;
const target=active.getBoundingClientRect(),view=previewScroll.getBoundingClientRect();
if(target.bottom>view.bottom-8||target.top<view.top+8)previewScroll.scrollTop+=target.top-view.top-14;
}

function openScorePreview(){
stopMelody();openNativeTabEditor();
previewKind.value=editorView==='tabs'?'tabs':'staff';
previewPast.length=0;previewFuture.length=0;previewSelected=null;previewSaveWarning='';
find('preview-zoom').value='fit';
scorePreview.showModal();syncPreviewFields();drawScorePreview();
}
previewKind.onchange=()=>{
stopMelody();previewPast.length=0;previewFuture.length=0;previewSelected=null;
syncPreviewFields();drawScorePreview();
};
find('preview-zoom').onchange=fitScorePreview;
find('preview-play').onclick=()=>{previewSelected=null;updatePreviewObjectSelection();play(previewKind.value==='tabs');};
find('preview-pause').onclick=pauseMelody;
find('preview-stop').onclick=stopMelody;
scorePreview.addEventListener('close',()=>{
previewRequest++;previewPages=null;
previewPaper.replaceChildren();previewNotes=[];previewActive=[];
stopMelody();
});
new ResizeObserver(fitScorePreview).observe(previewScroll);

let previewSelected=null,previewDragging=null;
const previewPast=[],previewFuture=[];
const previewInspector=find('preview-inspector');
function currentPaperLayout(){return paperLayouts[previewKind.value];}
function selectedPaperObject(){return currentPaperLayout().objects.find(object=>object.id===previewSelected);}
function previewEditState(){
return {layout:structuredClone(currentPaperLayout()),title:previewKind.value==='tabs'?nativeTabTitle.value:projectName.value,
credit:previewKind.value==='tabs'?nativeTabCredit.value:authorInput.value};
}
function setPreviewEditState(state){
paperLayouts[previewKind.value]=structuredClone(state.layout);
if(previewKind.value==='tabs'){nativeTabTitle.value=state.title;nativeTabCredit.value=state.credit;}
else{projectName.value=state.title;authorInput.value=state.credit;draftChanged=true;updateWorkspace();}
}
function finishPreviewEdit(before,label){
const after=previewEditState();
if(JSON.stringify(before)===JSON.stringify(after))return;
previewPast.push(before);
if(previewPast.length>30)previewPast.shift();
previewFuture.length=0;
const saved=saveNativeTabDraft(label);
previewSaveWarning=saved?'':nativeTabStatus.textContent;
stopMelody();syncPreviewFields();drawScorePreview(true);
}
function changePreview(label,change){
const before=previewEditState();change();
paperLayouts[previewKind.value]=cleanPaperLayout(currentPaperLayout());
finishPreviewEdit(before,label);
}
function previewUndo(redo=false){
const from=redo?previewFuture:previewPast,to=redo?previewPast:previewFuture;
if(!from.length)return;
stopMelody();to.push(previewEditState());setPreviewEditState(from.pop());
saveNativeTabDraft(redo?'Redid page formatting':'Undid page formatting');
syncPreviewFields();drawScorePreview(true);
}
for(const field of scorePreview.querySelectorAll('[data-paper-font]')){
for(const font of paperFonts)field.add(new Option(font.split(',')[0],font));
}
function syncPreviewFields(){
const layout=currentPaperLayout(),heading=find('preview-heading').value;
for(const field of scorePreview.querySelectorAll('[data-paper-field]')){
field.value=layout[field.dataset.paperField]??Number(nativeTabSize.value);
}
find('preview-tab-controls').hidden=previewKind.value!=='tabs';
find('preview-heading-text').value=previewKind.value==='tabs'
  ?(heading==='title'?nativeTabTitle.value:nativeTabCredit.value)
  :(heading==='title'?projectName.value:authorInput.value);
for(const field of scorePreview.querySelectorAll('[data-heading-field]')){
const value=layout[heading][field.dataset.headingField];
if(field.type==='checkbox')field.checked=value;else field.value=value;
}
const selection=find('preview-object');
selection.replaceChildren(new Option('None',''));
for(const [i,object] of layout.objects.entries())selection.add(new Option(
(object.type==='image'?'Image':object.text.trim().slice(0,25)||'Text box')+' · '+(i+1),object.id));
const object=selectedPaperObject();
if(!object)previewSelected=null;
selection.value=previewSelected??'';
find('preview-object-fields').hidden=!object;
if(object){
find('preview-object-text-wrap').hidden=object.type!=='text';
find('preview-object-type').hidden=object.type!=='text';
for(const field of scorePreview.querySelectorAll('[data-object-field]')){
const key=field.dataset.objectField,value=object[key];
if(field.type==='checkbox')field.checked=value;else field.value=key==='opacity'?Math.round(value*100):value;
}
}
for(const button of scorePreview.querySelectorAll('[data-preview-command]')){
const command=button.dataset.previewCommand;
if(command==='undo')button.disabled=!previewPast.length;
if(command==='redo')button.disabled=!previewFuture.length;
if(['delete','duplicate','front','back'].includes(command))button.disabled=!object;
}
updatePreviewObjectSelection();
}
function updatePreviewObjectSelection(){
for(const node of previewPaper.querySelectorAll('[data-object-id]'))node.classList.toggle('is-selected',node.dataset.objectId===previewSelected);
}
find('preview-heading').onchange=syncPreviewFields;
find('preview-heading-text').onchange=event=>changePreview('Edited page title or author',()=>{
const heading=find('preview-heading').value;
if(previewKind.value==='tabs')(heading==='title'?nativeTabTitle:nativeTabCredit).value=event.target.value;
else{(heading==='title'?projectName:authorInput).value=event.target.value;draftChanged=true;updateWorkspace();}
});
for(const field of scorePreview.querySelectorAll('[data-paper-field]'))field.onchange=()=>{
if(field.type==='number'&&!field.reportValidity())return;
changePreview('Changed page layout',()=>{currentPaperLayout()[field.dataset.paperField]=field.type==='number'?Number(field.value):field.value;});
};
for(const field of scorePreview.querySelectorAll('[data-heading-field]'))field.onchange=()=>{
if(field.type==='number'&&!field.reportValidity())return;
changePreview('Formatted title or author',()=>{
currentPaperLayout()[find('preview-heading').value][field.dataset.headingField]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;
});
};
find('preview-object').onchange=event=>{previewSelected=event.target.value||null;syncPreviewFields();};
for(const field of scorePreview.querySelectorAll('[data-object-field]'))field.onchange=()=>{
if(!selectedPaperObject()||(field.type==='number'&&!field.reportValidity()))return;
changePreview('Edited page object',()=>{
const key=field.dataset.objectField;
selectedPaperObject()[key]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value)/(key==='opacity'?100:1):field.value;
});
};
function insertPaperObject(type,src='',ratio=1){
changePreview(type==='image'?'Added page image':'Added page text',()=>{
const layout=currentPaperLayout(),paper=paperGeometry(layout);
const object=cleanPaperLayout({objects:[{id:newId(),type,src,text:type==='text'?'Your text':'',
x:paper.margin,y:120,width:220,height:type==='image'?220/ratio:80,page:1}]}).objects[0];
layout.objects.push(object);previewSelected=object.id;
});
}
find('preview-image').onchange=async event=>{
const file=event.target.files[0];event.target.value='';
if(!file)return;
const project=projectId,kind=previewKind.value;
try{
await assertImportImage(file,true);
const src=await new Promise((resolve,reject)=>{
const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This image could not be read.'));
reader.readAsDataURL(file);
});
if(!/^data:image\/(png|jpeg|webp);base64,/.test(src))throw Error('Choose a PNG, JPEG, or WebP image.');
const image=await paperImage(src);
assertImageDimensions(image.width,image.height);
const canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(image.width,image.height));
canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
if(!scorePreview.open||project!==projectId||kind!==previewKind.value)return;
insertPaperObject('image',canvas.toDataURL('image/png'),image.width/image.height);
}catch(error){find('preview-status').textContent=error.message;}
};
async function exportPreviewPaper(){
if(!previewPages||find('preview-play').disabled)return;
try{
const kind=previewKind.value,layout=structuredClone(currentPaperLayout());
const draft=structuredClone(nativeTabDraft()),title=kind==='tabs'?draft.title:projectName.value;
const credit=kind==='tabs'?draft.credit:authorInput.value;
await loadPDFExport();
const pages=kind==='tabs'?await tabPaper(draft):await staffPaper(title,credit,scoreEntries(),score.tempo,layout);
await saveScorePaper(pages,{title,author:credit,...(kind==='tabs'?{keywords:'osm-tab-draft-v1:'+encodeURIComponent(draft.text)}:{})},
(title||'Ocarina score').replace(/[\\/:*?"<>|]/g,'-'));
find('preview-status').textContent='PDF exported.';
}catch(error){find('preview-status').textContent=error.message;}
}
async function previewCommand(command){
if(command==='undo'||command==='redo'){previewUndo(command==='redo');return;}
if(command==='export'){await exportPreviewPaper();return;}
if(command==='save'){find('save').click();find('preview-status').textContent=projectStatus.textContent;return;}
if(command==='backup'){find('backup').click();return;}
if(command==='close'){scorePreview.close();return;}
if(command==='tabs'||command==='staff'){previewKind.value=command;previewKind.onchange();return;}
if(command==='fit'||command==='actual'){find('preview-zoom').value=command==='fit'?'fit':'1';fitScorePreview();return;}
if(command==='inspector'){previewInspector.hidden=!previewInspector.hidden;return;}
if(command==='image'){find('preview-image').click();return;}
if(command==='text'){insertPaperObject('text');return;}
if(command==='watermark'){
changePreview('Added watermark',()=>{
const paper=paperGeometry(currentPaperLayout());
const object=cleanPaperLayout({objects:[{id:newId(),type:'text',text:'Watermark',x:paper.margin,y:paper.height*.4,
width:paper.contentWidth,height:140,size:64,align:'center',opacity:.15,rotation:-30,repeat:true,layer:'background'}]}).objects[0];
currentPaperLayout().objects.push(object);previewSelected=object.id;
});return;
}
if(command==='duplicate'&&selectedPaperObject()){
changePreview('Duplicated page object',()=>{
const copy=structuredClone(selectedPaperObject());copy.id=newId();copy.x+=12;copy.y+=12;
currentPaperLayout().objects.push(copy);previewSelected=copy.id;
});return;
}
if(command==='delete'&&selectedPaperObject()){
changePreview('Removed page object',()=>{currentPaperLayout().objects=currentPaperLayout().objects.filter(object=>object.id!==previewSelected);previewSelected=null;});return;
}
if((command==='front'||command==='back')&&selectedPaperObject()){
changePreview('Changed page object order',()=>{
const layout=currentPaperLayout(),object=selectedPaperObject();
layout.objects=layout.objects.filter(entry=>entry.id!==object.id);
object.layer=command==='front'?'foreground':'background';
if(command==='front')layout.objects.push(object);else layout.objects.unshift(object);
});return;
}
if(command==='add-page'){changePreview('Added blank page',()=>currentPaperLayout().extraPages++);return;}
if(command==='reset'&&window.confirm('Reset formatting and remove all added objects from this view?')){
changePreview('Reset page formatting',()=>{paperLayouts[previewKind.value]=defaultPaperLayout();previewSelected=null;});
}
}
const previewMenus=[...scorePreview.querySelectorAll('.osm-preview-menubar details')];
scorePreview.addEventListener('click',event=>{
const summary=event.target.closest('.osm-preview-menubar summary');
if(summary)for(const menu of previewMenus)if(menu!==summary.parentElement)menu.open=false;
const button=event.target.closest('[data-preview-command]');
if(!button)return;
for(const menu of previewMenus)menu.open=false;
previewCommand(button.dataset.previewCommand);
});
scorePreview.addEventListener('pointerdown',event=>{
if(!event.target.closest('.osm-preview-menubar'))for(const menu of previewMenus)menu.open=false;
});
previewPaper.addEventListener('pointerdown',event=>{
if(event.button!==0||melody)return;
const node=event.target.closest('[data-object-id],[data-heading]');
if(!node){previewSelected=null;syncPreviewFields();return;}
event.preventDefault();
node.focus({preventScroll:true});
const object=node.dataset.objectId?currentPaperLayout().objects.find(object=>object.id===node.dataset.objectId):null;
previewSelected=object?.id??null;
if(node.dataset.heading)find('preview-heading').value=node.dataset.heading;
syncPreviewFields();
if(object?.locked)return;
const target=object??currentPaperLayout()[node.dataset.heading],scale=node.closest('.osm-preview-page').getBoundingClientRect().width/previewPages.paper.width;
previewDragging={pointer:event.pointerId,node,before:previewEditState(),target,startX:event.clientX,startY:event.clientY,
x:object?target.x:target.dx,y:object?target.y:target.dy,width:target.width,height:target.height,
resize:event.target.dataset.resize==='true',scale,object};
node.setPointerCapture(event.pointerId);
});
previewPaper.addEventListener('pointermove',event=>{
const drag=previewDragging;
if(!drag||event.pointerId!==drag.pointer)return;
const dx=(event.clientX-drag.startX)/drag.scale,dy=(event.clientY-drag.startY)/drag.scale;
if(drag.resize){
drag.target.width=Math.max(12,drag.width+dx);drag.target.height=Math.max(12,drag.height+dy);
drag.node.style.width=drag.target.width+'px';drag.node.style.height=drag.target.height+'px';
}else{
const x=drag.x+dx,y=drag.y+dy;
if(drag.object){drag.target.x=Math.max(0,x);drag.target.y=Math.max(0,y);}
else{drag.target.dx=x;drag.target.dy=y;}
drag.node.style.translate=dx+'px '+dy+'px';
}
});
function finishPaperDrag(event){
const drag=previewDragging;
if(!drag||event.pointerId!==drag.pointer)return;
previewDragging=null;
if(event.type==='pointercancel'){
setPreviewEditState(drag.before);drawScorePreview(true);
}else finishPreviewEdit(drag.before,drag.resize?'Resized page object':'Moved page object');
}
previewPaper.addEventListener('pointerup',finishPaperDrag);
previewPaper.addEventListener('pointercancel',finishPaperDrag);
previewPaper.addEventListener('lostpointercapture',finishPaperDrag);
scorePreview.addEventListener('keydown',event=>{
const modifier=event.metaKey||event.ctrlKey;
if(modifier&&event.key.toLowerCase()==='s'){event.preventDefault();previewCommand('save');return;}
if(event.key==='Escape'){
const menu=previewMenus.find(menu=>menu.open);
if(menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();return;}
}
const menu=event.target.closest('.osm-preview-menubar details');
if(menu&&['ArrowUp','ArrowDown'].includes(event.key)){
event.preventDefault();
const items=[...menu.querySelectorAll('button:not(:disabled)')];
if(!items.length)return;
const index=items.indexOf(document.activeElement),step=event.key==='ArrowDown'?1:-1;
items[(index+step+items.length)%items.length].focus();return;
}
if(editable(event.target))return;
if(modifier&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();previewUndo(event.shiftKey);return;}
if(modifier&&event.key.toLowerCase()==='d'&&selectedPaperObject()){event.preventDefault();previewCommand('duplicate');return;}
if(event.key==='Escape'&&previewSelected){event.preventDefault();previewSelected=null;syncPreviewFields();return;}
if((event.key==='Delete'||event.key==='Backspace')&&selectedPaperObject()){event.preventDefault();previewCommand('delete');return;}
if(selectedPaperObject()&&!selectedPaperObject().locked&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
event.preventDefault();
changePreview('Moved page object',()=>{
const object=selectedPaperObject(),step=event.shiftKey?10:1;
if(event.key==='ArrowLeft')object.x=Math.max(0,object.x-step);
if(event.key==='ArrowRight')object.x+=step;
if(event.key==='ArrowUp')object.y=Math.max(0,object.y-step);
if(event.key==='ArrowDown')object.y+=step;
});
}
});

let micSession=null,practiceIndex=0,practiceCards=[];
let pitchConfidence=0,noisePeak=0,calibrationEnd=0;
function signalLevel(samples){
let energy=0;
for(const sample of samples)energy+=sample*sample;
return Math.sqrt(energy/samples.length);
}
function estimatePitch(samples,rate){
const result=detectPitch(samples,rate);
pitchConfidence=result.confidence;
return result.frequency;
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
if(prefix==='tuner'){showTunerPitch(null,0,0);resetTunerGraphs();}
if(prefix==='practice')find('practice-pitch').textContent='—';
if(prefix==='recognition'){recognitionNeedsRelease=false;showRecognitionInput(false);}
if(message)find(prefix+'-status').textContent=message;
}
async function listenMic(mode,onPitch){
stopCustomRecording('Recording stopped to use the microphone elsewhere.');
stopMic('Microphone stopped.');
const startButton=find(mode+'-start');
const stopButton=find(mode+'-stop');
const status=find(mode+'-status');
const session={mode};
micSession=session;startButton.disabled=true;stopButton.disabled=false;
if(mode==='recognition')showRecognitionInput(true);
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
if(mode==='tuner')drawTunerWave(samples,session.context.sampleRate);
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
frames++;
if(mode==='tuner')plotTunerPitch(frames>=2?midi:null,cents);
if(frames>=2)onPitch(midi,frequency,cents);
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
if(midi!==null&&midi>=69&&midi<=89)chart.append(makeFinger(midi));
}
find('tuner-pitch').textContent=midi===null?'—':name(midi);
find('tuner-frequency').textContent=midi===null?'— Hz':frequency.toFixed(1)+' Hz';
const needle=find('tuner-needle');
needle.hidden=midi===null;
needle.style.left=(50+Math.max(-50,Math.min(50,cents)))+'%';
needle.classList.toggle('in-tune',Math.abs(cents)<=5);
const tuning=Math.abs(cents)<=5?'In tune':Math.abs(cents)+' cents '+(cents<0?'flat':'sharp');
find('tuner-status').textContent=midi===null?'Listening. Play a steady note.':
tuning+(midi<69||midi>89?' · Outside the 12-hole C fingering range':'');
}
find('tuner-start').addEventListener('click',()=>{resetTunerGraphs();showTunerPitch(null,0,0);listenMic('tuner',showTunerPitch);});
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
let practiceUploadedTabs=false,practiceTabIndex=-1;
function restartPractice(){
if(heldStepKey)stopStep();
practiceTabIndex=-1;
practiceCorrect=0;practiceAttempts=0;resetPracticeTiming();updatePracticeFeedback();
practiceIndex=0;
for(const card of practiceCards)card.classList.remove('practice-next','practice-hit');
practiceCards[0]?.classList.add('practice-next');
showPracticeFingering();updatePracticeWindow();
find('practice-status').textContent=micSession?.mode==='practice'?
'Follow the blue outline, or press Enter to continue.':
practiceUploadedTabs?'Press Enter or the arrow keys to hear each note.':'Start the microphone to match notes, or press Enter to step through them.';
find('practice-grid').focus({preventScroll:true});
}
find('practice-restart').addEventListener('click',restartPractice);
find('practice-expand').addEventListener('click',()=>{
practiceExpanded=!practiceExpanded;updatePracticeWindow();
find('practice-grid').focus({preventScroll:true});
});
function showPractice(pitches,back=practiceReturn,lengths=pitches.map(()=>4),uploadedTabs=false){
if(!pitches.every(Music.playable)){report("Shift yellow notes into A4–F6 before starting Play Along.");return;}
practiceReturn=back;
if(!pitches.length){report('Add notes before starting Play Along.');return;}
practiceUploadedTabs=uploadedTabs;
openPage('practice');
if(uploadedTabs)prepareSound()?.catch(loadError);
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
function stepUploadedPractice(direction,key){
if(!practiceNotes.length)return;
if(micSession?.mode==='practice')stopMic();
practiceCards[practiceIndex]?.classList.remove('practice-next');
practiceTabIndex=Math.max(0,Math.min(practiceNotes.length-1,practiceTabIndex+direction));
practiceIndex=practiceTabIndex;
practiceCards[practiceIndex].classList.add('practice-next');
showPracticeFingering();updatePracticeWindow();
previewPitch(practiceNotes[practiceIndex],key);
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



const recognitionStatsKey='osm-recognition-statistics-v1';

function readPracticeData(key){
  try{return JSON.parse(localStorage.getItem(key));}catch{return null;}
}

const savedRecognitionStats=readPracticeData(recognitionStatsKey);
const recognitionTotals=savedRecognitionStats?.totals??{};
const recognitionSessions=Array.isArray(savedRecognitionStats?.sessions)?savedRecognitionStats.sessions:[];
let recognitionSession=null;

function accuracyPercent(correct,attempts){
  return Math.round(100*correct/attempts);
}

function renderPracticeHistory(){
  const stored=readPracticeData('osm-practice-history');
  const sessions=[...(Array.isArray(stored)?stored:[]),...recognitionSessions]
    .filter(session=>session&&Number.isFinite(Date.parse(session.date)))
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  const list=find('practice-history');
  list.replaceChildren();
  if(!sessions.length){
    const item=document.createElement('li');
    item.textContent='No completed sessions yet.';
    list.append(item);
  }
  for(const session of sessions){
    const item=document.createElement('li');
    const date=new Date(session.date).toLocaleDateString();
    if(session.mode==='recognition'){
      item.textContent=date+' · Note recognition ('+session.studyMode+') · '+session.correct+'/'+session.attempts+
        ' correct · '+accuracyPercent(session.correct,session.attempts)+'%';
    }else{
      item.textContent=date+' · '+session.matched+'/'+session.notes+' matched'+
        (session.meanTiming==null?'':' · '+session.meanTiming+' ms mean timing error');
    }
    list.append(item);
  }
}

const recognitionStatRows=new Map();
function renderRecognitionStatistics(){
  let correct=0,attempts=0;
  for(const [pitch,{bar,result}] of recognitionStatRows){
    const total=recognitionTotals[pitch];
    const count=total?.attempts??0,hits=total?.correct??0;
    correct+=hits;attempts+=count;
    bar.value=count?hits/count:0;
    result.textContent=count?accuracyPercent(hits,count)+'% · '+hits+'/'+count:'No attempts';
  }
  find('recognition-accuracy').textContent=attempts
    ?'Overall: '+accuracyPercent(correct,attempts)+'% · '+correct+'/'+attempts+' correct'
    :'No answers recorded yet.';
}

function recordRecognitionAttempt(pitch,correct,flash){
  if(!recognitionSession){
    recognitionSession={mode:'recognition',studyMode:flash?'Flashcards':'Free mode',attempts:0,correct:0};
    recognitionSessions.unshift(recognitionSession);
    recognitionSessions.length=Math.min(recognitionSessions.length,30);
  }
  recognitionSession.date=new Date().toISOString();
  recognitionSession.attempts++;
  recognitionSession.correct+=Number(correct);
  const total=recognitionTotals[pitch]??{attempts:0,correct:0};
  total.attempts++;
  total.correct+=Number(correct);
  recognitionTotals[pitch]=total;
  try{localStorage.setItem(recognitionStatsKey,JSON.stringify({totals:recognitionTotals,sessions:recognitionSessions}));}catch{}
  renderRecognitionStatistics();
}

for(let pitch=69;pitch<=89;pitch++){
  const item=document.createElement('li'),label=document.createElement('span');
  const bar=document.createElement('meter'),result=document.createElement('span');
  label.textContent=name(pitch);
  bar.max=1;
  bar.setAttribute('aria-label',name(pitch)+' accuracy');
  result.id='oc93-recognition-stat-'+pitch;
  bar.setAttribute('aria-describedby',result.id);
  item.append(label,bar,result);
  find('recognition-pitch-stats').append(item);
  recognitionStatRows.set(pitch,{bar,result});
}
renderRecognitionStatistics();

const tunerHistory=[];
const tunerWindowMs=4000;
const pitchCanvas=find('pitch-history');
const waveCanvas=find('input-wave');

function prepareTunerPlot(canvas){
  const bounds=canvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const ratio=window.devicePixelRatio||1;
  const width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const context=canvas.getContext('2d');
  const theme=getComputedStyle(canvas);
  context.clearRect(0,0,width,height);
  context.lineWidth=ratio;
  context.strokeStyle=theme.getPropertyValue('--viz-border');
  context.beginPath();
  for(const fraction of [.25,.5,.75]){
    context.moveTo(0,height*fraction);context.lineTo(width,height*fraction);
    context.moveTo(width*fraction,0);context.lineTo(width*fraction,height);
  }
  context.stroke();
  context.lineWidth=1.6*ratio;
  context.strokeStyle=theme.getPropertyValue('--viz-accent');
  context.beginPath();
  return {context,width,height};
}

function drawTunerWave(samples,sampleRate){
  const plot=prepareTunerPlot(waveCanvas);
  if(!plot)return;
  const {context,width,height}=plot;
  const count=Math.min(samples.length,Math.round(sampleRate*.02));
  const peak=Math.max(.03,...samples.subarray(0,count).map(Math.abs));
  for(let i=0;i<count;i++){
    const x=i*width/(count-1),y=height*(.5-.42*samples[i]/peak);
    if(i===0)context.moveTo(x,y);else context.lineTo(x,y);
  }
  context.stroke();
}

function drawPitchHistory(now=performance.now()){
  const plot=prepareTunerPlot(pitchCanvas);
  if(!plot)return;
  const {context,width,height}=plot;
  const reference=[...tunerHistory].reverse().find(point=>point.midi!==null)?.midi;
  const deviation=point=>(point.midi-reference)*100+point.cents;
  const limit=Math.max(50,50*Math.ceil(Math.max(0,...tunerHistory.filter(point=>point.midi!==null).map(point=>Math.abs(deviation(point))))/50));
  find('pitch-range').textContent=reference===undefined?'Cents · last 4 s':name(reference)+' · cents';
  find('plot-high').textContent='+'+limit;
  find('plot-low').textContent='−'+limit;
  let connected=false;
  for(const point of tunerHistory){
    if(point.midi===null){connected=false;continue;}
    const x=(1-(now-point.time)/tunerWindowMs)*width;
    const y=height*(.5-.46*deviation(point)/limit);
    if(connected)context.lineTo(x,y);else context.moveTo(x,y);
    connected=true;
  }
  context.stroke();
}

function plotTunerPitch(midi,cents){
  const time=performance.now();
  tunerHistory.push({midi,cents,time});
  while(tunerHistory[0].time<time-tunerWindowMs)tunerHistory.shift();
  drawPitchHistory(time);
}

function resetTunerGraphs(){
  tunerHistory.length=0;
  drawPitchHistory();
  prepareTunerPlot(waveCanvas);
}

if(window.ResizeObserver){
  new ResizeObserver(()=>{
    drawPitchHistory();
    if(micSession?.mode!=='tuner')prepareTunerPlot(waveCanvas);
  }).observe(pitchCanvas);
}

const recognitionPitches=Array.from({length:21},(_,i)=>69+i);
const recognitionPool=new Set(recognitionPitches);
const recognitionTarget=find('recognition-target');
const recognitionStatus=find('recognition-status');
const recognitionReveal=find('recognition-reveal');
const recognitionRatings=find('recognition-ratings');
const holeDiagram=find('recognition-diagram');
const holeMenu=find('recognition-hole-menu');
const recognitionDeckKey='osm-recognition-fsrs-v1';
const recognitionButtons=new Map();
let recognitionDeck={};
try{recognitionDeck=JSON.parse(localStorage.getItem(recognitionDeckKey))||{};}catch{}
let recognitionPitch=null,recognitionMask=0,recognitionTimer=null;
let recognitionFlash=false,recognitionAnswered=false,recognitionNeedsRelease=false;
let recognitionScheduler,recognitionRevealed=false;

function makeHoleDiagram(){
  const svg=makeFinger(69);
  svg.firstChild.setAttribute('d',fingerPaths[0][2].split('Z').slice(0,2).join('Z')+'Z');
  svg.classList.add('osm-hole-diagram');
  svg.firstChild.classList.add('recognition-body');
  for(const [x,y] of fingeringHoles){
    const hole=document.createElementNS(svgNS,'circle');
    hole.setAttribute('cx',x);hole.setAttribute('cy',y);hole.setAttribute('r',32);
    svg.append(hole);
  }
  return svg;
}
const diagram=makeHoleDiagram();
const holeControls=[...diagram.querySelectorAll('circle')].map((hole,i)=>{
  hole.setAttribute('role','button');hole.setAttribute('aria-label','Hole '+(i+1));
  hole.tabIndex=0;
  const toggle=()=>{
    if(!canEditRecognitionHoles())return;
    recognitionMask^=1<<i;drawRecognitionHoles();
  };
  hole.onclick=toggle;
  hole.onkeydown=event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}
  };
  return hole;
});
holeDiagram.append(diagram);

function canEditRecognitionHoles(){
  return !holeDiagram.hidden&&!recognitionAnswered&&!recognitionRevealed&&recognitionPitch!==null;
}

const fillHoles=find('recognition-fill-holes'),clearHoles=find('recognition-clear-holes');
let holeMenuTrigger;
function closeHoleMenu(restoreFocus=false){
  if(holeMenu.hidden)return;
  holeMenu.hidden=true;
  if(restoreFocus)holeMenuTrigger?.focus({preventScroll:true});
  holeMenuTrigger=null;
}

function openHoleMenu(event,x,y){
  event.preventDefault();
  if(!canEditRecognitionHoles())return;
  holeMenuTrigger=holeControls.includes(event.target)?event.target:holeControls[0];
  holeMenu.hidden=false;
  holeMenu.style.left=Math.min(x,Math.max(0,window.innerWidth-holeMenu.offsetWidth))+'px';
  holeMenu.style.top=Math.min(y,Math.max(0,window.innerHeight-holeMenu.offsetHeight))+'px';
  fillHoles.focus({preventScroll:true});
}

diagram.addEventListener('contextmenu',event=>{
  const bounds=event.target.getBoundingClientRect();
  openHoleMenu(event,event.clientX||bounds.left,event.clientY||bounds.bottom);
});
diagram.addEventListener('keydown',event=>{
  if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
  const bounds=event.target.getBoundingClientRect();
  openHoleMenu(event,bounds.left,bounds.bottom);
});
for(const [button,mask] of [[fillHoles,(1<<holeControls.length)-1],[clearHoles,0]]){
  button.onclick=()=>{
    if(canEditRecognitionHoles()){
      recognitionMask=mask;
      drawRecognitionHoles();
    }
    closeHoleMenu(true);
  };
}
holeMenu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    event.preventDefault();
    closeHoleMenu(true);
  }else if(event.key==='ArrowUp'||event.key==='ArrowDown'){
    event.preventDefault();
    (document.activeElement===fillHoles?clearHoles:fillHoles).focus();
  }
});
// Keep menu focus while a pointer activates a button, including macOS Safari.
holeMenu.addEventListener('pointerdown',event=>{if(event.button===0)event.preventDefault();});
holeMenu.addEventListener('focusout',event=>{
  if(!holeMenu.contains(event.relatedTarget))closeHoleMenu();
});
document.addEventListener('pointerdown',event=>{
  if(!holeMenu.contains(event.target))closeHoleMenu();
});

function drawRecognitionHoles(){
  const mask=recognitionRevealed?fingeringMasks[recognitionPitch-69]:recognitionMask;
  holeControls.forEach((hole,i)=>{
    hole.setAttribute('aria-pressed',String(Boolean(mask&(1<<i))));
    hole.setAttribute('aria-disabled',String(recognitionAnswered||recognitionRevealed||recognitionPitch===null));
  });
}

function setFingeringPreview(revealed){
  recognitionRevealed=revealed;
  recognitionReveal.textContent=revealed?'Next':'Reveal';
  find('recognition-submit').disabled=revealed||recognitionAnswered||recognitionPitch===null;
  drawRecognitionHoles();
}

function showRecognitionInput(microphone){
  closeHoleMenu();
  holeDiagram.hidden=microphone;
  find('recognition-submit').hidden=microphone;
  recognitionReveal.hidden=microphone;
  if(microphone&&recognitionRevealed)setFingeringPreview(false);
  find('recognition-start').hidden=microphone;
  find('recognition-stop').hidden=!microphone;
  find('recognition-target').closest('.recognition-card').classList.toggle('recognition-mic',microphone);
}

function leaveRecognition(){
  recognitionSession=null;
  closeHoleMenu();
  clearTimeout(recognitionTimer);recognitionTimer=null;
  if(micSession?.mode==='recognition')stopMic();
  stopStep();
}

function nextRecognitionPitch(){
  closeHoleMenu();
  clearTimeout(recognitionTimer);recognitionTimer=null;
  recognitionAnswered=false;recognitionMask=0;
  recognitionTarget.classList.remove('recognition-hit');
  recognitionRatings.hidden=true;recognitionRatings.replaceChildren();
  const pitches=[...recognitionPool];
  if(recognitionFlash){
    const due=pitches.filter(pitch=>Date.parse(recognitionDeck[pitch]?.due??0)<=Date.now()||!recognitionDeck[pitch]);
    due.sort((a,b)=>Number(Boolean(recognitionDeck[b]))-Number(Boolean(recognitionDeck[a]))||
      (Date.parse(recognitionDeck[a]?.due)||0)-(Date.parse(recognitionDeck[b]?.due)||0));
    recognitionPitch=due[0]??null;
  }else{
    const choices=pitches.length>1?pitches.filter(pitch=>pitch!==recognitionPitch):pitches;
    recognitionPitch=choices[Math.floor(Math.random()*choices.length)]??null;
  }
  recognitionTarget.textContent=recognitionPitch===null?'—':name(recognitionPitch);
  setFingeringPreview(false);
  find('recognition-hear').disabled=recognitionPitch===null;
  recognitionReveal.disabled=recognitionPitch===null;
  find('recognition-start').disabled=recognitionPitch===null||micSession?.mode==='recognition';
  const nextDue=pitches.map(pitch=>Date.parse(recognitionDeck[pitch]?.due)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  recognitionStatus.textContent=!pitches.length?'Choose at least one pitch.':
    recognitionPitch===null?'All caught up. Next review '+new Date(nextDue).toLocaleString()+'.':'';
  if(recognitionPitch===null&&micSession?.mode==='recognition')stopMic();
}

function setRecognitionMode(flash){
  leaveRecognition();
  recognitionFlash=flash;
  find('recognition-free').setAttribute('aria-pressed',String(!flash));
  find('recognition-flash').setAttribute('aria-pressed',String(flash));
  nextRecognitionPitch();
}

async function openRecognitionFlashcards(){
  const button=find('recognition-flash');
  button.disabled=true;
  try{
    if(typeof OSMFSRS==='undefined')await loadAsset('fsrs.js');
    recognitionScheduler??=OSMFSRS.fsrs({request_retention:.9});
    if(currentPage==='practice-setup'&&practiceMode==='recognition')setRecognitionMode(true);
  }catch(error){recognitionStatus.textContent=error.message;}
  finally{button.disabled=false;}
}

function answerRecognition(correct){
  if(recognitionAnswered||recognitionRevealed||recognitionPitch===null)return;
  if(!recognitionFlash&&!correct){recognitionStatus.textContent='Try again!';return;}
  recognitionAnswered=true;
  recognitionReveal.disabled=true;
  find('recognition-submit').disabled=true;
  drawRecognitionHoles();
  recognitionTarget.classList.toggle('recognition-hit',correct);
  recognitionStatus.textContent=correct?'Correct!':'';
  if(!recognitionFlash){
    recognitionTimer=setTimeout(()=>{
      recognitionNeedsRelease=recognitionPool.size===1;
      nextRecognitionPitch();
    },650);
    return;
  }
  recognitionMask=fingeringMasks[recognitionPitch-69];drawRecognitionHoles();
  recognitionRatings.hidden=false;
  const pitch=recognitionPitch,now=new Date();
  const stored=recognitionDeck[pitch];
  const card=stored?{...stored,due:new Date(stored.due),last_review:new Date(stored.last_review)}:OSMFSRS.createEmptyCard(now);
  const options=recognitionScheduler.repeat(card,now);
  for(const label of (correct?['Again','Hard','Good','Easy']:['Again'])){
    const rating=document.createElement('button');
    rating.type='button';rating.className='ctrl';
    const next=options[OSMFSRS.Rating[label]].card;
    // Give new pitches an early confirmation review before FSRS sets longer intervals.
    if(!stored&&label==='Easy'&&next.due-now>1800000){
      next.due=new Date(now.getTime()+1800000);
      next.scheduled_days=0;
    }
    const minutes=Math.max(1,Math.round((next.due-now)/60000));
    const interval=minutes<60?minutes+'m':minutes<1440?Math.round(minutes/60)+'h':Math.round(minutes/1440)+'d';
    rating.textContent=label+' · '+interval;
    rating.onclick=()=>{
      recognitionDeck[pitch]=next;
      let saved=true;
      try{localStorage.setItem(recognitionDeckKey,JSON.stringify(recognitionDeck));}catch{saved=false;}
      recognitionNeedsRelease=true;nextRecognitionPitch();
      if(!saved)recognitionStatus.textContent='Review saved for this session only.';
    };
    recognitionRatings.append(rating);
  }
}

function updateRecognitionPool(){
  for(const [pitch,button] of recognitionButtons)button.setAttribute('aria-pressed',String(recognitionPool.has(pitch)));
  nextRecognitionPitch();
}

for(const pitch of recognitionPitches){
  const button=document.createElement('button');
  button.type='button';button.className='ctrl';button.textContent=name(pitch);
  function toggle(){
    if(recognitionPool.has(pitch))recognitionPool.delete(pitch);else recognitionPool.add(pitch);
    updateRecognitionPool();
  }
  button.onclick=toggle;
  button.oncontextmenu=event=>{event.preventDefault();toggle();};
  recognitionButtons.set(pitch,button);find('recognition-pool').append(button);
}
find('recognition-all').onclick=()=>{recognitionPitches.forEach(pitch=>recognitionPool.add(pitch));updateRecognitionPool();};
find('recognition-clear').onclick=()=>{recognitionPool.clear();updateRecognitionPool();};
find('recognition-free').onclick=()=>setRecognitionMode(false);
find('recognition-flash').onclick=openRecognitionFlashcards;
find('recognition-submit').onclick=()=>{
  if(!canEditRecognitionHoles())return;
  const correct=recognitionMask===fingeringMasks[recognitionPitch-69];
  recordRecognitionAttempt(recognitionPitch,correct,recognitionFlash);
  answerRecognition(correct);
};
recognitionReveal.onclick=()=>{
  if(micSession?.mode==='recognition'||recognitionAnswered||recognitionPitch===null)return;
  if(recognitionFlash){answerRecognition(false);return;}
  if(recognitionRevealed){nextRecognitionPitch();return;}
  setFingeringPreview(true);
  recognitionStatus.textContent='';
};
find('recognition-hear').onclick=()=>{
  recognitionNeedsRelease=true;
  previewPitch(recognitionPitch);
};
find('recognition-stop').onclick=()=>stopMic('');
find('recognition-start').onclick=()=>{
  let lastAttempt=null;
  listenMic('recognition',(midi,frequency,cents)=>{
    if(recognitionNeedsRelease){
      if(midi!==recognitionPitch&&!voices.has('step'))recognitionNeedsRelease=false;
      return;
    }
    if(midi===null){lastAttempt=null;return;}
    if(midi===lastAttempt||recognitionAnswered||recognitionPitch===null||Math.abs(cents)>45)return;
    lastAttempt=midi;
    const correct=midi===recognitionPitch;
    recordRecognitionAttempt(recognitionPitch,correct,recognitionFlash);
    if(correct)answerRecognition(true);
  });
};
find('practice-home').onclick=()=>openPage('home');
updateRecognitionPool();

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
hear:()=>playStep(position),
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
  "Start the microphone to see the pitch, frequency, cents from center, and Alto C fingering. Pitch history shows vibrato over four seconds. Input waveform shows the microphone signal."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-text",
  "Paste notes or ABC",
  "Paste note names such as F4 - C5 - Bb4, or single-voice ABC. Notes outside A4–F6 appear in yellow in the editor. Supported ABC can include key signatures, accidentals, rests, ties, tuplets, and inline tempo changes."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-image",
  "Read a fingering image",
  "Upload clear PNG or JPG fingering diagrams or a PDF. OSM assigns pitches automatically for supported diagrams. Review them before importing. For an unfamiliar layout, use Teach this layout to label each distinct fingering. OSM reads numbered PDF labels when present and otherwise tries scanning the diagrams. Correct detected pitches in the review dialog before continuing. Image imports start with one beat per event."
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
  "Import an exported JSON project to restore its score and settings. Saved scores are stored in this browser and listed under Recent scores on the main menu. Right-click a recent score and choose Delete, or open it and choose File → Delete score."
 ],
 [
  "Score editing",
  "editor",
  ".osm-menubar",
  "Use the editor menus",
  "File opens imports and exports. Edit has note actions. View opens Preview and switches between the staff and note sequence. Window shows or hides the editing panels. Help opens this tutorial."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-compose-panel",
  "Compose a score",
  "Make new score opens a blank editor. Choose a pitch to hear it and insert it after the current selection. View more opens octave groups from C0 to G9. Notes outside A4–F6 appear in yellow and can be shifted with the transposition tools."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-save",
  "Name and save a score",
  "Choose File → Rename to edit the title and source or author. Use Save score to keep your changes. The Edit history panel shows dated changes and saves."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-sequence",
  "Edit the sequence",
  "Click a card to select and hear it. Shift-click selects a range. Command-click on Mac or Ctrl-click on Windows toggles individual cards. Arrow keys move the selection. Delete removes it. Right-click to hear, insert, move, remove, or audition a replacement with Swap note."
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
  ".osm-menubar",
  "Edit in the piano roll",
  "Open Window → Piano roll. Double-click empty space to add a note. Drag notes to move them or drag their right edge to resize. Shift-click selects a range. Command-click or Ctrl-click toggles individual notes."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-piano-roll",
  "Set up the piano roll",
  "Drag the title bar to move the window or drag an edge or corner to resize it. Piano roll settings controls labels, snap, zoom, swing, humanize, and playback follow."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-transpose",
  "Fit the instrument range",
  "Use the semitone and octave buttons above the note cards to shift selected pitches together. Yellow cards mark pitches outside A4–F6. Use Transpose under Timeline and arrangement to shift the entire score."
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
  ".osm-viewbar",
  "Read and edit the staff",
  "Use Staff to read notation and click a note to select it. Open Rhythm and timing to edit written durations or work with a recording. The timing table lets you edit written beats and apply them to playback. Long pitches can be tied across barlines."
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
  "Play all follows the rhythm and updates the large fingering and staff highlights without scrolling the page. Use Stop, Loop, or Playback speed. Press Enter to step through notes manually. Hold Enter to sustain the current note."
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
  "practice-setup",
  "#oc93-practice-recognition",
  "Note recognition",
  "Free mode opens with a blank fingering chart. Tap holes and submit, or use Reveal to see the answer. Choose Use microphone to answer by playing. Manual input returns to the chart. Use the speaker to hear the target and Choose pitches to set your pool. In Flashcards, rate your recall to schedule your next FSRS review. Open Statistics for accuracy by pitch. Your sessions appear in Recent practice."
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
  "Play a matching note or press Enter to advance manually. For uploaded tabs, Enter and the arrow keys highlight and play each note. Hold Enter to sustain it. Pause stops listening. Restart clears progress in the current range. The arrow below the cards expands the default eight-note view."
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
  "#oc93-export-options",
  "Export sheet music",
  "Open File → Export for ABC, MusicXML, or an engraved PDF. ABC and MusicXML retain supported triplets and tempo marks. Copy for chat includes notation and available measured timing."
 ],
 [
  "Export",
  "editor",
  "#oc93-tab-creator",
  "Export fingering tabs",
  "Choose Edit → Open tab editor, or select Tab editor beside Staff. Edit the diagrams, spacing, title, and credit. Press Play to follow the highlighted fingerings, or use Enter and the left or right arrow keys to hear one at a time. Hold Enter to sustain a note. Tabs matching the score use its timing. A different tab sequence plays one beat per note. Use View → Preview to follow playback on the same pages as the PDF. The tab pages keep your spaces and line breaks. Pause and press Play to resume. Use Save as PDF for a paginated fingering sheet. Save the score once to find it in Recent scores. Tab drafts save automatically in this browser, and changes appear in Edit history."
 ],
 [
  "Export",
  "editor",
  "#oc93-backup",
  "Keep a project backup",
  "Choose File → Export → Download project backup. Reimport it to edit the project or open it in Practice. The separate installable preview package supports offline use after a first online visit in a compatible browser."
 ]
];
tutorialSteps.splice(tutorialSteps.findIndex(step=>step[3]==='Keep a project backup'),0,
 ['Export','editor','[data-editor-command="score-preview"]','Design the printed page', 'Open View → Preview for the page editor. File exports the current view as PDF or downloads a project backup. View switches between Staff and Fingering tabs. Edit inserts text boxes, images, watermarks, and blank pages, with layout Undo and Redo. Use Formatting for paper size, orientation, margins, heading fonts, sizes, alignment, color, and offsets. Fingering tabs also support custom diagram size and line spacing. Drag objects or resize their corner, then set opacity, rotation, page, repeat, and layer in Objects. Layouts save with the tab draft and project backup.'],
 ['Export','editor','[data-editor-command="score-preview"]','Arrange images and text',
  'Insert an image or text box from the page editor toolbar. Select it on the page, drag to move it, and drag the lower-right corner to resize it. Objects offers exact coordinates, dimensions, opacity, rotation, text styling, page placement, repetition, locking, and front or back layers. Delete removes an object, and Command-Z or Control-Z undoes a layout edit.'],
 ['Export','editor','[data-editor-command="score-preview"]','Save a page design',
  'File → Export PDF inside the page editor exports the view you are looking at. Formatting is also used by the score PDF and Tab editor PDF buttons. Save score keeps the project, and a project backup includes your images and both page layouts. Tab line breaks and spaces stay intact when a wide row is fitted to paper.']);
tutorialSteps.push(['Export','home','#oc93-recovery-open','Recover recent edits',
'OSM keeps recent recovery snapshots as you edit. Recover work opens snapshots from this browser, including unsaved notes and page layouts. Restore copy opens a separate score. Download backup keeps your work outside browser storage. Clearing site data removes both saved scores and snapshots.']);
tutorialSteps.splice(2,0,['Home and sounds','home','#oc93-sound-open','Custom Sound','Open Settings → Ocarina sound → Custom Sound. Select a note and use the fingering diagram below the controls. Choose Record note, then hold it within ±40 cents for three continuous seconds. The green circle fills while you are in tune and resets if you drift or stop. Successful takes save automatically. The microphone stays on between takes, and each successful save automatically starts recording the next missing pitch without another permission request. Click any recorded pitch to hear or re-record it. After all 21 pitches from A4 to F6 are recorded, choose Use my ocarina. Your custom sound then supplies note previews, keyboard sounds, tab playback, and full score playback. Name a take and choose Save sound to keep it. Save as new keeps a separate version; select Saved sounds to switch, New sound to start fresh, or Delete saved sound to remove one. Record again continues through the pitches even when they were already recorded. Recordings are stored separately in this browser.']);
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
if(selector==='#oc93-piano-roll')openPianoRoll();
else if(tutorialTarget===rollWindow)rollWindow.close();
if(page==='editor'){
if(selector==='#oc93-sequence')switchEditorView('sequence');
if(selector==='#oc93-view'||selector==='.osm-viewbar')switchEditorView('staff');
}
if(page==='practice-setup')choosePractice(selector==='#oc93-practice-recognition'?'recognition':null);
if(selector==='#oc93-tab-creator')switchEditorView('tabs');
if(selector==='#oc93-export-options'||selector==='#oc93-backup')setExportMenu(true);
tutorialTarget=root.querySelector(selector);
for(let parent=tutorialTarget?.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
tutorialTarget?.classList.add('tutorial-target');
tutorialTarget?.scrollIntoView({block:'center'});
find('tour-progress').textContent=(tutorialIndex+1)+' of '+tutorialSteps.length;
find('tour-heading').textContent=heading;
find('tour-text').textContent=description;
const example=find('tour-example');
example.style.cssText='';
example.hidden=!['Read triplets and tempo changes','Design the printed page','Arrange images and text','Save a page design'].includes(heading);
if(!example.hidden&&heading!=='Read triplets and tempo changes')showPaperTutorialExample(example);
else if(!example.hidden)loadNotation().then(()=>{if(!example.hidden)window.ABCJS.renderAbc(example,'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n(3cde [Q:1/4=90] f2 z4 |]',{responsive:'resize',staffwidth:300});}).catch(loadError);
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
function composePitchButton(midi){
const button=document.createElement('button');
button.type='button';button.className='ctrl';button.textContent=name(midi);
if(!Music.playable(midi)){
button.classList.add('outside-range');
button.title='Outside A4–F6 · transpose after adding';
}
button.addEventListener('click',()=>{
if(recording){report('Finish recording before adding notes.');return;}
const index=score.events.length?position+1:0;
score.splice(index,0,[{pitch:midi,ticks:4}]);
edited(index,true);showPlaybackFingering(index);previewPitch(midi);
});
return button;
}
for(let midi=69;midi<=89;midi++)composeKeys.append(composePitchButton(midi));
const extendedCompose=find('compose-extended');
for(let octave=0;octave<=9;octave++){
const group=document.createElement('details'),heading=document.createElement('summary'),keys=document.createElement('div');
heading.textContent='Octave '+octave;keys.className='toolbar';
for(let midi=(octave+1)*12;midi<=Math.min(127,(octave+2)*12-1);midi++)keys.append(composePitchButton(midi));
group.append(heading,keys);extendedCompose.append(group);
}
find('compose-more').onclick=event=>{
extendedCompose.hidden=!extendedCompose.hidden;
event.currentTarget.setAttribute('aria-expanded',String(!extendedCompose.hidden));
event.currentTarget.textContent=extendedCompose.hidden?'View more':'View fewer';
};
let practiceMode=null;
function choosePractice(mode){
if(practiceMode==='recognition'&&mode!=='recognition')leaveRecognition();
if(mode==='recognition')setRecognitionMode(false);
if(mode===null)renderPracticeHistory();
practiceMode=mode;pdfRequest++;find('reference-hint').hidden=true;
find('practice-options').hidden=mode!==null;
find('practice-mode-back').hidden=mode===null;
for(const choice of ['paste','tabs','backup','recognition'])find('practice-'+choice).hidden=choice!==mode;
report('');
}
for(const button of root.querySelectorAll('[data-practice-mode]')){
button.addEventListener('click',()=>choosePractice(button.dataset.practiceMode));
}
find('practice-mode-back').addEventListener('click',()=>choosePractice(null));

async function showPaperTutorialExample(host){
const step=tutorialIndex;
const layout=defaultPaperLayout();
layout.title.align='center';layout.title.font=paperFonts[1];layout.tabSize=52;
layout.objects=cleanPaperLayout({objects:[{id:'demo',type:'text',text:'Practice',x:180,y:160,width:260,height:90,size:40,rotation:-20,opacity:.16,layer:'background'}]}).objects;
const pages=await tabPaper({text:'A  D U\n\nD A',size:'52',title:'My ocarina song',credit:'Source / author',paperLayouts:{tabs:layout}});
const page=await drawPreviewPage(pages[0],0,pages,[]);
if(!tutorial.open||host.hidden||step!==tutorialIndex)return;
host.replaceChildren(page);host.style.cssText='height:190px;overflow:hidden;background:#fff;position:relative';
page.style.cssText+=';transform:scale(.42);transform-origin:top left;position:relative;color:#000';
}

const teachDialog=find('scan-teach');
const teachCanvas=find('scan-canvas');
const teachStatus=find('scan-teach-status');
const teachExamples=find('scan-examples');
const teachUse=find('scan-teach-use');

function teachTabLayout(source){
  const {width,height}=source;
  const context=teachCanvas.getContext('2d');
  const pixels=source.getContext('2d').getImageData(0,0,width,height).data;
  teachCanvas.width=width;teachCanvas.height=height;
  let start=null,groups=[],ordered=[];
  function paint(boxes=[]){
    context.drawImage(source,0,0);
    context.lineWidth=Math.max(2,width/450);context.strokeStyle='#0077df';
    for(const {l,t,w,h} of boxes)context.strokeRect(l,t,w,h);
  }
  function point(event){
    const rect=teachCanvas.getBoundingClientRect();
    return [Math.round(Math.min(width,Math.max(0,(event.clientX-rect.left)*width/rect.width))),
      Math.round(Math.min(height,Math.max(0,(event.clientY-rect.top)*height/rect.height)))];
  }
  function selection(event){
    const [x,y]=point(event),[a,b]=start;
    return {l:Math.min(x,a),t:Math.min(y,b),w:Math.abs(x-a),h:Math.abs(y-b)};
  }
  function labelGroups(example){
    groups=[];ordered=[];teachExamples.replaceChildren();teachUse.disabled=true;
    if(example.w<12||example.h<12){teachStatus.textContent='Draw a larger box around one fingering.';return;}
    const boxes=collectSimilarTabBoxes(pixels,width,height,example);
    const rows=[];
    for(const box of boxes.sort((a,b)=>a.t-b.t)){
      const row=rows.find(row=>Math.abs(row[0].t-box.t)<example.h*.45);
      if(row)row.push(box);else rows.push([box]);
    }
    ordered=rows.flatMap(row=>row.sort((a,b)=>a.l-b.l));
    for(const box of ordered){
      const signature=tabCropSignature(pixels,width,box);
      let group=groups.find(entry=>entry.signature.reduce((sum,value,i)=>sum+Math.abs(value-signature[i]),0)/signature.length<.012);
      if(!group){group={box,signature,count:0};groups.push(group);}
      group.count++;box.group=group;
    }
    paint(ordered);
    teachStatus.textContent=ordered.length+' diagrams found. Check the boxes, then label each distinct fingering.';
    for(const group of groups){
      const {l,t,w,h}=group.box;
      const label=document.createElement('label');
      const thumbnail=document.createElement('canvas');
      thumbnail.width=w;thumbnail.height=h;
      thumbnail.getContext('2d').drawImage(source,l,t,w,h,0,0,w,h);
      const select=document.createElement('select');
      select.setAttribute('aria-label','Pitch for fingering '+(teachExamples.children.length+1));
      select.add(new Option('Choose pitch',''));
      for(let midi=69;midi<=89;midi++)select.add(new Option(name(midi),midi));
      select.add(new Option('Skip diagram','skip'));
      select.onchange=()=>{
        group.pitch=select.value;
        teachUse.disabled=groups.some(entry=>!entry.pitch)||groups.every(entry=>entry.pitch==='skip');
      };
      label.append(thumbnail,document.createTextNode('×'+group.count),select);
      teachExamples.append(label);
    }
  }
  teachCanvas.onpointerdown=event=>{
    if(event.button!==0)return;
    start=point(event);teachCanvas.setPointerCapture(event.pointerId);
  };
  teachCanvas.onpointermove=event=>{if(start)paint([selection(event)]);};
  teachCanvas.onpointerup=event=>{
    if(!start)return;
    const example=selection(event);start=null;labelGroups(example);
  };
  teachCanvas.onpointercancel=()=>{start=null;paint(ordered);};
  teachUse.onclick=()=>teachDialog.close('use');
  find('scan-teach-cancel').onclick=()=>teachDialog.close('cancel');
  teachExamples.replaceChildren();teachStatus.textContent='';teachUse.disabled=true;
  paint();teachDialog.returnValue='';teachDialog.showModal();
  return new Promise(resolve=>teachDialog.addEventListener('close',()=>{
    teachCanvas.onpointerdown=teachCanvas.onpointermove=teachCanvas.onpointerup=teachCanvas.onpointercancel=null;
    resolve(teachDialog.returnValue==='use'?ordered.filter(box=>box.group.pitch!=='skip').map(box=>Number(box.group.pitch)):null);
    teachExamples.replaceChildren();teachCanvas.width=teachCanvas.height=1;
  },{once:true}));
}

function collectSimilarTabBoxes(pixels,width,height,example){
  const matches=[example];
  // Try several contrasts so pale backgrounds and thin strokes can still form
  // a connected outline. Merge repeated detections of the same diagram.
  for(const threshold of [585,690,480]){
    const {boxes}=findFingeringBoxes(pixels,width,height,threshold,.45,2.4,12,12);
    for(const box of boxes){
      if(Math.abs(box.w/example.w-1)>.24||Math.abs(box.h/example.h-1)>.24)continue;
      if(matches.some(other=>Math.abs(other.l+other.w/2-box.l-box.w/2)<example.w*.45&&
        Math.abs(other.t+other.h/2-box.t-box.h/2)<example.h*.45))continue;
      matches.push(box);
    }
  }
  return matches;
}

function tabCropSignature(pixels,width,{l,t,w,h}){
  const signature=[];
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){
    const index=((t+Math.floor((y+.5)*h/24))*width+l+Math.floor((x+.5)*w/24))*4;
    const light=(pixels[index]+pixels[index+1]+pixels[index+2])/765;
    signature.push(pixels[index+3]>128&&light<.55?1:0);
  }
  return signature;
}

// Find round ink islands (covered holes) and round enclosed gaps (open holes).
function tabHoleCandidates(rgba,width,box){
const {l,t,w,h}=box;
const size=Math.min(w,h);
const ink=new Uint8Array(w*h);
let light=0,dark=255;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const p=((t+y)*width+l+x)*4;
const value=rgba[p+3]>128?(rgba[p]+rgba[p+1]+rgba[p+2])/3:255;
light=Math.max(light,value);dark=Math.min(dark,value);
}
if(light-dark<65)return [];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const p=((t+y)*width+l+x)*4;
ink[y*w+x]=rgba[p+3]>128&&(rgba[p]+rgba[p+1]+rgba[p+2])/3<(light+dark)/2?1:0;
}
const holes=[];
const seen=new Uint8Array(ink.length);
for(let start=0;start<ink.length;start++){
if(seen[start])continue;
const value=ink[start],queue=[start];seen[start]=1;
let left=w,right=0,top=h,bottom=0,sx=0,sy=0;
for(let i=0;i<queue.length;i++){
const p=queue[i],x=p%w,y=Math.floor(p/w);
left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);sx+=x;sy+=y;
for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
const nx=x+dx,ny=y+dy,n=ny*w+nx;
if(nx>=0&&nx<w&&ny>=0&&ny<h&&!seen[n]&&ink[n]===value){seen[n]=1;queue.push(n);}
}
}
const a=right-left+1,b=bottom-top+1;
if(left===0||right===w-1||top===0||bottom===h-1||Math.min(a,b)<Math.max(2,size*.015)||
Math.max(a,b)>size*.17||a/b<.55||a/b>1.8||queue.length/(a*b)<.55)continue;
holes.push({x:(sx/queue.length+.5)/w,y:(sy/queue.length+.5)/h,covered:Boolean(value)});
}
return holes;
}

function matchTabHoles(holes){
if(holes.length<12||holes.length>22)return null;
const layouts=[
fingeringHoles.map(([x,y])=>[(x-10)/994,(y-10)/950]),
wideTabHoles.map(([x,y])=>[(x+.5)/46,(y+.5)/39])
];
const results=[];
for(const layout of layouts)for(const scale of [.8,.9,1,1.1,1.2]){
// Use one observed hole as an anchor and fit the other eleven relative positions.
for(const anchor of holes){
const [ax,ay]=layout[3];
const pairs=layout.map(([x,y],index)=>holes.map((hole,id)=>({
index,id,cost:(hole.x-anchor.x-(x-ax)*scale)**2+(hole.y-anchor.y-(y-ay)*scale)**2
})).sort((a,b)=>a.cost-b.cost));
const used=new Set();let mask=0,cost=0,valid=true;
for(const pair of pairs.sort((a,b)=>a[0].cost-b[0].cost)){
const nearest=pair.find(candidate=>!used.has(candidate.id));
if(!nearest||nearest.cost>.0036){valid=false;break;}
used.add(nearest.id);cost+=nearest.cost;
if(holes[nearest.id].covered)mask|=1<<nearest.index;
}
if(valid&&cost<.017)results.push({cost,pitch:fingeringMasks.indexOf(mask)+69});
}
}
results.sort((a,b)=>a.cost-b.cost);
const best=results[0];
if(!best||best.pitch<69||results.some(item=>item.pitch!==best.pitch&&item.cost<best.cost+.0015))return null;
return best.pitch;
}

function scanTabGeometry(rgba,width,height){
const {boxes}=findFingeringBoxes(rgba,width,height,585,.55,1.9,28,25);
const candidates=boxes.map(box=>({...box,pitch:matchTabHoles(tabHoleCandidates(rgba,width,box))}));
const matches=candidates.filter(box=>box.pitch!==null);
if(!matches.length)return null;
// Reject partial matches when another similarly sized drawing is unreadable.
const reference=matches[0];
if(candidates.some(box=>box.pitch===null&&Math.abs(box.w/reference.w-1)<.2&&Math.abs(box.h/reference.h-1)<.2))return null;
const rows=[];
for(const box of matches.sort((a,b)=>a.t-b.t)){
const row=rows.find(group=>Math.abs(group[0].t-box.t)<reference.h*.4);
if(row)row.push(box);else rows.push([box]);
}
return rows.flatMap(row=>row.sort((a,b)=>a.l-b.l).map(box=>box.pitch));
}

async function readTabPitches(file){
await assertImportFile(file,'tabs');
if(!window.pdfjsLib)await loadAsset('pdf-reader.js');
const embedded=document.getElementById('osm-pdf-worker');
const workerURL=embedded?URL.createObjectURL(new Blob([embedded.textContent],{type:'text/javascript'})):'./pdf-worker.js';
let task;
try{
window.pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
task=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true});
const pdf=await task.promise;
if(pdf.numPages>ImportLimits.pdfPages)throw Error('Upload up to 30 pages at a time.');
const {info}=await pdf.getMetadata();
const prefix='osm-tab-draft-v1:';
if(info?.Keywords?.startsWith(prefix)){
const text=decodeURIComponent(info.Keywords.slice(prefix.length));
assertImportText(text,'Tab layout');
return {layout:text,pitches:[...text.matchAll(/[A-Ur]/g)].map(([code])=>nativeTabPitch(code))};
}
const labels=new Map();
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
const original=page.getViewport({scale:1});
assertImageDimensions(original.width,original.height);
const scale=Math.min(3,1800/original.width,Math.sqrt(ImportLimits.pixels/(original.width*original.height)));
const viewport=page.getViewport({scale});
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
function findFingeringBoxes(rgba,width,height,threshold,minRatio=.78,maxRatio=1.45,minWidth=22,minHeight=20){
const ink=new Uint8Array(width*height);
for(let i=0;i<ink.length;i++)ink[i]=rgba[4*i+3]>100&&rgba[4*i]+rgba[4*i+1]+rgba[4*i+2]<threshold?1:0;
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
if(w>=minWidth&&h>=minHeight&&w/h>minRatio&&w/h<maxRatio)boxes.push({l,t,w,h});
}
return {ink,boxes};
}

// STL-style diagrams have a wider outline and a different placement of the
// same twelve holes. Points are relative to a 46 × 39 outline bounding box.
const wideTabHoles=[[11,22],[6,24],[15,18],[17,14],[26,21],[36,11],
[32,13],[14,27],[40,9],[16,35],[24,12],[31,30]];
const wideTabOutline=[[43,0],[33,3],[21,9],[10,15],[2,23],[5,31],[18,31],[25,38],[29,30],[40,13],[45,3]];

function scanWideFingerings(rgba,width,height){
const {boxes}=findFingeringBoxes(rgba,width,height,585);
const candidates=boxes.filter(({w,h})=>w/h>=1.12&&w/h<=1.27);
if(!candidates.length)return null;

function brightness(x,y){
if(x<0||x>=width||y<0||y>=height)return 255;
const offset=(y*width+x)*4;
return rgba[offset+3]>128?(rgba[offset]+rgba[offset+1]+rgba[offset+2])/3:255;
}
function sample(x,y){
const left=Math.floor(x),top=Math.floor(y),fx=x-left,fy=y-top;
return (1-fy)*((1-fx)*brightness(left,top)+fx*brightness(left+1,top))+
fy*((1-fx)*brightness(left,top+1)+fx*brightness(left+1,top+1));
}
const matches=[];
for(const box of candidates){
const {l,t,w,h}=box;
const x=point=>l+(point+.5)*w/46-.5;
const y=point=>t+(point+.5)*h/39-.5;
const outline=wideTabOutline.filter(([px,py])=>[-1,0,1].some(dx=>[-1,0,1].some(dy=>
sample(x(px+dx),y(py+dy))<175)));
if(outline.length<9)continue;
const mask=wideTabHoles.reduce((bits,[px,py],i)=>bits|((sample(x(px),y(py))<75?1:0)<<i),0);
matches.push({...box,midi:fingeringMasks.indexOf(mask)+69});
}
if(matches.length<candidates.length*.8)return null;
const typicalHeight=matches.map(box=>box.h).sort((a,b)=>a-b)[Math.floor(matches.length/2)];
const rows=[];
for(const box of matches.sort((a,b)=>a.t-b.t)){
const row=rows.find(row=>Math.abs(row[0].t-box.t)<typicalHeight*.4);
if(row)row.push(box);else rows.push([box]);
}
const ordered=rows.flatMap(row=>row.sort((a,b)=>a.l-b.l));
const unreadable=ordered.findIndex(note=>note.midi<69);
if(unreadable>=0)throw Error('Could not read fingering '+(unreadable+1)+' confidently. Try a clearer crop of the tabs.');
return ordered.map(note=>note.midi);
}

function scanFingerings(canvas, context, Path=Path2D, paths=fingerPaths){
const {width,height}=canvas;
const rgba=context.getImageData(0,0,width,height).data;
const wide=scanWideFingerings(rgba,width,height);
if(wide)return wide;
const detected=scanTabGeometry(rgba,width,height);
if(detected)return detected;
const {ink,boxes}=findFingeringBoxes(rgba,width,height,690);
if(!boxes.length)throw Error('No matching ocarina diagrams found. Use a clear image with dark diagrams on a light background.');
const size=64;
const templateCanvas=document.createElement('canvas');templateCanvas.width=templateCanvas.height=size;
const sample=templateCanvas.getContext('2d',{willReadFrequently:true});
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
function parseTabText(text){
assertImportText(text,'Tab layout');
const layout=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
if(!/^[A-Ur|. :;()\[\]–—\-\s]+$/.test(layout)||!/[A-U]/.test(layout)){
throw Error('Choose a tab text file saved by the OSM Tab editor.');
}
return {layout,pitches:[...layout.matchAll(/[A-Ur]/g)].map(([code])=>nativeTabPitch(code))};
}
async function readPracticeTab(file,active){
await assertImportFile(file,'tabs');
if(/\.txt$/i.test(file.name))return parseTabText(await file.text());
const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
if((signature.join(',')==='137,80,78,71,13,10,26,10'||(signature[0]===255&&signature[1]===216&&signature[2]===255))){
await assertImportImage(file);
const bitmap=await createImageBitmap(file);
try{
assertImageDimensions(bitmap.width,bitmap.height);
const canvas=document.createElement('canvas');
canvas.width=bitmap.width;canvas.height=bitmap.height;
const context=canvas.getContext('2d',{willReadFrequently:true});
context.drawImage(bitmap,0,0);
if(!active())return [];
let pitches;
try{pitches=scanFingerings(canvas,context);}
catch{return (await teachTabLayout(canvas))??[];}
return {pitches,canvas};
}finally{bitmap.close();}
}
if(new TextDecoder().decode(signature).startsWith('%PDF-'))return readTabPitches(file);
throw Error('Choose a valid PNG, JPG, or PDF file.');
}
let pdfRequest=0;
function bindTabUpload(id,isPractice,intoEditor=false){
const input=find(id),hint=find(id+'-hint');
if(hint){
const help=hint.querySelector('button');
help.addEventListener('click',event=>{
if(event.pointerType!=='mouse'&&event.pointerType!=='pen')hint.toggleAttribute('data-open');
});
help.addEventListener('pointerleave',()=>hint.removeAttribute('data-open'));
help.addEventListener('blur',()=>hint.removeAttribute('data-open'));
}
input.addEventListener('change',async()=>{
const file=input.files[0];input.value='';
if(!file)return;
if(hint){hint.hidden=true;hint.removeAttribute('data-open');}
const request=++pdfRequest;
const active=()=>request===pdfRequest&&(isPractice?
currentPage==='practice-setup'&&practiceMode==='tabs':intoEditor?currentPage==='editor'&&editorView==='tabs':currentPage==='import');
try{
report('Reading the ocarina tabs…');
const result=await readPracticeTab(file,active);
if(!active())return;
let pitches=result.pitches??result;
const review=find('scan-review'),text=find('scan-pitches');
while(pitches.length&&active()){
text.value=pitches.map(p=>p===null?'Rest':pitchText(p)).join(' ');
find('scan-custom').hidden=!result.canvas;
review.returnValue='';review.showModal();
const choice=await new Promise(resolve=>review.addEventListener('close',()=>resolve(review.returnValue),{once:true}));
if(!active())return;
if(choice==='use')break;
if(choice!=='custom'){report('');return;}
pitches=(await teachTabLayout(result.canvas))??[];
}
if(!active()||!pitches.length){if(active())report('');return;}
const tokens=text.value.trim().split(/\s+/);
if(!tokens.length||!tokens.every(t=>/^(Rest|[A-G]#?[456])$/i.test(t)))throw Error('Use pitch names separated by spaces, or Rest.');
const reviewed=tokens.map(t=>t.toLowerCase()==='rest'?null:toMidi(t.toUpperCase()));
const layout=result.layout&&reviewed.length===pitches.length&&reviewed.every((pitch,i)=>pitch===pitches[i])?result.layout:null;
pitches=reviewed;
if(!pitches.every(Music.playable))throw Error('Use pitches between A4 and F6.');
if(isPractice){showPractice(pitches,'practice-setup',undefined,true);return;}
if(intoEditor){
stopMelody();stopStep();
nativeTabText.value=layout??defaultTabLayout(pitches.map(fingeringCode).join(''));
tabStepIndex=-1;
saveNativeTabDraft('Imported tabs');report('Imported '+pitches.length+' notes into the Tab editor.');
return;
}
if(!canReplace()){report('');return;}
const title=file.name.replace(/\.[^.]+$/,'')||'Imported score';
loadProject({id:newId(),title,author:'',notes:pitches,lengths:pitches.map(()=>4),tempo:130,intervals:[]});
draftChanged=true;openPage('editor');
report('Imported '+pitches.length+' notes. Edit their durations in the score.');
}catch(error){
if(active()){if(hint)hint.hidden=false;report(error.message);}
}
});
}
bindTabUpload('reference',true);
bindTabUpload('import-image',false);
bindTabUpload('native-tab-upload',false,true);
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
await assertImportFile(file,'project');
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
stopCustomRecording();stopCustomAudition();stopSound();stopSoundSample();soundChoice=radio.value;prepareSound()?.catch(loadError);
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


for(const [id,attribute] of [['theme','theme'],['interface-font','font']]){
  const field=find(id),key='osm-'+attribute;
  try{
    const saved=localStorage.getItem(key);
    if([...field.options].some(option=>option.value===saved))field.value=saved;
  }catch{}
  document.documentElement.dataset[attribute]=field.value;
  field.addEventListener('change',()=>{
    document.documentElement.dataset[attribute]=field.value;
    try{localStorage.setItem(key,field.value);}catch{}
  });
}

const settingsTabs=[...soundSettings.querySelectorAll('[data-settings-panel]')];
for(const tab of settingsTabs)tab.onclick=()=>{
  for(const entry of settingsTabs){
    const active=entry===tab;
    entry.setAttribute('aria-pressed',String(active));
    find('settings-'+entry.dataset.settingsPanel).hidden=!active;
  }
  if(tab.dataset.settingsPanel!=='audio')stopSoundSample();
  if(tab.dataset.settingsPanel!=='audio'){stopCustomRecording('Recording stopped.');stopCustomAudition();}
  else loadCustomSounds().catch(()=>{});
};

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

const historyPast=[], historyFuture=[];
let lastScore;
function captureEdit(){
  return {notes:[...score.pitches],lengths:[...score.lengths],intervals:[...score.intervals],performance:score.events.map(({velocity,muted})=>({velocity,muted})),tempo:score.tempo,tempoMap:score.tempoMap.map(mark=>({...mark})),meter:score.meter,key:score.key,position};
}
function updateHistoryButtons(){
  find('undo').disabled=!historyPast.length;
  find('redo').disabled=!historyFuture.length;
}
function rememberEdit(){
  const next=captureEdit();
  if(lastScore&&JSON.stringify({...lastScore,position:0})!==JSON.stringify({...next,position:0})){
    historyPast.push(lastScore);historyFuture.length=0;
    addScoreActivity('Edited score');
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
  addScoreActivity(from===historyPast?'Undid edit':'Redid edit');
  refreshSong(state.position);scheduleRecoverySnapshot();updateHistoryButtons();drawTimeline();
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
if(recording)return;
const selection=new Set(selectedNotes),anchor=selectionAnchor;
const shifted=[...selection].filter(i=>score.events[i].pitch!==null)
  .map(i=>[i,score.events[i].pitch+steps]);
if(!shifted.length)return;
if(!shifted.every(([,pitch])=>Music.validPitch(pitch))){report("That shift exceeds the supported pitch range.");return;}
shifted.forEach(([i,pitch])=>{score.events[i].pitch=pitch;});
edited(position);
selectedNotes=selection;selectionAnchor=anchor;renderNoteSelection();
previewPitch((shifted.find(([i])=>i===position)??shifted[0])[1]);
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
  assertImportText(xml,'MusicXML');
  if(/<!ENTITY/i.test(xml))throw Error('Export MusicXML without internal entity declarations.');
  const safeXML=xml.replace(/<!DOCTYPE\s+score-partwise(?:\s+(?:PUBLIC\s+["'][^"']*["']\s+["'][^"']*["']|SYSTEM\s+["'][^"']*["']))?\s*>/gi,'');
  if(/<!DOCTYPE/i.test(safeXML))throw Error('MusicXML internal document-type subsets are unsupported.');
  const doc=new DOMParser().parseFromString(safeXML,'application/xml');
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
if(!Number.isFinite(divisions)||divisions<=0)throw Error('Invalid MusicXML divisions.');
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
  const request=++pdfRequest;
  try{
    await assertImportFile(file,'musicxml');
    const imported=readMusicXML(await file.text());
    const score={...imported,id:newId(),title:imported.title||file.name.replace(/\.[^.]+$/,''),author:imported.author||''};
    if(currentPage!=='import'||request!==pdfRequest)return;
    if(!score.notes.length||!validProject(score))throw Error('No supported melody found.');
    if(!canReplace())return;
    loadProject(score);draftChanged=true;openPage('editor');
  }catch(error){if(currentPage==='import'&&request===pdfRequest)report(error.message);}
};
find('audio-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  const request=++pdfRequest;
  let ctx;
  try{
    await assertImportFile(file,'audio');
    if(micSession)stopMic();
    ctx=new Audio();
    report('Analyzing solo recording…');
    const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration>180)throw Error('Use a solo recording under three minutes.');
    if(currentPage!=='import'||request!==pdfRequest)return;
    capturedSound=[];soundNote=null;soundCandidate=null;soundEnd=0;
    const samples=buffer.getChannelData(0),windowSize=2048;
    const step=Math.round(buffer.sampleRate*.02);
    for(let offset=0;offset+windowSize<=samples.length;offset+=step){
      const frame=samples.subarray(offset,offset+windowSize);
      const hz=estimatePitch(frame,buffer.sampleRate);
      const exact=hz?69+12*Math.log2(hz/440):null,midi=exact===null?null:Math.round(exact);
      captureSoundFrame(midi,hz,midi===null?0:Math.round((exact-midi)*100),offset/buffer.sampleRate*1000);
      if(offset%(step*40)===0){await new Promise(resolve=>setTimeout(resolve,0));if(currentPage!=='import'||request!==pdfRequest)return;}
    }
    find('convert-open').open=true;stopSoundCapture();report('');
  }catch(error){if(currentPage==='import'&&request===pdfRequest)report(error.message);}
  finally{await ctx?.close().catch(()=>{});}
};

function readMIDI(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=i=>String.fromCharCode(...bytes.subarray(i,i+4));
  if(bytes.length<14||tag(0)!=='MThd')throw Error('Invalid MIDI header.');
  const headerLength=view.getUint32(4);
  if(headerLength<6||8+headerLength>bytes.length)throw Error('Incomplete MIDI header.');
  const division=view.getUint16(12), tracks=view.getUint16(10);
  if(!tracks||tracks>256)throw Error('Import a MIDI file with 1 to 256 tracks.');
  if(!division||division&32768)throw Error('MIDI must use beats as its time base.');
  const format=view.getUint16(8);
  if(format>1)throw Error('MIDI format 2 sequences are unsupported.');
  if(format===0&&tracks!==1)throw Error('MIDI format 0 must contain one track.');
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
      if(!Number.isSafeInteger(tick))throw Error('MIDI timing exceeds the supported range.');
      let command=byte();
      if(command<128){offset--;command=status;}
      if(command===255){
        status=0;
        const kind=byte(),length=vlq();
        if(offset+length>end)throw Error('Incomplete MIDI metadata.');
        if(kind===81&&length===3){
          const micros=bytes[offset]*65536+bytes[offset+1]*256+bytes[offset+2];
          if(micros)tempoEvents.set(tick,micros);
        }
        offset+=length;continue;
      }
      if(command===240||command===247){
        status=0;const length=vlq();
        if(offset+length>end)throw Error('Incomplete MIDI system event.');
        offset+=length;continue;
      }
      if(command<128||command>=240)throw Error('Unsupported MIDI event.');
      status=command;
      const kind=command>>4,key=byte(),velocity=kind===12||kind===13?0:byte();
      if(key>127||velocity>127)throw Error('Invalid MIDI data byte.');
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
await assertImportFile(file,'midi');
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


const editorViews=[...root.querySelectorAll('[data-editor-view]')];
const durationButtons=[...root.querySelectorAll('[data-editor-beats]')];
const timingPanel=find('workspace-timing');
let editorView='staff';

function updateWorkspace(){
  const title=projectName.value.trim()||'Untitled song';
  const credit=authorInput.value.trim();
  find('workspace-title').textContent=title;
  find('editor-caption').textContent=title+' — Score Editor';
  find('workspace-credit').textContent=credit;
  find('workspace-credit').hidden=!credit;
  find('workspace-empty').hidden=score.events.length>0;
  if(editorView==='staff')drawStaff();
  if(editorView==='tabs')openNativeTabEditor();
}

function updatePlaybackAvailability(){
  playBtn.disabled=!(editorView==='tabs'&&nativeTabProject===projectId?nativeTabNotes().length:score.events.length);
}

function highlightWorkspace(){
  for(const button of durationButtons){
    button.disabled=!score.events.length;
    button.setAttribute('aria-pressed',String(Number(button.dataset.editorBeats)===score.events[position]?.ticks/4));
  }
  for(const [index,glyphs] of scoreGroups){
    for(const glyph of glyphs)glyph.classList.toggle('osm-staff-selected',selectedNotes.has(index));
  }
}

function switchEditorView(view){
  if(editorView!==view&&heldStepKey)stopStep();
  if(editorView==='tabs'&&view!=='tabs'&&melody?.customTabs)stopMelody();
  editorView=view;
  find('score-desk').hidden=view==='tabs';
  for(const button of editorViews){
    const active=button.dataset.editorView===view;
    button.setAttribute('aria-pressed',String(active));
    document.getElementById(button.getAttribute('aria-controls')).hidden=!active;
  }
  updateWorkspace();
  if(view==='tabs'&&scorePlaybackIndex>=0&&tabPlayback.hidden&&tabNotesMatchScore(nativeTabNotes())){
    prepareTabPlayback();
    highlightTabPlayback(scorePlaybackIndex);
  }
  updatePlaybackAvailability();
}

for(const button of editorViews)button.onclick=()=>switchEditorView(button.dataset.editorView);
find('workspace-zoom').onchange=event=>find('workspace-paper').style.setProperty('--osm-zoom',Number(event.target.value));
timingPanel.addEventListener('toggle',()=>{if(currentPage==='editor'&&editorView==='staff')drawStaff();});

for(const button of durationButtons)button.onclick=()=>{
  if(recording||!score.events.length)return;
  beatsEditor.value=button.dataset.editorBeats;
  beatsEditor.dispatchEvent(new Event('change'));
};

const menuBar=root.querySelector('.osm-menubar');
const editorMenus=[...menuBar.querySelectorAll('details')];
const exportToggle=find('export-toggle'),exportOptions=find('export-options');
const exportMenu=exportToggle.parentElement;
function setExportMenu(open){
  exportOptions.hidden=!open;
  exportToggle.setAttribute('aria-expanded',String(open));
}
exportMenu.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')setExportMenu(true);});
exportMenu.addEventListener('pointerleave',()=>{
  if(!exportMenu.contains(document.activeElement))setExportMenu(false);
});
exportMenu.addEventListener('focusout',event=>{
  if(!exportMenu.contains(event.relatedTarget)&&!exportMenu.matches(':hover'))setExportMenu(false);
});
exportToggle.onclick=()=>setExportMenu(true);
function closeEditorMenus(except){
  setExportMenu(false);
  for(const menu of editorMenus)if(menu!==except)menu.open=false;
}
menuBar.addEventListener('click',event=>{
  const summary=event.target.closest('summary');
  if(summary){
    const menu=summary.parentElement;
    closeEditorMenus(menu);
    for(const item of menu.querySelectorAll('[data-editor-command]')){
      item.disabled=item.dataset.editorCommand==='delete-score'
        ? !projects.some(project=>project.id===projectId)
        : Boolean(document.getElementById('oc93-'+item.dataset.editorCommand)?.disabled);
    }
    return;
  }
  const item=event.target.closest('[data-editor-command]');
  if(!item)return;
  const [command,value]=item.dataset.editorCommand.split(':');
  const summaryButton=item.closest('details').querySelector('summary');
  closeEditorMenus();
  summaryButton.focus({preventScroll:true});
  if(command.startsWith('@'))openPage(command.slice(1));
  else if(command==='score-preview')openScorePreview();
  else if(command==='recovery')openRecovery();
  else if(command==='rename-score')openRenameScore();
  else if(command==='delete-score'){
    const saved=projects.find(project=>project.id===projectId);
    if(saved)deleteSavedScore(saved);
  }else if(command==='piano-roll')openPianoRoll();
  else if(command==='view')switchEditorView(value);
  else if(command==='zoom'){
    const zoom=find('workspace-zoom');
    zoom.value=value;zoom.dispatchEvent(new Event('change'));
  }else if(command==='toggle'){
    root.querySelector('.osm-workspace').classList.toggle('osm-hide-'+value);
  }else if(command==='panel'){
    const panel=find(value);panel.open=!panel.open;
    if(panel.open)panel.scrollIntoView({block:'nearest'});
  }else if(command==='editor-help'){
    openPage('help');
    const topic=find('editor-help-section');
    topic.parentElement.open=true;topic.focus();topic.scrollIntoView({block:'start'});
  }else if(command==='editor-tour'){
    startTutorial(tutorialSteps.findIndex(step=>step[0]==='Score editing'));
  }else if(item.id!=='oc93-'+command)find(command).click();
});
document.addEventListener('pointerdown',event=>{if(!menuBar.contains(event.target))closeEditorMenus();});
document.addEventListener('keydown',event=>{
  const open=editorMenus.find(menu=>menu.open);
  if(!open)return;
  if(event.key==='Escape'){
    event.preventDefault();
    if(!exportOptions.hidden){setExportMenu(false);exportToggle.focus();return;}
    closeEditorMenus();open.querySelector('summary').focus();
  }else if(['ArrowDown','ArrowUp'].includes(event.key)&&open.contains(event.target)){
    event.preventDefault();
    const items=[...open.querySelectorAll('button:not(:disabled)')].filter(button=>!button.closest('[hidden]'));
    const index=items.indexOf(document.activeElement);
    const next=index<0?(event.key==='ArrowDown'?0:items.length-1):
      (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
});

const rollWindow=find('piano-roll'),rollScroll=find('roll-scroll');
const rollKeys=find('roll-class');
names.forEach((label,i)=>rollKeys.add(new Option(label,i)));
const rollRow=22;
let rollGrid,rollCursor,rollFrame,rollPlayback;
let rollNotes=[];
const rollScale=()=>Number(find('roll-zoom').value);
const rollStep=()=>Number(find('roll-grid').value);
const rollSnap=tick=>Math.round(tick/(find('roll-snap').checked?rollStep():.125))*(find('roll-snap').checked?rollStep():.125);
const rollTotal=()=>score.lengths.reduce((sum,ticks)=>sum+ticks,0);

function drawTimeline(){
  if(!rollWindow.open)return;
  let tick=0;
  rollNotes=score.events.flatMap((event,index)=>{
    const start=tick;tick+=event.ticks;
    return event.pitch===null?[]:[{...event,index,start}];
  });
  const low=Math.min(69,...rollNotes.map(note=>note.pitch));
  const high=Math.max(89,...rollNotes.map(note=>note.pitch));
  const scale=rollScale();
  const content=document.createElement('div');content.className='roll-content';
  const keyboard=document.createElement('div');keyboard.className='roll-keyboard';
  rollGrid=document.createElement('div');rollGrid.className='roll-grid';
  const measure=meterTicks(score.meter);
  const length=Math.max(measure*2,Math.ceil((tick+measure)/measure)*measure);
  rollGrid.style.width=length*scale+'px';
  rollGrid.style.height=((high-low+1)*rollRow+26)+'px';
  rollGrid.style.setProperty('--roll-beat',4*scale+'px');
  rollGrid.style.setProperty('--roll-step',Math.max(2,rollStep()*scale)+'px');
  rollGrid.style.setProperty('--roll-measure',measure*scale+'px');
  const ruler=document.createElement('div');ruler.className='roll-ruler';
  for(let t=0;t<length;t+=measure){
    const marker=document.createElement('span');
    marker.textContent=String(1+Math.round(t/measure));marker.style.left=t*scale+'px';
    ruler.append(marker);
  }
  rollGrid.append(ruler);
  const isBlack=pitch=>names[pitch%12].includes('♯');
  for(let pitch=high;pitch>=low;pitch--){
    const black=isBlack(pitch);
    const top=26+(high-pitch)*rollRow;
    const before=!black&&pitch<high&&isBlack(pitch+1)?rollRow/2:0;
    const after=!black&&pitch>low&&isBlack(pitch-1)?rollRow/2:0;
    const key=document.createElement('button');
    key.type='button';key.className=black?'roll-black-key':'roll-white-key';
    key.style.top=(black?top+2:top-before)+'px';
    key.style.height=(black?rollRow-4:rollRow+before+after)+'px';
    key.title=name(pitch);key.setAttribute('aria-label','Audition '+name(pitch));
    const labels=find('roll-key-labels').value;
    if(labels==='all'||(labels==='octaves'&&pitch%12===0))key.textContent=name(pitch);
    key.onclick=()=>previewPitch(pitch);
    keyboard.append(key);
  }
  for(const note of rollNotes){
    const button=document.createElement('button');
    button.type='button';button.className='roll-note';
    const label=document.createElement('span');
    label.textContent=name(note.pitch);label.hidden=!find('roll-note-labels').checked;
    button.append(label);
    button.setAttribute('aria-label',name(note.pitch));
    button.title=name(note.pitch)+' · Beat '+(1+note.start/4)+' · Velocity '+(note.velocity??100);
    button.style.left=note.start*scale+'px';
    button.style.top=(26+(high-note.pitch)*rollRow+2)+'px';
    button.style.width=Math.max(2,note.ticks*scale)+'px';
    button.classList.toggle('roll-muted',Boolean(note.muted));
    button.dataset.index=note.index;
    const grip=document.createElement('span');grip.className='roll-resize';button.append(grip);
    button.onclick=event=>{selectPosition(note.index,event);updateRollSelection();};
    button.onpointerdown=event=>dragRollNote(event,button,note,grip,low,high);
    rollGrid.append(button);
  }
  rollCursor=document.createElement('div');rollCursor.className='roll-cursor';rollCursor.hidden=!rollPlayback;
  rollGrid.append(rollCursor);
  rollGrid.ondblclick=event=>{
    if(event.target!==rollGrid||recording)return;
    const rect=rollGrid.getBoundingClientRect(),y=event.clientY-rect.top-26;
    if(y<0)return;
    const start=Math.max(0,rollSnap((event.clientX-rect.left)/scale));
    const pitch=high-Math.floor(y/rollRow);
    const next={pitch,start,ticks:rollStep()};
    commitRollNotes([...rollNotes,next],next);
  };
  const {scrollLeft,scrollTop}=rollScroll;
  content.append(keyboard,rollGrid);rollScroll.replaceChildren(content);
  rollScroll.scrollLeft=scrollLeft;rollScroll.scrollTop=scrollTop;
  updateRollSelection();
}

function updateRollSelection(){
  if(!rollWindow.open||!rollGrid)return;
  const selected=rollNotes.filter(note=>selectedNotes.has(note.index));
  for(const card of rollGrid.querySelectorAll('.roll-note')){
    card.setAttribute('aria-pressed',String(selectedNotes.has(Number(card.dataset.index))));
  }
  for(const id of ['roll-delete','roll-mute','roll-velocity'])find(id).disabled=!selected.length;
  const active=selected.find(note=>note.index===position)??selected.at(-1);
  find('roll-start').disabled=selected.length!==1;
  find('roll-duration').disabled=selected.length!==1;
  find('roll-start').value=active?active.start/4:'';
  find('roll-duration').value=active?active.ticks/4:'';
  find('roll-velocity').value=active?(active.velocity??100):'';
  find('roll-status').textContent=selected.length+' selected · '+rollNotes.length+' notes';
}

function commitRollNotes(notes,focus){
  notes.sort((a,b)=>a.start-b.start);
  let end=0,selectedIndex=0;
  const events=[];
  for(const note of notes){
    const gap=note.start-end;
    if(gap<-.00001){
      find('roll-status').textContent='Notes overlap. Move the note to free space or shorten it.';
      return false;
    }
    if(gap>.00001)events.push({pitch:null,ticks:gap,ms:null});
    if(note===focus)selectedIndex=events.length;
    events.push({pitch:note.pitch,ticks:note.ticks,velocity:note.velocity,muted:note.muted,ms:null});
    end=note.start+note.ticks;
  }
  const tail=rollTotal()-end;
  if(tail>.00001)events.push({pitch:null,ticks:tail,ms:null});
  score.events=events;
  edited(selectedIndex,true);
  return true;
}

function dragRollNote(event,button,note,grip,low,high){
  if(event.button!==0||recording||event.shiftKey||event.metaKey||event.ctrlKey)return;
  const x=event.clientX,y=event.clientY,resize=event.target===grip;
  const scale=rollScale();
  let draft;
  button.setPointerCapture(event.pointerId);
  button.onpointermove=move=>{
    const dx=move.clientX-x,dy=move.clientY-y;
    if(!draft&&Math.abs(dx)+Math.abs(dy)<4)return;
    draft={...note};
    if(resize)draft.ticks=Math.max(.125,rollSnap(note.ticks+dx/scale));
    else{
      draft.start=Math.max(0,rollSnap(note.start+dx/scale));
      draft.pitch=Math.min(high,Math.max(low,note.pitch-Math.round(dy/rollRow)));
    }
    button.style.left=draft.start*scale+'px';
    button.style.top=(26+(high-draft.pitch)*rollRow+2)+'px';
    button.style.width=Math.max(2,draft.ticks*scale)+'px';
    button.firstChild.textContent=name(draft.pitch);
  };
  button.onpointerup=()=>{
    button.onpointermove=null;
    if(!draft)return;
    if(!commitRollNotes(rollNotes.map(entry=>entry===note?draft:entry),draft)){
      const message=find('roll-status').textContent;
      drawTimeline();find('roll-status').textContent=message;
    }
  };
  button.onpointercancel=drawTimeline;
}

function changeRollPerformance(change){
  if(recording)return;
  const selected=new Set(selectedNotes);
  const anchor=selectionAnchor;
  const indexes=rollNotes.filter(note=>selected.has(note.index)).map(note=>note.index);
  if(!indexes.length)return;
  change(indexes.map(index=>score.events[index]));
  edited(position);
  selectedNotes=selected;selectionAnchor=anchor;renderNoteSelection();updateRollSelection();
}

function editRollTiming(humanize){
  if(recording)return;
  const step=rollStep();
  const swing=Math.min(75,Math.max(50,Number(find('roll-swing').value)||50));
  const selected=rollNotes.filter(note=>selectedNotes.has(note.index));
  const targets=new Set(selected.length>1?selected:rollNotes);
  const notes=rollNotes.map(note=>{
    if(!targets.has(note))return note;
    const subdivision=Math.round(note.start/step);
    const start=humanize?note.start+(Math.random()-.5)*Math.max(.25,step*.4):
      subdivision*step+(subdivision%2?step*(swing/50-1):0);
    return {...note,start:Math.max(0,Math.round(start*8)/8)};
  });
  for(let i=0;i<notes.length-1;i++){
    const gap=notes[i+1].start-notes[i].start;
    if(gap>=.125&&targets.has(rollNotes[i]))notes[i].ticks=Math.min(notes[i].ticks,gap);
  }
  commitRollNotes(notes,notes.find(note=>note.index===position));
}

function stopRollCursor(){
  cancelAnimationFrame(rollFrame);rollFrame=null;rollPlayback=null;
  if(rollCursor)rollCursor.hidden=true;
}

function pauseRollCursor(){
  cancelAnimationFrame(rollFrame);rollFrame=null;rollPlayback=null;
}

function startRollCursor(index,duration,elapsed=0){
  cancelAnimationFrame(rollFrame);
  const start=score.events.slice(0,index).reduce((sum,event)=>sum+event.ticks,0);
  rollPlayback={start,length:score.events[index].ticks,time:performance.now()-elapsed,duration};
  if(rollWindow.open)animateRollCursor();
}

function animateRollCursor(){
  if(!rollPlayback||!rollWindow.open||!rollCursor)return;
  const {start,length,time,duration}=rollPlayback;
  const x=(start+length*Math.min(1,(performance.now()-time)/duration))*rollScale();
  rollCursor.hidden=false;rollCursor.style.left=x+'px';
  if(find('roll-follow').checked&&
    (x<rollScroll.scrollLeft||x>rollScroll.scrollLeft+rollScroll.clientWidth-85)){
    rollScroll.scrollLeft=Math.max(0,x-35);
  }
  rollFrame=requestAnimationFrame(animateRollCursor);
}

function openPianoRoll(){
  if(rollWindow.open)return;
  rollWindow.show();
  if(rollWindow.style.inset){const {left,top}=rollWindow.getBoundingClientRect();placeRollWindow(left,top);}
  drawTimeline();
  if(rollPlayback)animateRollCursor();
}

find('roll-close').onclick=()=>rollWindow.close();
find('roll-play').onclick=()=>play(false);
find('roll-stop').onclick=stopMelody;
for(const id of ['roll-grid','roll-zoom','roll-key-labels','roll-note-labels'])find(id).onchange=drawTimeline;
for(const [id,property,min] of [['roll-start','start',0],['roll-duration','ticks',.125]]){
  find(id).onchange=event=>{
    if(recording||selectedNotes.size!==1||!event.target.value)return;
    const note=rollNotes.find(entry=>selectedNotes.has(entry.index));
    if(!note)return;
    const draft={...note,[property]:Math.max(min,rollSnap(Number(event.target.value)*4))};
    if(!commitRollNotes(rollNotes.map(entry=>entry===note?draft:entry),draft)){
      const message=find('roll-status').textContent;
      updateRollSelection();find('roll-status').textContent=message;
    }
  };
}
find('roll-delete').onclick=()=>{
  if(!recording&&rollNotes.some(note=>selectedNotes.has(note.index)))commitRollNotes(rollNotes.filter(note=>!selectedNotes.has(note.index)));
};
find('roll-mute').onclick=()=>changeRollPerformance(events=>{
  const mute=events.some(event=>!event.muted);
  events.forEach(event=>event.muted=mute);
});
find('roll-velocity').onchange=event=>changeRollPerformance(events=>{
  const value=Math.max(1,Math.min(127,Math.round(Number(event.target.value)||100)));
  events.forEach(note=>note.velocity=value);
});
find('roll-quantize').onclick=()=>editRollTiming(false);
find('roll-humanize').onclick=()=>editRollTiming(true);
find('roll-select').onclick=()=>{
  const pitch=rollKeys.value,length=find('roll-length').value,velocity=find('roll-match').value;
  const indexes=rollNotes.filter(note=>(pitch===''||note.pitch%12===Number(pitch))&&
    (length===''||Math.abs(note.ticks/4-Number(length))<.00001)&&
    (velocity===''||(note.velocity??100)===Number(velocity))).map(note=>note.index);
  selectedNotes=new Set(indexes);
  if(indexes.length)position=selectionAnchor=indexes[0];
  renderNoteSelection();updateRollSelection();
};
rollWindow.addEventListener('keydown',event=>{
  if(event.key==='Escape'){rollWindow.close();return;}
  if(!editable(event.target)&&['Delete','Backspace'].includes(event.key)){
    event.preventDefault();find('roll-delete').click();
  }
});

const rollTitleBar=rollWindow.querySelector('header');
function placeRollWindow(left,top){
  const width=rollWindow.offsetWidth,height=rollWindow.offsetHeight;
  rollWindow.style.inset=Math.max(0,Math.min(top,innerHeight-height))+'px auto auto '+
    Math.max(0,Math.min(left,innerWidth-width))+'px';
}
rollTitleBar.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button'))return;
  const {left,top}=rollWindow.getBoundingClientRect();
  const x=event.clientX-left,y=event.clientY-top;
  rollTitleBar.setPointerCapture(event.pointerId);
  rollTitleBar.onpointermove=move=>placeRollWindow(move.clientX-x,move.clientY-y);
});
rollTitleBar.addEventListener('lostpointercapture',()=>{rollTitleBar.onpointermove=null;});
window.addEventListener('resize',()=>{
  if(!rollWindow.open||!rollWindow.style.inset)return;
  const {left,top}=rollWindow.getBoundingClientRect();
  placeRollWindow(left,top);
});


find('editor-home').onclick=()=>find('home').click();
for(const handle of rollWindow.querySelectorAll('[data-roll-size]')){
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const {left,top,width,height}=rollWindow.getBoundingClientRect();
    const {clientX:x,clientY:y}=event;
    const axis=handle.dataset.rollSize;
    placeRollWindow(left,top);
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove=move=>{
      const availableWidth=innerWidth-left,availableHeight=innerHeight-top;
      if(axis!=='height')rollWindow.style.width=Math.min(availableWidth,Math.max(360,width+move.clientX-x))+'px';
      if(axis!=='width')rollWindow.style.height=Math.min(availableHeight,Math.max(240,height+move.clientY-y))+'px';
    };
  });
  handle.addEventListener('lostpointercapture',()=>{handle.onpointermove=null;});
}

let recoveryTimer=null,recoveryDirty=false,recoveryRestoring=false;
function scheduleRecoverySnapshot(){
if(recoveryRestoring||projectId===null)return;
recoveryDirty=true;
clearTimeout(recoveryTimer);
recoveryTimer=setTimeout(flushRecoverySnapshot,750);
}
function flushRecoverySnapshot(reason='Automatic recovery'){
clearTimeout(recoveryTimer);recoveryTimer=null;
if(!recoveryDirty||recoveryRestoring||projectId===null)return;
try{
projectStorage.checkpoint(snapshot(),typeof reason==='string'?reason:'Automatic recovery');
recoveryDirty=false;
}catch(error){
report('Automatic recovery could not be saved. Download a project backup. '+error.message);
}
}
function openRecovery(){
flushRecoverySnapshot();
const list=find('recovery-list'),status=find('recovery-status');
list.replaceChildren();status.textContent='';
const original=find('recovery-original');
original.hidden=true;
try{
const raw=localStorage.getItem(storageKey+'-recovery')??(projectStorage.blocked?localStorage.getItem(storageKey):null);
if(raw){original.hidden=false;original.onclick=()=>download('osm-original-saved-data.json',raw);}
}catch{}
try{
const entries=projectStorage.checkpoints();
if(!entries.length)status.textContent='No recovery snapshots yet. Snapshots are created as you edit.';
for(const entry of entries){
const row=document.createElement('div');row.className='osm-recovery-row';
const description=document.createElement('span');
description.textContent=entry.project.title+' · '+entry.project.notes.length+' notes · '+new Date(entry.createdAt).toLocaleString();
const restore=document.createElement('button');restore.type='button';restore.className='ctrl';restore.textContent='Restore copy';
restore.onclick=()=>{
flushRecoverySnapshot();
recoveryRestoring=true;
try{
const project=migrateProject(entry.project);
project.id=newId();project.title+=' (recovered)';
loadProject(project);draftChanged=true;
find('recovery').close();openPage('editor');
report('Recovered copy opened. Save score to keep it in Recent scores.');
}finally{recoveryRestoring=false;}
scheduleRecoverySnapshot();
};
const backup=document.createElement('button');backup.type='button';backup.className='ctrl';backup.textContent='Download backup';
backup.onclick=()=>download('ocarina-recovery.json',JSON.stringify(entry.project,null,2));
row.append(description,restore,backup);list.append(row);
}
}catch(error){status.textContent=error.message;}
find('recovery').showModal();
}
find('recovery-open').onclick=openRecovery;
window.addEventListener('pagehide',flushRecoverySnapshot);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushRecoverySnapshot();});
window.addEventListener('storage',event=>{
if(event.key===storageKey&&event.newValue)report('Another OSM tab updated saved scores. Download a backup of current edits, then reload before saving.');
});

restoreSavedProjects();
loadProject(projects.find(p=>p.id===projectId)??projects[0]??emptyProject());

window.addEventListener('beforeunload',e=>{if(draftChanged){e.preventDefault();e.returnValue='';}});
window.addEventListener('blur',()=>{stopStep();stopMelody();for(const id of [...voices.keys()])end(id)});

})();
