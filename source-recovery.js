let recoveryTimer=null,recoveryDirty=false,recoveryRestoring=false;
function scheduleRecoverySnapshot(){
if(recoveryRestoring||projectId===null)return;
recoveryDirty=true;
clearTimeout(recoveryTimer);
recoveryTimer=setTimeout(flushRecoverySnapshot,750);
}
function flushRecoverySnapshot(reason='Automatic recovery'){
clearTimeout(recoveryTimer);recoveryTimer=null;
if(!recoveryDirty||recoveryRestoring||projectId===null)return;
try{
projectStorage.checkpoint(snapshot(),typeof reason==='string'?reason:'Automatic recovery');
recoveryDirty=false;
}catch(error){
report('Automatic recovery could not be saved. Download a project backup. '+error.message);
}
}
function openRecovery(){
flushRecoverySnapshot();
const list=find('recovery-list'),status=find('recovery-status');
list.replaceChildren();status.textContent='';
const original=find('recovery-original');
original.hidden=true;
try{
const raw=localStorage.getItem(storageKey+'-recovery')??(projectStorage.blocked?localStorage.getItem(storageKey):null);
if(raw){original.hidden=false;original.onclick=()=>download('osm-original-saved-data.json',raw);}
}catch{}
try{
const entries=projectStorage.checkpoints();
if(!entries.length)status.textContent='No recovery snapshots yet. Snapshots are created as you edit.';
for(const entry of entries){
const row=document.createElement('div');row.className='osm-recovery-row';
const description=document.createElement('span');
description.textContent=entry.project.title+' · '+entry.project.notes.length+' notes · '+new Date(entry.createdAt).toLocaleString();
const restore=document.createElement('button');restore.type='button';restore.className='ctrl';restore.textContent='Restore copy';
restore.onclick=()=>{
flushRecoverySnapshot();
recoveryRestoring=true;
try{
const project=migrateProject(entry.project);
project.id=newId();project.title+=' (recovered)';
loadProject(project);draftChanged=true;
find('recovery').close();openPage('editor');
report('Recovered copy opened. Save score to keep it in Recent scores.');
}finally{recoveryRestoring=false;}
scheduleRecoverySnapshot();
};
const backup=document.createElement('button');backup.type='button';backup.className='ctrl';backup.textContent='Download backup';
backup.onclick=()=>download('ocarina-recovery.json',JSON.stringify(entry.project,null,2));
row.append(description,restore,backup);list.append(row);
}
}catch(error){status.textContent=error.message;}
find('recovery').showModal();
}
find('recovery-open').onclick=openRecovery;
window.addEventListener('pagehide',flushRecoverySnapshot);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushRecoverySnapshot();});
window.addEventListener('storage',event=>{
if(event.key===storageKey&&event.newValue)report('Another OSM tab updated saved scores. Download a backup of current edits, then reload before saving.');
});
