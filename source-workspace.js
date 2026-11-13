const editorViews=[...root.querySelectorAll('[data-editor-view]')];
const durationButtons=[...root.querySelectorAll('[data-editor-beats]')];
const timingPanel=find('workspace-timing');
let editorView='staff';

function updateWorkspace(){
  const title=projectName.value.trim()||'Untitled song';
  const credit=authorInput.value.trim();
  find('workspace-title').textContent=title;
  find('editor-caption').textContent=title+' — Score Editor';
  find('workspace-credit').textContent=credit;
  find('workspace-credit').hidden=!credit;
  find('workspace-empty').hidden=score.events.length>0;
  if(editorView==='staff')drawStaff();
}

function highlightWorkspace(){
  for(const button of durationButtons){
    button.disabled=!score.events.length;
    button.setAttribute('aria-pressed',String(Number(button.dataset.editorBeats)===score.events[position]?.ticks/4));
  }
  for(const [index,glyphs] of scoreGroups){
    for(const glyph of glyphs)glyph.classList.toggle('osm-staff-selected',selectedNotes.has(index));
  }
}

function switchEditorView(view){
  editorView=view;
  for(const button of editorViews){
    const active=button.dataset.editorView===view;
    button.setAttribute('aria-pressed',String(active));
    document.getElementById(button.getAttribute('aria-controls')).hidden=!active;
  }
  updateWorkspace();
}

for(const button of editorViews)button.onclick=()=>switchEditorView(button.dataset.editorView);
find('workspace-zoom').onchange=event=>find('workspace-paper').style.setProperty('--osm-zoom',Number(event.target.value));
for(const field of [projectName,authorInput])field.addEventListener('input',updateWorkspace);
timingPanel.addEventListener('toggle',()=>{if(currentPage==='editor'&&editorView==='staff')drawStaff();});

for(const button of durationButtons)button.onclick=()=>{
  if(recording||!score.events.length)return;
  beatsEditor.value=button.dataset.editorBeats;
  beatsEditor.dispatchEvent(new Event('change'));
};

const menuBar=root.querySelector('.osm-menubar');
const editorMenus=[...menuBar.querySelectorAll('details')];
function closeEditorMenus(except){
  for(const menu of editorMenus)if(menu!==except)menu.open=false;
}
menuBar.addEventListener('click',event=>{
  const summary=event.target.closest('summary');
  if(summary){
    const menu=summary.parentElement;
    closeEditorMenus(menu);
    for(const item of menu.querySelectorAll('[data-editor-command]')){
      item.disabled=Boolean(document.getElementById('oc93-'+item.dataset.editorCommand)?.disabled);
    }
    return;
  }
  const item=event.target.closest('[data-editor-command]');
  if(!item)return;
  const [command,value]=item.dataset.editorCommand.split(':');
  const summaryButton=item.closest('details').querySelector('summary');
  closeEditorMenus();
  summaryButton.focus({preventScroll:true});
  if(command.startsWith('@'))openPage(command.slice(1));
  else if(command==='piano-roll')openPianoRoll();
  else if(command==='view')switchEditorView(value);
  else if(command==='zoom'){
    const zoom=find('workspace-zoom');
    zoom.value=value;zoom.dispatchEvent(new Event('change'));
  }else if(command==='toggle'){
    root.querySelector('.osm-workspace').classList.toggle('osm-hide-'+value);
  }else if(command==='panel'){
    const panel=find(value);panel.open=!panel.open;
    if(panel.open)panel.scrollIntoView({block:'nearest'});
  }else if(command==='export'){
    const picker=find('export-kind');
    picker.value=value;picker.dispatchEvent(new Event('change'));
    if(value==='tabs')find('tabs-panel').scrollIntoView({block:'start'});
  }else if(command==='editor-help'){
    openPage('help');
    const topic=find('editor-help-section');
    topic.parentElement.open=true;topic.focus();topic.scrollIntoView({block:'start'});
  }else if(command==='editor-tour'){
    startTutorial(tutorialSteps.findIndex(step=>step[0]==='Score editing'));
  }else find(command).click();
});
document.addEventListener('pointerdown',event=>{if(!menuBar.contains(event.target))closeEditorMenus();});
document.addEventListener('keydown',event=>{
  const open=editorMenus.find(menu=>menu.open);
  if(!open)return;
  if(event.key==='Escape'){
    event.preventDefault();closeEditorMenus();open.querySelector('summary').focus();
  }else if(['ArrowDown','ArrowUp'].includes(event.key)&&open.contains(event.target)){
    event.preventDefault();
    const items=[...open.querySelectorAll('button:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    const next=index<0?(event.key==='ArrowDown'?0:items.length-1):
      (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next]?.focus();
  }
});
