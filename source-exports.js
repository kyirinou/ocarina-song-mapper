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
