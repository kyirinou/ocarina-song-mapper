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
for(const field of [projectName,authorInput])field.addEventListener('input',()=>{
if(!find('score').hidden&&!recording)updateNotation();
});

const svgNS='http://www.w3.org/2000/svg';
const tabLayout=find('tabs-text'),tabTitle=find('tab-title'),tabAuthor=find('tab-author');
const tabPreview=find('tab-preview'),tabStatus=find('tab-status');
let layoutSequence='', tabCache=new Map();
function scoreEntries(){
return score.pitches.map((m,index)=>({index,pitch:pitchText(m),beats:score.events[index].ticks/4}));
}
function defaultTabLayout(sequence){
return (sequence.match(/.{1,5}/g)||[]).join('\n');
}
function syncTabLayout(reset=false){
const sequence=score.pitches.map(fingeringCode).join('');
if(reset||sequence!==layoutSequence){
tabLayout.value=defaultTabLayout(sequence);
layoutSequence=sequence;tabPreview.replaceChildren();
}
if(reset){tabTitle.value='';tabAuthor.value='';}
}
function tabRows(){
if(!score.pitches.every(Music.playable))throw Error("Shift yellow notes into A4–F6 before exporting fingering tabs.");
if(!score.events.length)throw Error('Add notes before exporting tabs.');
const value=tabLayout.value.replace(/\r/g,'');
if(value.replace(/\s/g,'')!==layoutSequence)throw Error('Keep the note codes in order. Edit pitches in the Score Editor and use this box to add spaces or line breaks.');
let index=0;
return value.split('\n').map(row=>[...row.trimEnd()].map(char=>char===' '||char==='\t'?null:index++));
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
function makeTabRhythm(index){
const midi=score.events[index].pitch,ticks=Math.max(1,Math.round(score.events[index].ticks));
const key=midi+':'+ticks;
if(tabCache.has(key))return tabCache.get(key).cloneNode(true);
let left=ticks;
const parts=[];
while(left>0){
const size=[16,12,8,6,4,3,2,1].find(n=>n<=left);
parts.push(size);left-=size;
}
if(midi===null){
const host=document.createElement('div');host.className='export-staging';document.body.append(host);
try{window.ABCJS.renderAbc(host,'X:1\nM:none\nL:1/16\nK:C\nz'+ticks,{staffwidth:80});return host.querySelector('svg');}
finally{host.remove();}
}
const [,letter,sharp,octave]=pitchText(midi).match(/^([A-G])(#?)(\d)$/);
const step=(Number(octave)-4)*7+'CDEFGAB'.indexOf(letter)-2;
const y=54-step*3;
const width=Math.max(55,parts.length*25+20);
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('viewBox','0 0 '+width+' 76');svg.setAttribute('width',width);svg.setAttribute('height',76);
const ink='#172126';
const line=(x1,y1,x2,y2)=>rhythmShape(svg,'line',{x1,y1,x2,y2,stroke:ink,'stroke-width':.8});
for(let i=0;i<5;i++)line(3,30+i*6,width-3,30+i*6);
parts.forEach((duration,i)=>{
const x=(width-(parts.length-1)*25)/2+i*25;
for(let ledger=10;ledger<=step;ledger+=2)line(x-7,54-ledger*3,x+7,54-ledger*3);
for(let ledger=-2;ledger>=step;ledger-=2)line(x-7,54-ledger*3,x+7,54-ledger*3);
rhythmShape(svg,'ellipse',{cx:x,cy:y,rx:4.3,ry:2.8,transform:'rotate(-18 '+x+' '+y+')',stroke:ink,fill:duration>=8?'white':ink});
if(sharp&&i===0){
const px=x-9;
line(px-1,y-6,px-1,y+6);line(px+2,y-7,px+2,y+5);
line(px-3,y-1,px+4,y-3);line(px-3,y+3,px+4,y+1);
}
if(duration<16){
const down=step>=4, direction=down?1:-1,stem=x+(down?-4:4),endY=y+direction*17;
line(stem,y,stem,endY);
const flags=duration===1?2:duration<4?1:0;
for(let flag=0;flag<flags;flag++){
const tip=endY-direction*flag*5;
rhythmShape(svg,'path',{d:'M '+stem+' '+tip+' q 2 '+(-direction*4)+' 5 '+(-direction*6)+' q 3 '+(-direction*4)+' 1 '+(-direction*8),fill:'none',stroke:ink});
}
}
if([3,6,12].includes(duration))rhythmShape(svg,'circle',{cx:x+7,cy:step%2===0?y-3:y,r:1.15,fill:ink});
if(i<parts.length-1)rhythmShape(svg,'path',{d:'M '+(x+4)+' '+(y+5)+' q 8.5 7 17 0',fill:'none',stroke:ink});
});
tabCache.set(key,svg.cloneNode(true));
return svg;
}
function tabMetadata(){
return {title:tabTitle.value.trim()||projectName.value.trim()||'Untitled song',credit:tabAuthor.value.trim()||authorInput.value.trim()};
}
async function previewTabs(){
try{
if(score.pitches.includes(null))await loadNotation();
const rows=tabRows(), {title,credit}=tabMetadata();
const heading=document.createElement('h3');heading.textContent=title;
const byline=document.createElement('p');byline.textContent=credit;
tabPreview.replaceChildren(heading);
if(credit)tabPreview.append(byline);
for(const row of rows){
const line=document.createElement('div');line.className='tab-row';tabPreview.append(line);
for(const index of row){
const cell=document.createElement('div');
if(index===null){cell.className='tab-gap';line.append(cell);continue;}
cell.className='tab-cell';
const label=document.createElement('small');label.textContent=(index+1)+' · '+name(score.events[index].pitch);
cell.append(makeFinger(score.events[index].pitch),makeTabRhythm(index),label);line.append(cell);
}
}
tabStatus.textContent='Preview updated.';
}catch(error){tabStatus.textContent=error.message;}
}
function selectExport(){
const kind=find('export-kind').value;
find('music-panel').hidden=kind!=='music';
find('tabs-panel').hidden=kind!=='tabs';
find('backup').hidden=kind!=='backup';
}
find('export-kind').addEventListener('change',selectExport);
find('tab-preview-button').addEventListener('click',previewTabs);
find('tabs-reset').addEventListener('click',()=>{syncTabLayout(true);draftChanged=true;tabStatus.textContent='Default layout restored.';});
find('copy-tabs').addEventListener('click',()=>{
try{tabRows();copyField(tabLayout,'Tab codes copied. Paste them into Ocarina Tabs Creator.');}
catch(error){tabStatus.textContent=error.message;}
});
function pdfHeader(title,credit){
const pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4'});
pdf.setProperties({title,author:credit});
const margin=42,width=pdf.internal.pageSize.getWidth()-2*margin,bottom=pdf.internal.pageSize.getHeight()-margin;
let y=margin;
pdf.setFontSize(22);
const heading=pdf.splitTextToSize(title,width);
pdf.text(heading,margin,y+22);y+=heading.length*26+8;
if(credit){
pdf.setFontSize(12);
const lines=pdf.splitTextToSize(credit,width);
pdf.text(lines,margin,y+12);y+=lines.length*15+8;
}
return {pdf,margin,width,bottom,y};
}
function savePDF(pdf,title,suffix=''){
const filename=title.replace(/[\\/:*?"<>|]/g,'-').trim()||'ocarina-score';
pdf.save(filename+suffix+'.pdf');
}
async function svgInBox(pdf,svg,x,y,width,height){
const view=(svg.getAttribute('viewBox')||'').split(/[ ,]+/).map(Number);
const w=view[2]||parseFloat(svg.getAttribute('width')), h=view[3]||parseFloat(svg.getAttribute('height'));
if(!(w>0&&h>0))throw Error('A diagram has no printable dimensions.');
const scale=Math.min(width/w,height/h);
await pdf.svg(svg,{x:x+(width-w*scale)/2,y:y+(height-h*scale)/2,width:w*scale,height:h*scale});
}
function tabArtwork(){
const rows=tabRows(), {title,credit}=tabMetadata();
const width=740,cell=110,line=108;
const slots=[];
let y=92;
for(const row of rows){
let x=24;
for(const index of row){
if(index===null){x+=22;continue;}
if(x+cell>width-18){x=24;y+=line;}
slots.push({index,x,y});x+=cell;
}
y+=row.length?line:20;
}
if(y>16000)throw Error('This layout is too tall for one image. Use the paginated PDF.');
const root=document.createElementNS(svgNS,'svg');
root.setAttribute('xmlns',svgNS);root.setAttribute('width',width);root.setAttribute('height',y);
rhythmShape(root,'rect',{width,height:y,fill:'#fff'});
function label(text,x,y,size){
rhythmShape(root,'text',{x,y,'font-size':size,'font-family':'sans-serif',fill:'#172126'});
root.lastChild.textContent=text;
}
label(title,24,36,24);if(credit)label(credit,24,60,14);
for(const {index,x,y} of slots){
const figures=[makeFinger(score.events[index].pitch),makeTabRhythm(index)];
figures.forEach((svg,i)=>{
svg.setAttribute('x',x);svg.setAttribute('y',y+(i?52:0));
svg.setAttribute('width',cell-12);svg.setAttribute('height',i?34:50);
root.append(svg);
});
label((index+1)+' · '+pitchText(score.events[index].pitch),x+26,y+98,11);
}
return {data:new XMLSerializer().serializeToString(root),width,height:y};
}
function saveArtwork(blob,extension){
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download=tabMetadata().title.replace(/[\\/:*?"<>|]/g,'-')+' - tabs.'+extension;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}
find('tabs-svg').onclick=async()=>{
try{if(score.pitches.includes(null))await loadNotation();saveArtwork(new Blob([tabArtwork().data],{type:'image/svg+xml'}),'svg');}catch(error){tabStatus.textContent=error.message;}
};
find('tabs-png').onclick=async()=>{
let url;
try{
if(score.pitches.includes(null))await loadNotation();
const art=tabArtwork();
url=URL.createObjectURL(new Blob([art.data],{type:'image/svg+xml'}));
const image=new Image();image.src=url;await image.decode();
const canvas=document.createElement('canvas');canvas.width=art.width*2;canvas.height=art.height*2;
canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
if(!blob)throw Error('Could not create PNG.');
saveArtwork(blob,'png');
}catch(error){tabStatus.textContent=error.message;}
finally{if(url)URL.revokeObjectURL(url);}
};
find('tabs-pdf').addEventListener('click',async()=>{
const button=find('tabs-pdf');
button.disabled=true;
try{
await loadPDFExport();
const rows=tabRows(), {title,credit}=tabMetadata();
const {pdf,margin,width,bottom,y:startY}=pdfHeader(title,credit);
const cellWidth=width/6,cellHeight=94,gap=cellWidth/5;
let y=startY,x=margin;
for(const row of rows){
if(y+cellHeight>bottom){pdf.addPage();y=margin;}
for(const index of row){
if(index===null){x+=gap;continue;}
if(x+cellWidth>margin+width+.01){x=margin;y+=cellHeight;}
if(y+cellHeight>bottom){pdf.addPage();y=margin;}
await svgInBox(pdf,makeFinger(score.events[index].pitch),x+8,y,cellWidth-16,45);
await svgInBox(pdf,makeTabRhythm(index),x+4,y+45,cellWidth-8,36);
pdf.setFontSize(8);pdf.text((index+1)+' · '+pitchText(score.events[index].pitch),x+cellWidth/2,y+88,{align:'center'});
x+=cellWidth;
}
x=margin;y+=row.length?cellHeight:24;
}
savePDF(pdf,title,' - ocarina tabs');tabStatus.textContent='Fingering PDF exported.';
}catch(error){tabStatus.textContent=error.message;}
finally{button.disabled=false;}
});

for(const field of [tabLayout,tabTitle,tabAuthor])field.addEventListener('input',()=>{draftChanged=true;});
