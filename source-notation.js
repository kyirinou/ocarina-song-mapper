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
const staff=find('staff');
if(!score.events.length){staff.replaceChildren();scoreGroups.clear();return;}
if(!window.ABCJS){loadNotation().then(()=>{if(currentPage==='editor'&&editorView==='staff')drawStaff();}).catch(loadError);return;}
const showTake=scorePlaybackIndex<0&&timingPanel.open&&!find('score').hidden&&take.length;
const entries=showTake?take:scoreEntries();
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
