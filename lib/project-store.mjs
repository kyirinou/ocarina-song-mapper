import {migrateProject} from './domain.mjs';

// This checksum detects accidental truncation and corruption. It is not authentication.
function checksum(text){
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
function encode(payload,revision){
  return JSON.stringify({schemaVersion:1,revision,payload,checksum:checksum(JSON.stringify(payload))});
}
function decode(raw){
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object')throw Error('Saved data is not a library.');
  if(value.schemaVersion===undefined)return {payload:value,revision:0};
  if(value.schemaVersion!==1){
    const error=new Error('Saved data requires a newer OSM version.');
    error.code='UNSUPPORTED_SCHEMA';
    throw error;
  }
  if(!Number.isSafeInteger(value.revision)||value.revision<1||checksum(JSON.stringify(value.payload))!==value.checksum){
    throw Error('Saved data failed its integrity check.');
  }
  return value;
}
export class ProjectStore {
  constructor(storage,{key='ocarina-song-mapper-v1'}={}){
    this.storage=storage;
    this.key=key;
    this.revision=0;
    this.blocked=false;
  }
  read(){
    const candidates=[],issues=[];
    for(const suffix of ['', '-pending','-previous']){
      try{
        const raw=this.storage.getItem(this.key+suffix);
        if(!raw)continue;
        const value=decode(raw);
        if(!Array.isArray(value.payload?.projects))throw Error('The saved library has no project list.');
        const projects=[];
        for(const project of value.payload.projects){
          try{
            if(project?.id==='starter')continue;
            projects.push(migrateProject(project));
          }
          catch(error){
            issues.push(error.message);
            try{this.preserve(raw);}
            catch{
              this.blocked=true;
              issues.push('The original library is retained, but storage could not hold a recovery copy.');
            }
          }
        }
        candidates.push({...value,projects,suffix,raw});
      }catch(error){
        issues.push(error.message);
        try{
          const raw=this.storage.getItem(this.key+suffix);
          if(raw)this.preserve(raw);
          let value;
          try{value=JSON.parse(raw);}catch{}
          if(value?.schemaVersion!==undefined&&value.schemaVersion!==1)this.blocked=true;
        }catch{this.blocked=true;}
      }
    }
    // A newer pending write is a recoverable interrupted save.
    candidates.sort((a,b)=>b.revision-a.revision||a.suffix.length-b.suffix.length);
    const chosen=candidates[0];
    this.revision=chosen?.revision??0;
    this.lastVerifiedRaw=chosen?.raw??null;
    return {projects:chosen?.projects??[],active:chosen?.payload.active??null,
      recovered:Boolean(chosen?.suffix)||issues.length>0,issues};
  }
  preserve(raw){
    if(!this.storage.getItem(this.key+'-recovery'))this.storage.setItem(this.key+'-recovery',raw);
  }
  save(projects,active){
    if(this.blocked)throw Error('Saved data could not be safely recovered. Download a backup before replacing browser data.');
    const normalized=projects.map(migrateProject);
    if(new Set(normalized.map(project=>project.id)).size!==normalized.length)throw Error('Duplicate project identifiers.');
    const pending=this.storage.getItem(this.key+'-pending');
    if(pending&&pending!==this.pendingRaw){
      let journal;
      try{journal=decode(pending);}catch{this.preserve(pending);}
      if(journal?.revision>this.revision)throw Error('Another OSM tab has a recoverable save. Reload this tab before saving.');
    }
    let current=this.storage.getItem(this.key);
    let currentRevision=0;
    if(current){
      let value;
      try{value=decode(current);}
      catch(error){
        this.preserve(current);
        if(error.code==='UNSUPPORTED_SCHEMA')throw error;
        current=this.lastVerifiedRaw;
        if(current)value=decode(current);
      }
      currentRevision=value?.revision??0;
      if(currentRevision>this.revision)throw Error('Another OSM tab saved changes. Reload this tab before saving.');
    }
    const revision=Math.max(this.revision,currentRevision)+1;
    const raw=encode({projects:normalized,active},revision);
    this.pendingRaw=raw;
    this.storage.setItem(this.key+'-pending',raw);
    if(this.storage.getItem(this.key+'-pending')!==raw)throw Error('The recovery write could not be verified.');
    if(current){
      // Retain the last verified library before replacing it.
      decode(current);
      this.storage.setItem(this.key+'-previous',current);
    }
    this.storage.setItem(this.key,raw);
    if(this.storage.getItem(this.key)!==raw)throw Error('The saved library could not be verified.');
    this.revision=revision;
    this.lastVerifiedRaw=raw;
    try{this.storage.removeItem(this.key+'-pending');}catch{}
    this.pendingRaw=null;
    return true;
  }
  checkpoints(){
    const raw=this.storage.getItem(this.key+'-checkpoints');
    if(!raw)return [];
    const {payload}=decode(raw);
    if(!Array.isArray(payload.entries))throw Error('Recovery snapshots could not be read.');
    return payload.entries.flatMap(entry=>{
      try{return [{...entry,project:migrateProject(entry.project)}];}catch{return [];}
    });
  }
  checkpoint(project,reason='Automatic recovery'){
    const normalized=migrateProject(project),entries=this.checkpoints();
    const previous=entries.find(entry=>entry.project.id===project.id);
    if(previous&&JSON.stringify(previous.project)===JSON.stringify(normalized))return null;
    const createdAt=new Date().toISOString();
    const entry={id:createdAt+'-'+Math.random().toString(36).slice(2),createdAt,reason,project:normalized};
    const next=[entry,...entries.filter(item=>item.project.id!==project.id).slice(0,24),
      ...entries.filter(item=>item.project.id===project.id).slice(0,5)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30);
    // Keep the newest recoverable edit when older snapshots exhaust storage.
    while(true){
      try{
        this.storage.setItem(this.key+'-checkpoints',encode({entries:next},Date.now()));
        break;
      }catch(error){
        if(next.length===1)throw error;
        next.pop();
      }
    }
    return entry;
  }
  removeCheckpoints(projectId){
    const entries=this.checkpoints().filter(entry=>entry.project.id!==projectId);
    this.storage.setItem(this.key+'-checkpoints',encode({entries},Date.now()));
  }
}
