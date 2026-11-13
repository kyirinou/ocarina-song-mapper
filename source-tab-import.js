async function readTabPitches(file){
if(!window.pdfjsLib)await loadAsset('pdf-reader.js');
const embedded=document.getElementById('osm-pdf-worker');
const workerURL=embedded?URL.createObjectURL(new Blob([embedded.textContent],{type:'text/javascript'})):'./pdf-worker.js';
let task;
try{
window.pdfjsLib.GlobalWorkerOptions.workerSrc=workerURL;
task=window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true});
const pdf=await task.promise;
const labels=new Map();
if(pdf.numPages>30)throw Error('Upload up to 30 pages at a time.');
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
const viewport=page.getViewport({scale:Math.min(3,1800/page.getViewport({scale:1}).width)});
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
async function readPracticeTab(file,active){
const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
if((signature.join(',')==='137,80,78,71,13,10,26,10'||(signature[0]===255&&signature[1]===216&&signature[2]===255))){
const bitmap=await createImageBitmap(file);
try{
if(bitmap.width*bitmap.height>12000000)throw Error('Crop the PNG to the tab area and try again.');
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
function bindTabUpload(id,isPractice){
const input=find(id),hint=find(id+'-hint');
const help=hint.querySelector('button');
help.addEventListener('click',event=>{
if(event.pointerType!=='mouse'&&event.pointerType!=='pen')hint.toggleAttribute('data-open');
});
help.addEventListener('pointerleave',()=>hint.removeAttribute('data-open'));
help.addEventListener('blur',()=>hint.removeAttribute('data-open'));
input.addEventListener('change',async()=>{
const file=input.files[0];input.value='';
if(!file)return;
hint.hidden=true;hint.removeAttribute('data-open');
const request=++pdfRequest;
const active=()=>request===pdfRequest&&(isPractice?
currentPage==='practice-setup'&&practiceMode==='tabs':currentPage==='import');
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
pitches.splice(0,pitches.length,...tokens.map(t=>t.toLowerCase()==='rest'?null:toMidi(t.toUpperCase())));
if(!pitches.every(Music.playable))throw Error('Use pitches between A4 and F6.');
if(isPractice){showPractice(pitches,'practice-setup');return;}
if(!canReplace()){report('');return;}
const title=file.name.replace(/\.[^.]+$/,'')||'Imported score';
loadProject({id:newId(),title,author:'',notes:pitches,lengths:pitches.map(()=>4),tempo:130,intervals:[]});
draftChanged=true;openPage('editor');
report('Imported '+pitches.length+' notes. Edit their durations in the score.');
}catch(error){
if(active()){hint.hidden=false;report(error.message);}
}
});
}
bindTabUpload('reference',true);
bindTabUpload('import-image',false);
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
const project=JSON.parse(await file.text());
if(!validProject(project)||!project.notes.length)throw Error('Choose a project backup containing notes.');
if(currentPage==='practice-setup')showPractice(project.notes,'practice-setup',project.lengths);
}catch(error){if(currentPage==='practice-setup')report(error.message);}
});

