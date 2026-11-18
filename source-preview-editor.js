let previewSelected=null,previewDragging=null;
const previewPast=[],previewFuture=[];
const previewInspector=find('preview-inspector');
function currentPaperLayout(){return paperLayouts[previewKind.value];}
function selectedPaperObject(){return currentPaperLayout().objects.find(object=>object.id===previewSelected);}
function previewEditState(){
return {layout:structuredClone(currentPaperLayout()),title:previewKind.value==='tabs'?nativeTabTitle.value:projectName.value,
credit:previewKind.value==='tabs'?nativeTabCredit.value:authorInput.value};
}
function setPreviewEditState(state){
paperLayouts[previewKind.value]=structuredClone(state.layout);
if(previewKind.value==='tabs'){nativeTabTitle.value=state.title;nativeTabCredit.value=state.credit;}
else{projectName.value=state.title;authorInput.value=state.credit;draftChanged=true;updateWorkspace();}
}
function finishPreviewEdit(before,label){
const after=previewEditState();
if(JSON.stringify(before)===JSON.stringify(after))return;
previewPast.push(before);
if(previewPast.length>30)previewPast.shift();
previewFuture.length=0;
const saved=saveNativeTabDraft(label);
previewSaveWarning=saved?'':nativeTabStatus.textContent;
stopMelody();syncPreviewFields();drawScorePreview(true);
}
function changePreview(label,change){
const before=previewEditState();change();
paperLayouts[previewKind.value]=cleanPaperLayout(currentPaperLayout());
finishPreviewEdit(before,label);
}
function previewUndo(redo=false){
const from=redo?previewFuture:previewPast,to=redo?previewPast:previewFuture;
if(!from.length)return;
stopMelody();to.push(previewEditState());setPreviewEditState(from.pop());
saveNativeTabDraft(redo?'Redid page formatting':'Undid page formatting');
syncPreviewFields();drawScorePreview(true);
}
for(const field of scorePreview.querySelectorAll('[data-paper-font]')){
for(const font of paperFonts)field.add(new Option(font.split(',')[0],font));
}
function syncPreviewFields(){
const layout=currentPaperLayout(),heading=find('preview-heading').value;
for(const field of scorePreview.querySelectorAll('[data-paper-field]')){
field.value=layout[field.dataset.paperField]??Number(nativeTabSize.value);
}
find('preview-tab-controls').hidden=previewKind.value!=='tabs';
find('preview-heading-text').value=previewKind.value==='tabs'
  ?(heading==='title'?nativeTabTitle.value:nativeTabCredit.value)
  :(heading==='title'?projectName.value:authorInput.value);
for(const field of scorePreview.querySelectorAll('[data-heading-field]')){
const value=layout[heading][field.dataset.headingField];
if(field.type==='checkbox')field.checked=value;else field.value=value;
}
const selection=find('preview-object');
selection.replaceChildren(new Option('None',''));
for(const [i,object] of layout.objects.entries())selection.add(new Option(
(object.type==='image'?'Image':object.text.trim().slice(0,25)||'Text box')+' · '+(i+1),object.id));
const object=selectedPaperObject();
if(!object)previewSelected=null;
selection.value=previewSelected??'';
find('preview-object-fields').hidden=!object;
if(object){
find('preview-object-text-wrap').hidden=object.type!=='text';
find('preview-object-type').hidden=object.type!=='text';
for(const field of scorePreview.querySelectorAll('[data-object-field]')){
const key=field.dataset.objectField,value=object[key];
if(field.type==='checkbox')field.checked=value;else field.value=key==='opacity'?Math.round(value*100):value;
}
}
for(const button of scorePreview.querySelectorAll('[data-preview-command]')){
const command=button.dataset.previewCommand;
if(command==='undo')button.disabled=!previewPast.length;
if(command==='redo')button.disabled=!previewFuture.length;
if(['delete','duplicate','front','back'].includes(command))button.disabled=!object;
}
updatePreviewObjectSelection();
}
function updatePreviewObjectSelection(){
for(const node of previewPaper.querySelectorAll('[data-object-id]'))node.classList.toggle('is-selected',node.dataset.objectId===previewSelected);
}
find('preview-heading').onchange=syncPreviewFields;
find('preview-heading-text').onchange=event=>changePreview('Edited page title or author',()=>{
const heading=find('preview-heading').value;
if(previewKind.value==='tabs')(heading==='title'?nativeTabTitle:nativeTabCredit).value=event.target.value;
else{(heading==='title'?projectName:authorInput).value=event.target.value;draftChanged=true;updateWorkspace();}
});
for(const field of scorePreview.querySelectorAll('[data-paper-field]'))field.onchange=()=>{
if(field.type==='number'&&!field.reportValidity())return;
changePreview('Changed page layout',()=>{currentPaperLayout()[field.dataset.paperField]=field.type==='number'?Number(field.value):field.value;});
};
for(const field of scorePreview.querySelectorAll('[data-heading-field]'))field.onchange=()=>{
if(field.type==='number'&&!field.reportValidity())return;
changePreview('Formatted title or author',()=>{
currentPaperLayout()[find('preview-heading').value][field.dataset.headingField]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;
});
};
find('preview-object').onchange=event=>{previewSelected=event.target.value||null;syncPreviewFields();};
for(const field of scorePreview.querySelectorAll('[data-object-field]'))field.onchange=()=>{
if(!selectedPaperObject()||(field.type==='number'&&!field.reportValidity()))return;
changePreview('Edited page object',()=>{
const key=field.dataset.objectField;
selectedPaperObject()[key]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value)/(key==='opacity'?100:1):field.value;
});
};
function insertPaperObject(type,src='',ratio=1){
changePreview(type==='image'?'Added page image':'Added page text',()=>{
const layout=currentPaperLayout(),paper=paperGeometry(layout);
const object=cleanPaperLayout({objects:[{id:newId(),type,src,text:type==='text'?'Your text':'',
x:paper.margin,y:120,width:220,height:type==='image'?220/ratio:80,page:1}]}).objects[0];
layout.objects.push(object);previewSelected=object.id;
});
}
find('preview-image').onchange=async event=>{
const file=event.target.files[0];event.target.value='';
if(!file)return;
const project=projectId,kind=previewKind.value;
try{
const src=await new Promise((resolve,reject)=>{
const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This image could not be read.'));
reader.readAsDataURL(file);
});
if(!/^data:image\/(png|jpeg|webp);base64,/.test(src))throw Error('Choose a PNG, JPEG, or WebP image.');
const image=await paperImage(src);
const canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(image.width,image.height));
canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
if(!scorePreview.open||project!==projectId||kind!==previewKind.value)return;
insertPaperObject('image',canvas.toDataURL('image/png'),image.width/image.height);
}catch(error){find('preview-status').textContent=error.message;}
};
async function exportPreviewPaper(){
if(!previewPages||find('preview-play').disabled)return;
try{
const kind=previewKind.value,layout=structuredClone(currentPaperLayout());
const draft=structuredClone(nativeTabDraft()),title=kind==='tabs'?draft.title:projectName.value;
const credit=kind==='tabs'?draft.credit:authorInput.value;
await loadPDFExport();
const pages=kind==='tabs'?await tabPaper(draft):await staffPaper(title,credit,scoreEntries(),score.tempo,layout);
await saveScorePaper(pages,{title,author:credit,...(kind==='tabs'?{keywords:'osm-tab-draft-v1:'+encodeURIComponent(draft.text)}:{})},
(title||'Ocarina score').replace(/[\\/:*?"<>|]/g,'-'));
find('preview-status').textContent='PDF exported.';
}catch(error){find('preview-status').textContent=error.message;}
}
async function previewCommand(command){
if(command==='undo'||command==='redo'){previewUndo(command==='redo');return;}
if(command==='export'){await exportPreviewPaper();return;}
if(command==='save'){find('save').click();find('preview-status').textContent=projectStatus.textContent;return;}
if(command==='backup'){find('backup').click();return;}
if(command==='close'){scorePreview.close();return;}
if(command==='tabs'||command==='staff'){previewKind.value=command;previewKind.onchange();return;}
if(command==='fit'||command==='actual'){find('preview-zoom').value=command==='fit'?'fit':'1';fitScorePreview();return;}
if(command==='inspector'){previewInspector.hidden=!previewInspector.hidden;return;}
if(command==='image'){find('preview-image').click();return;}
if(command==='text'){insertPaperObject('text');return;}
if(command==='watermark'){
changePreview('Added watermark',()=>{
const paper=paperGeometry(currentPaperLayout());
const object=cleanPaperLayout({objects:[{id:newId(),type:'text',text:'Watermark',x:paper.margin,y:paper.height*.4,
width:paper.contentWidth,height:140,size:64,align:'center',opacity:.15,rotation:-30,repeat:true,layer:'background'}]}).objects[0];
currentPaperLayout().objects.push(object);previewSelected=object.id;
});return;
}
if(command==='duplicate'&&selectedPaperObject()){
changePreview('Duplicated page object',()=>{
const copy=structuredClone(selectedPaperObject());copy.id=newId();copy.x+=12;copy.y+=12;
currentPaperLayout().objects.push(copy);previewSelected=copy.id;
});return;
}
if(command==='delete'&&selectedPaperObject()){
changePreview('Removed page object',()=>{currentPaperLayout().objects=currentPaperLayout().objects.filter(object=>object.id!==previewSelected);previewSelected=null;});return;
}
if((command==='front'||command==='back')&&selectedPaperObject()){
changePreview('Changed page object order',()=>{
const layout=currentPaperLayout(),object=selectedPaperObject();
layout.objects=layout.objects.filter(entry=>entry.id!==object.id);
object.layer=command==='front'?'foreground':'background';
if(command==='front')layout.objects.push(object);else layout.objects.unshift(object);
});return;
}
if(command==='add-page'){changePreview('Added blank page',()=>currentPaperLayout().extraPages++);return;}
if(command==='reset'&&window.confirm('Reset formatting and remove all added objects from this view?')){
changePreview('Reset page formatting',()=>{paperLayouts[previewKind.value]=defaultPaperLayout();previewSelected=null;});
}
}
const previewMenus=[...scorePreview.querySelectorAll('.osm-preview-menubar details')];
scorePreview.addEventListener('click',event=>{
const summary=event.target.closest('.osm-preview-menubar summary');
if(summary)for(const menu of previewMenus)if(menu!==summary.parentElement)menu.open=false;
const button=event.target.closest('[data-preview-command]');
if(!button)return;
for(const menu of previewMenus)menu.open=false;
previewCommand(button.dataset.previewCommand);
});
scorePreview.addEventListener('pointerdown',event=>{
if(!event.target.closest('.osm-preview-menubar'))for(const menu of previewMenus)menu.open=false;
});
previewPaper.addEventListener('pointerdown',event=>{
if(event.button!==0||melody)return;
const node=event.target.closest('[data-object-id],[data-heading]');
if(!node){previewSelected=null;syncPreviewFields();return;}
event.preventDefault();
node.focus({preventScroll:true});
const object=node.dataset.objectId?currentPaperLayout().objects.find(object=>object.id===node.dataset.objectId):null;
previewSelected=object?.id??null;
if(node.dataset.heading)find('preview-heading').value=node.dataset.heading;
syncPreviewFields();
if(object?.locked)return;
const target=object??currentPaperLayout()[node.dataset.heading],scale=node.closest('.osm-preview-page').getBoundingClientRect().width/previewPages.paper.width;
previewDragging={pointer:event.pointerId,node,before:previewEditState(),target,startX:event.clientX,startY:event.clientY,
x:object?target.x:target.dx,y:object?target.y:target.dy,width:target.width,height:target.height,
resize:event.target.dataset.resize==='true',scale,object};
node.setPointerCapture(event.pointerId);
});
previewPaper.addEventListener('pointermove',event=>{
const drag=previewDragging;
if(!drag||event.pointerId!==drag.pointer)return;
const dx=(event.clientX-drag.startX)/drag.scale,dy=(event.clientY-drag.startY)/drag.scale;
if(drag.resize){
drag.target.width=Math.max(12,drag.width+dx);drag.target.height=Math.max(12,drag.height+dy);
drag.node.style.width=drag.target.width+'px';drag.node.style.height=drag.target.height+'px';
}else{
const x=drag.x+dx,y=drag.y+dy;
if(drag.object){drag.target.x=Math.max(0,x);drag.target.y=Math.max(0,y);}
else{drag.target.dx=x;drag.target.dy=y;}
drag.node.style.translate=dx+'px '+dy+'px';
}
});
function finishPaperDrag(event){
const drag=previewDragging;
if(!drag||event.pointerId!==drag.pointer)return;
previewDragging=null;
if(event.type==='pointercancel'){
setPreviewEditState(drag.before);drawScorePreview(true);
}else finishPreviewEdit(drag.before,drag.resize?'Resized page object':'Moved page object');
}
previewPaper.addEventListener('pointerup',finishPaperDrag);
previewPaper.addEventListener('pointercancel',finishPaperDrag);
previewPaper.addEventListener('lostpointercapture',finishPaperDrag);
scorePreview.addEventListener('keydown',event=>{
const modifier=event.metaKey||event.ctrlKey;
if(modifier&&event.key.toLowerCase()==='s'){event.preventDefault();previewCommand('save');return;}
if(event.key==='Escape'){
const menu=previewMenus.find(menu=>menu.open);
if(menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();return;}
}
const menu=event.target.closest('.osm-preview-menubar details');
if(menu&&['ArrowUp','ArrowDown'].includes(event.key)){
event.preventDefault();
const items=[...menu.querySelectorAll('button:not(:disabled)')];
if(!items.length)return;
const index=items.indexOf(document.activeElement),step=event.key==='ArrowDown'?1:-1;
items[(index+step+items.length)%items.length].focus();return;
}
if(editable(event.target))return;
if(modifier&&event.key.toLowerCase()==='z'){event.preventDefault();event.stopPropagation();previewUndo(event.shiftKey);return;}
if(modifier&&event.key.toLowerCase()==='d'&&selectedPaperObject()){event.preventDefault();previewCommand('duplicate');return;}
if(event.key==='Escape'&&previewSelected){event.preventDefault();previewSelected=null;syncPreviewFields();return;}
if((event.key==='Delete'||event.key==='Backspace')&&selectedPaperObject()){event.preventDefault();previewCommand('delete');return;}
if(selectedPaperObject()&&!selectedPaperObject().locked&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
event.preventDefault();
changePreview('Moved page object',()=>{
const object=selectedPaperObject(),step=event.shiftKey?10:1;
if(event.key==='ArrowLeft')object.x=Math.max(0,object.x-step);
if(event.key==='ArrowRight')object.x+=step;
if(event.key==='ArrowUp')object.y=Math.max(0,object.y-step);
if(event.key==='ArrowDown')object.y+=step;
});
}
});
