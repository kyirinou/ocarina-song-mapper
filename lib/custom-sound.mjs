import {detectPitch} from './domain.mjs';

export class InTuneHold {
  constructor(pitch,{seconds=3,tolerance=40}={}){
    this.pitch=pitch;
    this.seconds=seconds;
    this.tolerance=tolerance;
    this.reset();
  }
  reset(){
    this.frames=0;
    this.chunks=[];
    this.centsTotal=0;
    this.rate=null;
  }
  push(samples,rate){
    const {frequency,confidence}=detectPitch(samples,rate);
    const exact=frequency?69+12*Math.log2(frequency/440):null;
    const cents=exact===null?null:(exact-this.pitch)*100;
    const inTune=cents!==null&&confidence>=.8&&Math.abs(cents)<=this.tolerance;
    if(!inTune||this.rate!==null&&this.rate!==rate)this.reset();
    if(inTune){
      this.rate=rate;
      this.chunks.push(Float32Array.from(samples));
      this.frames+=samples.length;
      this.centsTotal+=cents*samples.length;
    }
    return {inTune,cents,heard:exact===null?null:Math.round(exact),
      progress:Math.min(1,this.frames/(rate*this.seconds)),complete:this.frames>=rate*this.seconds};
  }
  recording(){
    if(this.rate===null||this.frames<this.rate*this.seconds)throw Error('Hold the note in tune for three seconds.');
    const pcm=new Float32Array(Math.round(this.rate*this.seconds));
    let offset=0;
    for(const chunk of this.chunks){
      const length=Math.min(chunk.length,pcm.length-offset);
      pcm.set(chunk.subarray(0,length),offset);offset+=length;
      if(offset===pcm.length)break;
    }
    return {pitch:this.pitch,rate:this.rate,pcm,cents:this.centsTotal/this.frames};
  }
}

export function soundLoop(recording){
  const {pcm,rate}=recording;
  const trim=Math.round(rate*.15),fade=Math.round(rate*.04);
  const input=pcm.subarray(trim,pcm.length-trim);
  const output=Float32Array.from(input.subarray(fade));
  const mean=output.reduce((sum,value)=>sum+value,0)/output.length;
  for(let i=0;i<fade;i++){
    const mix=(1-Math.cos(Math.PI*i/(fade-1)))/2;
    const index=output.length-fade+i;
    output[index]=output[index]*(1-mix)+input[i]*mix;
  }
  let energy=0,peak=0;
  for(let i=0;i<output.length;i++){
    output[i]-=mean;energy+=output[i]**2;peak=Math.max(peak,Math.abs(output[i]));
  }
  const gain=peak?Math.min(.22/Math.sqrt(energy/output.length),.9/peak):1;
  for(let i=0;i<output.length;i++)output[i]*=gain;
  return output;
}

export class CustomSoundStore {
  constructor(database){this.database=database;this.connection=null;}
  open(){
    if(!this.database)return Promise.reject(Error('Sound recording storage is unavailable in this browser.'));
    if(!this.connection)this.connection=new Promise((resolve,reject)=>{
      const request=this.database.open('osm-custom-sounds-v1',2);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains('notes'))db.createObjectStore('notes',{keyPath:'pitch'});
        if(!db.objectStoreNames.contains('profiles'))db.createObjectStore('profiles',{keyPath:'id'});
        if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();this.connection=null;};
        resolve(db);
      };
      request.onerror=()=>reject(request.error??Error('Could not open sound storage.'));
      request.onblocked=()=>reject(Error('Close other OSM tabs to open sound storage.'));
    }).catch(error=>{this.connection=null;throw error;});
    return this.connection;
  }
  async all(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('notes','readonly');
      const request=transaction.objectStore('notes').getAll();
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error??Error('Could not read recorded sounds.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not read recorded sounds.'));
    });
  }
  async put(recording){
    if(!Number.isInteger(recording.pitch)||recording.pitch<69||recording.pitch>89||
      !Number.isFinite(recording.rate)||recording.rate<8000||recording.rate>192000||
      !(recording.pcm instanceof Float32Array)||recording.pcm.length!==Math.round(recording.rate*3)||
      !recording.pcm.every(Number.isFinite)||!Number.isFinite(recording.cents))throw Error('Invalid sound recording.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','settings'],'readwrite');
      transaction.objectStore('notes').put(recording);
      const draft=transaction.objectStore('settings').get('draft');
      draft.onsuccess=()=>transaction.objectStore('settings').put({...draft.result,key:'draft',dirty:true});
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('The recording could not be saved.'));
      transaction.onerror=()=>reject(transaction.error??Error('The recording could not be saved.'));
    });
  }
  async state(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readonly');
      const notes=transaction.objectStore('notes').getAll();
      const profiles=transaction.objectStore('profiles').getAll();
      const draft=transaction.objectStore('settings').get('draft');
      transaction.oncomplete=()=>resolve({recordings:notes.result,profiles:profiles.result,draft:draft.result??{profileId:null,name:'',dirty:notes.result.length>0}});
      transaction.onabort=()=>reject(transaction.error??Error('Could not load custom sounds.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not load custom sounds.'));
    });
  }
  async saveProfile(name,id=null){
    name=name.trim();
    if(!name)throw Error('Give this custom sound a name.');
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readwrite');
      const request=transaction.objectStore('notes').getAll();
      let profile;
      request.onsuccess=()=>{
        profile={id:id??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
          name,recordings:request.result,updatedAt:new Date().toISOString()};
        transaction.objectStore('profiles').put(profile);
        transaction.objectStore('settings').put({key:'draft',profileId:profile.id,name,dirty:false});
      };
      transaction.oncomplete=()=>resolve(profile);
      transaction.onabort=()=>reject(transaction.error??Error('Could not save this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not save this custom sound.'));
    });
  }
  async loadProfile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','profiles','settings'],'readwrite');
      let profile,error;
      const request=transaction.objectStore('profiles').get(id);
      request.onsuccess=()=>{
        profile=request.result;
        if(!profile){error=Error('This saved custom sound is no longer available.');transaction.abort();return;}
        const notes=transaction.objectStore('notes');notes.clear();
        for(const recording of profile.recordings)notes.put(recording);
        transaction.objectStore('settings').put({key:'draft',profileId:id,name:profile.name,dirty:false});
      };
      transaction.oncomplete=()=>resolve(profile);
      transaction.onabort=()=>reject(error??transaction.error??Error('Could not load this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not load this custom sound.'));
    });
  }
  async newDraft(){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['notes','settings'],'readwrite');
      transaction.objectStore('notes').clear();
      transaction.objectStore('settings').put({key:'draft',profileId:null,name:'',dirty:false});
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('Could not create a custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not create a custom sound.'));
    });
  }
  async deleteProfile(id){
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['profiles','notes','settings'],'readwrite');
      transaction.objectStore('profiles').delete(id);
      const draft=transaction.objectStore('settings').get('draft');
      draft.onsuccess=()=>{
        if(draft.result?.profileId===id){
          transaction.objectStore('notes').clear();
          transaction.objectStore('settings').put({key:'draft',profileId:null,name:'',dirty:false});
        }
      };
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(transaction.error??Error('Could not delete this custom sound.'));
      transaction.onerror=()=>reject(transaction.error??Error('Could not delete this custom sound.'));
    });
  }

}
