const scorePreview=find('score-preview');
const previewKind=find('preview-kind');
const previewPaper=find('preview-paper');
const previewScroll=find('preview-scroll');
let previewNotes=[],previewActive=[];

function fitScorePreview(){
if(!scorePreview.open||!previewPaper.firstElementChild)return;
previewPaper.style.zoom='1';
const width=previewPaper.scrollWidth,height=previewPaper.scrollHeight;
previewPaper.style.zoom=String(Math.min(1,(previewScroll.clientWidth-20)/width,
  Math.max(.42,(previewScroll.clientHeight-20)/height)));
}

async function drawScorePreview(){
const tabView=previewKind.value==='tabs';
const status=find('preview-status'),playButton=find('preview-play');
previewPaper.replaceChildren();
previewNotes=[];previewActive=[];
playButton.disabled=true;
status.hidden=true;
find('score-preview-title').textContent=(tabView?nativeTabTitle.value:projectName.value).trim()||'Untitled score';
try{
if(tabView){
const notes=nativeTabNotes();
if(!notes.length)throw Error('Add fingerings before previewing tabs.');
const {svg}=nativeTabArtwork({columns:12});
previewPaper.append(svg);
svg.querySelectorAll('[data-tab-index]').forEach(node=>{previewNotes.push([node]);});
}else{
if(!score.events.length)throw Error('Add notes before previewing the staff.');
await loadNotation();
if(!scorePreview.open||previewKind.value!=='staff')return;
const {abc,glyphIndexes}=engravedScore(scoreEntries(),score.tempo);
window.ABCJS.renderAbc(previewPaper,abc,{add_classes:true,staffwidth:720,oneSvgPerLine:true});
previewPaper.querySelectorAll('.abcjs-note,.abcjs-rest').forEach((glyph,i)=>{
const index=glyphIndexes[i];
if(index===undefined)return;
(previewNotes[index]??=[]).push(glyph);
});
}
playButton.disabled=false;
previewScroll.scrollTop=0;
fitScorePreview();
}catch(error){
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
scorePreview.addEventListener('close',stopMelody);
window.addEventListener('resize',fitScorePreview);
