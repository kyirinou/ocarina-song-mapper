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

