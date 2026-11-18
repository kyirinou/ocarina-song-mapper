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
