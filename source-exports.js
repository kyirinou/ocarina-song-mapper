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
