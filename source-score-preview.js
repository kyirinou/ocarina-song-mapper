const scorePreview=find('score-preview');
const previewKind=find('preview-kind');
const previewPaper=find('preview-paper');
const previewScroll=find('preview-scroll');
let previewNotes=[],previewActive=[],previewRequest=0;

function fitScorePreview(){
if(!scorePreview.open)return;
const gutters=24;
previewPaper.style.zoom=String(Math.max(.1,Math.min(1.25,(previewScroll.clientWidth-gutters)/scorePaper.width,
  (previewScroll.clientHeight-gutters)/scorePaper.height)));
}

function drawPreviewPage(blocks){
const page=document.createElement('div');
page.className='osm-preview-page';
page.style.width=scorePaper.width+'px';page.style.height=scorePaper.height+'px';
const tabs=paintTabPage(blocks,2);
if(tabs){
tabs.canvas.style.top=tabs.top+'px';tabs.canvas.style.left=scorePaper.margin+'px';
tabs.canvas.style.width=scorePaperWidth+'px';tabs.canvas.style.height=tabs.height+'px';
page.append(tabs.canvas);
}
for(const {svg,notes,y,height,noteWidth} of blocks){
if(svg){
svg.style.top=y+'px';svg.style.left=scorePaper.margin+'px';
page.append(svg);
for(const [index,node] of notes??[]){
if(index!==undefined)(previewNotes[index]??=[]).push(node);
}
}else{
for(const note of notes){
const cell=document.createElement('span');
cell.dataset.tabIndex=note.index;
cell.style.left=scorePaper.margin+note.x+'px';cell.style.top=y+'px';
cell.style.width=noteWidth+'px';cell.style.height=height+'px';
page.append(cell);
previewNotes[note.index]=[cell];
}
}
}
return page;
}

async function drawScorePreview(){
const request=++previewRequest;
const tabView=previewKind.value==='tabs';
const status=find('preview-status'),playButton=find('preview-play');
previewPaper.replaceChildren();
previewNotes=[];previewActive=[];
playButton.disabled=true;
status.hidden=true;
const draft=tabView?nativeTabDraft():null;
const title=tabView?draft.title.trim():projectName.value.trim()||'Untitled song';
find('score-preview-title').textContent=title||'Untitled score';
try{
if(tabView&&!nativeTabNotes().length)throw Error('Add fingerings before previewing tabs.');
if(!tabView&&!score.events.length)throw Error('Add notes before previewing the staff.');
const pages=tabView?await tabPaper(draft):await staffPaper(title,authorInput.value.trim(),scoreEntries(),score.tempo);
if(request!==previewRequest||!scorePreview.open)return;
for(const blocks of pages)previewPaper.append(drawPreviewPage(blocks));
fitScorePreview();
previewScroll.scrollTo(0,0);
playButton.disabled=false;
}catch(error){
if(request!==previewRequest||!scorePreview.open)return;
status.textContent=error.message;status.hidden=false;
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
scorePreview.showModal();drawScorePreview();
}
previewKind.onchange=()=>{stopMelody();drawScorePreview();};
find('preview-play').onclick=()=>play(previewKind.value==='tabs');
find('preview-pause').onclick=pauseMelody;
find('preview-stop').onclick=stopMelody;
scorePreview.addEventListener('close',()=>{
previewRequest++;
previewPaper.replaceChildren();
previewNotes=[];previewActive=[];
stopMelody();
});
window.addEventListener('resize',fitScorePreview);
