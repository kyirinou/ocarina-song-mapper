const scorePreview=find('score-preview');
const previewKind=find('preview-kind');
const previewPaper=find('preview-paper');
const previewScroll=find('preview-scroll');
let previewNotes=[],previewActive=[],previewRequest=0,previewPages=null,previewSaveWarning='';

function fitScorePreview(){
if(!scorePreview.open||!previewPages)return;
const zoom=find('preview-zoom').value,paper=previewPages.paper;
const fitted=Math.min(1.25,(previewScroll.clientWidth-24)/paper.width,(previewScroll.clientHeight-24)/paper.height);
previewPaper.style.zoom=String(zoom==='fit'?Math.max(.1,fitted):Number(zoom));
}

async function drawPreviewPage(blocks,index,pages,noteGroups){
const {paper,layout}=pages;
const page=document.createElement('div');
page.className='osm-preview-page';page.dataset.page=index+1;
page.style.width=paper.width+'px';page.style.height=paper.height+'px';
const tabs=paintTabPage(blocks,2,paper);
if(tabs){
tabs.canvas.style.top=tabs.top+'px';tabs.canvas.style.left=paper.margin+'px';
tabs.canvas.style.width=paper.contentWidth+'px';tabs.canvas.style.height=tabs.height+'px';
tabs.canvas.className='osm-paper-content';
page.append(tabs.canvas);
}
for(const block of blocks){
const {svg,notes,y,height,noteWidth}=block;
if(svg){
svg.style.top=y+(block.dy??0)+'px';svg.style.left=paper.margin+(block.dx??0)+'px';
svg.classList.add('osm-paper-content');page.append(svg);
if(block.heading){
svg.dataset.heading=block.heading;svg.classList.add('osm-paper-heading');svg.style.cursor='move';
}
for(const [noteIndex,node] of notes??[]){
if(noteIndex!==undefined)(noteGroups[noteIndex]??=[]).push(node);
}
}else{
for(const note of notes){
const cell=document.createElement('span');
cell.dataset.tabIndex=note.index;
cell.style.left=paper.margin+note.x+'px';cell.style.top=y+'px';
cell.style.width=noteWidth+'px';cell.style.height=height+'px';
cell.className='osm-paper-content';page.append(cell);
noteGroups[note.index]=[cell];
}
}
}
for(const object of layout.objects.filter(object=>object.repeat||object.page===index+1)){
const handle=document.createElement('div');
handle.className='osm-paper-object';handle.dataset.objectId=object.id;
handle.setAttribute('aria-label',object.type==='image'?'Image':object.text||'Text box');
handle.tabIndex=0;
handle.style.cssText='left:'+object.x+'px;top:'+object.y+'px;width:'+object.width+'px;height:'+object.height+'px;transform:rotate('+object.rotation+'deg)';
handle.classList.add('osm-object-'+object.layer);
const artwork=await paintPaperObject(object,2);
artwork.style.opacity=object.opacity;handle.append(artwork);
if(!object.locked){
const resize=document.createElement('span');resize.className='osm-paper-resize';resize.dataset.resize='true';handle.append(resize);
}
page.append(handle);
}
return page;
}

async function drawScorePreview(preserve=false){
const request=++previewRequest,tabView=previewKind.value==='tabs';
const status=find('preview-status'),playButton=find('preview-play');
const scrollTop=previewScroll.scrollTop,scrollLeft=previewScroll.scrollLeft;
previewPaper.replaceChildren();previewNotes=[];previewActive=[];
playButton.disabled=true;status.textContent='Preparing pages…';
const draft=tabView?structuredClone(nativeTabDraft()):null;
const title=tabView?draft.title.trim():projectName.value.trim()||'Untitled song';
find('score-preview-title').textContent=(title||'Untitled score')+' — Page editor';
try{
if(tabView&&!nativeTabNotes().length)throw Error('Add fingerings before previewing tabs.');
if(!tabView&&!score.events.length)throw Error('Add notes before previewing the staff.');
const pages=tabView?await tabPaper(draft):await staffPaper(title,authorInput.value.trim(),scoreEntries(),score.tempo);
const elements=[],noteGroups=[];
for(const [index,blocks] of pages.entries()){
if(request!==previewRequest||!scorePreview.open)return;
elements.push(await drawPreviewPage(blocks,index,pages,noteGroups));
}
if(request!==previewRequest||!scorePreview.open)return;
previewPages=pages;previewNotes=noteGroups;previewPaper.append(...elements);fitScorePreview();
if(preserve)previewScroll.scrollTo(scrollLeft,scrollTop);else previewScroll.scrollTo(0,0);
find('preview-page-count').textContent=pages.length+' '+(pages.length===1?'page':'pages');
status.textContent=previewSaveWarning;
playButton.disabled=false;
updatePreviewObjectSelection();
syncPreviewFields();
}catch(error){
if(request!==previewRequest||!scorePreview.open)return;
status.textContent=error.message;
}
}

function highlightScorePreview(index){
if(!scorePreview.open)return;
for(const node of previewActive)node.classList.remove('playing-note','preview-tab-active');
previewActive=previewNotes[index]??[];
for(const node of previewActive)node.classList.add(previewKind.value==='tabs'?'preview-tab-active':'playing-note');
const active=previewActive.at(-1);
if(!active)return;
const target=active.getBoundingClientRect(),view=previewScroll.getBoundingClientRect();
if(target.bottom>view.bottom-8||target.top<view.top+8)previewScroll.scrollTop+=target.top-view.top-14;
}

function openScorePreview(){
stopMelody();openNativeTabEditor();
previewKind.value=editorView==='tabs'?'tabs':'staff';
previewPast.length=0;previewFuture.length=0;previewSelected=null;previewSaveWarning='';
find('preview-zoom').value='fit';
scorePreview.showModal();syncPreviewFields();drawScorePreview();
}
previewKind.onchange=()=>{
stopMelody();previewPast.length=0;previewFuture.length=0;previewSelected=null;
syncPreviewFields();drawScorePreview();
};
find('preview-zoom').onchange=fitScorePreview;
find('preview-play').onclick=()=>{previewSelected=null;updatePreviewObjectSelection();play(previewKind.value==='tabs');};
find('preview-pause').onclick=pauseMelody;
find('preview-stop').onclick=stopMelody;
scorePreview.addEventListener('close',()=>{
previewRequest++;previewPages=null;
previewPaper.replaceChildren();previewNotes=[];previewActive=[];
stopMelody();
});
new ResizeObserver(fitScorePreview).observe(previewScroll);
