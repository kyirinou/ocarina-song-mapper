export const Music = {
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
export function toMidi(text){
  const match=typeof text==='string'&&text.trim().match(/^([A-G])([#♯b♭]?)([0-9])$/i);
  if(!match)throw Error('Use a pitch such as A4 or D#5.');
  const pitch=(Number(match[3])+1)*12+pitchClasses[match[1].toUpperCase()]+
    (['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0);
  if(!Music.validPitch(pitch))throw Error('Pitch is outside C0–G9.');
  return pitch;
}
export function pitchName(pitch){
  if(pitch===null)return 'Rest';
  if(!Music.validPitch(pitch))throw Error('Invalid pitch.');
  return pitchNames[pitch%12]+(Math.floor(pitch/12)-1);
}
export function meterTicks(value){
  const match=typeof value==='string'&&value.match(/^([1-9]|1[0-9]|2[0-4])\/(2|4|8|16)$/);
  return match?16*Number(match[1])/Number(match[2]):0;
}
export function validateProject(p){
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
export function migrateProject(project){
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

export function detectPitch(samples,rate){
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
