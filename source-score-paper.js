const scorePaper={width:595.28,height:841.89,margin:32};
const scorePaperWidth=scorePaper.width-2*scorePaper.margin;
const scorePaperHeight=scorePaper.height-2*scorePaper.margin;
const paperMeasure=document.createElement('canvas').getContext('2d');

function paperHeading(text,size){
if(!text.trim())return [];
const font=size+'px Helvetica, Arial, sans-serif';
paperMeasure.font=font;
const lines=[];
let line='';
for(const word of text.trim().split(/\s+/)){
if(line&&paperMeasure.measureText(line+' '+word).width>scorePaperWidth){lines.push(line);line='';}
if(paperMeasure.measureText(word).width<=scorePaperWidth){
line+=(line?' ':'')+word;
continue;
}
for(const letter of word){
if(line&&paperMeasure.measureText(line+letter).width>scorePaperWidth){lines.push(line);line='';}
line+=letter;
}
}
if(line)lines.push(line);
return lines.map((line,i)=>{
const height=size*1.25+(i===lines.length-1?8:0);
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('width',scorePaperWidth);svg.setAttribute('height',height);
rhythmShape(svg,'text',{x:0,y:size,'font-size':size,'font-family':'Helvetica, Arial, sans-serif',fill:'#000'});
svg.lastChild.textContent=line;
return {svg,width:scorePaperWidth,height};
});
}

function paginateScorePaper(blocks){
const pages=[[]];
let y=scorePaper.margin;
for(const block of blocks){
if(y>scorePaper.margin&&y+block.height>scorePaper.height-scorePaper.margin+.001){
pages.push([]);y=scorePaper.margin;
}
pages.at(-1).push({...block,y});
y+=block.height;
}
return pages;
}

async function staffPaper(title,credit,entries,bpm){
await loadNotation();
const staging=document.createElement('div');
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
const scale=Math.min(scorePaperWidth/width,scorePaperHeight/height);
const printedWidth=width*scale,printedHeight=height*scale;
if(!view.width||!view.height)svg.setAttribute('viewBox','0 0 '+width+' '+height);
svg.setAttribute('width',printedWidth);svg.setAttribute('height',printedHeight);
const notes=[...svg.querySelectorAll('.abcjs-note,.abcjs-rest')].map(node=>[glyphIndexes[glyphIndex++],node]);
return {svg,width:printedWidth,svgHeight:printedHeight,height:Math.min(scorePaperHeight,printedHeight+6),notes};
});
return paginateScorePaper([...paperHeading(title,22),...paperHeading(credit,12),...blocks]);
}finally{staging.remove();}
}

async function tabPaper(draft){
const size=Number(draft.size),rowHeight=size*1.15, font=size+'px OcarinaFingering, monospace';
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
// Keep the spacing between notes when fitting long, manually arranged rows to paper.
const scale=Math.min(1,scorePaperWidth/Math.max(1,widest));
const blocks=rows.map(({segments,notes})=>({
segments,font,scale,baseline,height:rowHeight*scale,noteWidth:size*scale,
notes:notes.map(note=>({...note,x:note.x*scale}))
}));
return paginateScorePaper([...paperHeading(draft.title,22),...paperHeading(draft.credit,12),...blocks]);
}

function paintTabPage(blocks,resolution){
const rows=blocks.filter(block=>block.segments);
if(!rows.length)return null;
const top=rows[0].y-4;
const height=rows.at(-1).y+rows.at(-1).height-top+4;
const canvas=document.createElement('canvas');
canvas.width=Math.ceil(scorePaperWidth*resolution);
canvas.height=Math.ceil(height*resolution);
const context=canvas.getContext('2d',{alpha:false});
context.scale(canvas.width/scorePaperWidth,canvas.height/height);
context.fillStyle='#fff';
context.fillRect(0,0,scorePaperWidth,height);
context.fillStyle='#000';
for(const row of rows){
context.save();
context.translate(0,row.y-top);context.scale(row.scale,row.scale);
context.font=row.font;
for(const {text,x} of row.segments)context.fillText(text,x,row.baseline);
context.restore();
}
return {canvas,top,height};
}

async function saveScorePaper(pages,properties,filename){
const pdf=new window.jspdf.jsPDF({unit:'pt',format:[scorePaper.width,scorePaper.height],compress:true});
pdf.setProperties(properties);
for(const [index,blocks] of pages.entries()){
if(index)pdf.addPage();
for(const {svg,width,height,svgHeight,y} of blocks){
if(svg)await pdf.svg(svg,{x:scorePaper.margin,y,width,height:svgHeight??height});
}
const tabs=paintTabPage(blocks,4);
if(tabs)pdf.addImage(tabs.canvas,'PNG',scorePaper.margin,tabs.top,scorePaperWidth,tabs.height);
}
pdf.save(filename+'.pdf');
}
