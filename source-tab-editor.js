const tabHighlight=find('tab-highlight');
const tabPlayback=tabHighlight.parentElement;
const nativeTabText=find('native-tab-text');
const nativeTabTitle=find('native-tab-title');
const nativeTabCredit=find('native-tab-credit');
const nativeTabSize=find('native-tab-size');
const nativeTabStatus=find('native-tab-status');
let nativeTabProject=null,initialTabDraft=null,nativeTabActivity=[],lastTabEdit=null;
let tabPlaybackCells=[],tabPlaybackCell=null;

function nativeTabKey(id){return 'osm-tab-draft-v1:'+id;}
function readNativeTabDraft(id){
try{
const value=JSON.parse(localStorage.getItem(nativeTabKey(id)));
if(typeof value?.text==='string')return value;
}catch{}
return null;
}
function nativeTabDraft(){
return {text:nativeTabText.value,title:nativeTabTitle.value,credit:nativeTabCredit.value,size:nativeTabSize.value,activity:nativeTabActivity};
}
function saveNativeTabDraft(label){
if(nativeTabProject===null)return;
const now=Date.now();
if(label&&(!lastTabEdit||lastTabEdit.label!==label||now-lastTabEdit.time>15000)){
nativeTabActivity=[...nativeTabActivity,{label,at:new Date(now).toISOString()}].slice(-maxScoreActivity);
}
if(label)lastTabEdit={label,time:now};
initialTabDraft=nativeTabDraft();
try{
localStorage.setItem(nativeTabKey(nativeTabProject),JSON.stringify(initialTabDraft));
nativeTabStatus.textContent=projects.some(project=>project.id===nativeTabProject)
  ?'Tab draft saved in this browser.'
  :'Save the score to reopen this draft from Recent scores.';
}catch{nativeTabStatus.textContent='Save the score or download the tabs to keep a copy.';}
renderScoreActivity();
updatePlaybackAvailability();
}
function updateNativeTabStyle(){
nativeTabText.parentElement.style.setProperty('--native-tab-size',nativeTabSize.value+'px');
}
function openNativeTabEditor(){
if(nativeTabProject===projectId){
if(!initialTabDraft&&!nativeTabText.readOnly)nativeTabText.value=defaultTabLayout(score.pitches.map(fingeringCode).join(''));
return;
}
nativeTabProject=projectId;
const draft=readNativeTabDraft(projectId)??initialTabDraft;
const sequence=score.pitches.map(fingeringCode).join('');
nativeTabText.value=draft?.text??defaultTabLayout(sequence);
nativeTabTitle.value=draft?.title||projectName.value.trim()||'Untitled song';
nativeTabCredit.value=draft?.credit??authorInput.value.trim();
nativeTabSize.value=['36','52','68'].includes(draft?.size)?draft.size:'52';
nativeTabActivity=Array.isArray(draft?.activity)?draft.activity:[];
lastTabEdit=null;
updateNativeTabStyle();
nativeTabStatus.textContent='';
}
const nativeTabPitch=code=>code==='r'?null:code.charCodeAt(0)-65+69;
function nativeTabNotes(){
return (nativeTabText.value.match(/[A-Ur]/g)??[]).map(nativeTabPitch);
}
function tabNotesMatchScore(notes){
return notes.length===score.events.length&&notes.every((pitch,i)=>pitch===score.events[i].pitch);
}
function prepareTabPlayback(){
tabHighlight.replaceChildren();
tabPlaybackCells=[];
for(const code of nativeTabText.value){
if(/[A-Ur]/.test(code)){
const cell=document.createElement('span');
cell.textContent=code;tabPlaybackCells.push(cell);tabHighlight.append(cell);
}else tabHighlight.append(document.createTextNode(code));
}
tabPlayback.hidden=false;
nativeTabText.readOnly=true;
syncTabPlaybackScroll();
}
function syncTabPlaybackScroll(){
tabHighlight.style.transform='translate('+(-nativeTabText.scrollLeft)+'px,'+(-nativeTabText.scrollTop)+'px)';
}
function highlightTabPlayback(index){
tabPlaybackCell?.classList.remove('is-playing');
tabPlaybackCell=tabPlaybackCells[index]??null;
tabPlaybackCell?.classList.add('is-playing');
if(tabPlaybackCell&&editorView==='tabs'){
const cell=tabPlaybackCell.getBoundingClientRect(),editor=nativeTabText.getBoundingClientRect();
if(cell.bottom>editor.bottom-8)nativeTabText.scrollTop+=cell.bottom-editor.bottom+8;
if(cell.top<editor.top+8)nativeTabText.scrollTop-=editor.top+8-cell.top;
if(cell.right>editor.right-20)nativeTabText.scrollLeft+=cell.right-editor.right+20;
if(cell.left<editor.left+8)nativeTabText.scrollLeft-=editor.left+8-cell.left;
syncTabPlaybackScroll();
}
}
function clearTabPlayback(){
highlightTabPlayback(-1);
tabPlaybackCells=[];
tabPlayback.hidden=true;
nativeTabText.readOnly=false;
}
nativeTabText.addEventListener('scroll',syncTabPlaybackScroll);
for(const [field,label] of [[nativeTabText,'Edited tab fingerings or layout'],[nativeTabTitle,'Edited tab title'],[nativeTabCredit,'Edited tab author']]){
field.addEventListener('input',()=>saveNativeTabDraft(label));
}
nativeTabSize.onchange=()=>{updateNativeTabStyle();saveNativeTabDraft('Changed tab diagram size');};
find('native-tab-save-score').onclick=()=>find('save').click();
for(const [label,code] of [
...Array.from({length:21},(_,i)=>[name(i+69),fingeringCode(i+69)]),
['Rest','r'],['Space',' '],['Bar line','|'],['New line','\n']
]){
const button=document.createElement('button');
button.type='button';button.className='ctrl';button.textContent=label;
button.addEventListener('pointerdown',event=>event.preventDefault());
button.onclick=()=>{
if(nativeTabText.readOnly)return;
nativeTabText.focus();
// Use the browser’s text editing operation so insertions join Undo history.
if(!document.execCommand('insertText',false,code)){
nativeTabText.setRangeText(code,nativeTabText.selectionStart,nativeTabText.selectionEnd,'end');
saveNativeTabDraft('Edited tab fingerings or layout');
}
};
find('native-tab-keys').append(button);
}

function nativeTabFilename(){
return (nativeTabTitle.value.trim()||'Ocarina tabs').replace(/[\\/:*?"<>|]/g,'-');
}
find('native-tab-text-export').onclick=()=>download(nativeTabFilename()+'.txt',nativeTabText.value);

function nativeTabArtwork(){
const draft=nativeTabDraft();
const rows=draft.text.split('\n').map(row=>Array.from(row.replace(/\t/g,'    ')));
const size=Number(draft.size),margin=20;
const width=Math.max(360,margin*2+size*Math.max(...rows.map(row=>row.length)));
const height=100+rows.length*(size+8);
if(width>8000||height>16000)throw Error('Shorten the tab rows or split the draft into smaller sheets.');
const svg=document.createElementNS(svgNS,'svg');
svg.setAttribute('xmlns',svgNS);svg.setAttribute('width',width);svg.setAttribute('height',height);
rhythmShape(svg,'rect',{width,height,fill:'white'});
function label(value,x,y,fontSize){
rhythmShape(svg,'text',{x,y,'font-size':fontSize,'font-family':'sans-serif',fill:'#172126'});
svg.lastChild.textContent=value;
}
label(draft.title,margin,34,22);label(draft.credit,margin,55,13);
rows.forEach((row,line)=>row.forEach((symbol,column)=>{
const x=margin+column*size,y=72+line*(size+8);
if(/^[A-U]$/.test(symbol)){
const glyph=makeFinger(symbol.charCodeAt(0)-65+69);
glyph.setAttribute('x',x);glyph.setAttribute('y',y);
glyph.setAttribute('width',size-4);glyph.setAttribute('height',size);
svg.append(glyph);
}else if(symbol.trim())label(symbol==='r'?'Rest':symbol,x+4,y+size*.66,Math.min(size*.42,18));
}));
return {svg,width,height,data:new XMLSerializer().serializeToString(svg)};
}
function saveNativeArtwork(blob,extension){
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download=nativeTabFilename()+'.'+extension;link.click();
setTimeout(()=>URL.revokeObjectURL(url),1000);
}
find('native-tab-svg').onclick=()=>{
try{saveNativeArtwork(new Blob([nativeTabArtwork().data],{type:'image/svg+xml'}),'svg');}
catch(error){nativeTabStatus.textContent=error.message;}
};
find('native-tab-png').onclick=async()=>{
let url;
try{
const {data,width,height}=nativeTabArtwork();
if(width*height>12000000)throw Error('Use SVG or PDF for this large layout.');
url=URL.createObjectURL(new Blob([data],{type:'image/svg+xml'}));
const image=new Image();image.src=url;await image.decode();
const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
canvas.getContext('2d').drawImage(image,0,0);
const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
if(!png)throw Error('Could not create PNG.');
saveNativeArtwork(png,'png');
}catch(error){nativeTabStatus.textContent=error.message;}
finally{if(url)URL.revokeObjectURL(url);}
};
find('native-tab-pdf').onclick=async()=>{
const button=find('native-tab-pdf');button.disabled=true;
try{
const {svg,width,height}=nativeTabArtwork();
await loadPDFExport();
const pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4'});
const margin=24,pageWidth=pdf.internal.pageSize.getWidth()-2*margin,pageHeight=pdf.internal.pageSize.getHeight()-2*margin;
const scale=Math.min(1,pageWidth/width,pageHeight/height);
await pdf.svg(svg,{x:margin,y:margin,width:width*scale,height:height*scale});
pdf.save(nativeTabFilename()+'.pdf');
}catch(error){nativeTabStatus.textContent=error.message;}
finally{button.disabled=false;}
};
