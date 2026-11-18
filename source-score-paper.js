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
