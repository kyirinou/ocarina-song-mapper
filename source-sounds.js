const soundSettings=find('sound-settings');
const soundRadios=[...soundSettings.querySelectorAll('input[type=radio]')];
let soundChoice='oc2';
try{
const savedSound=localStorage.getItem('osm-ocarina-sound');
if(soundRadios.some(radio=>radio.value===savedSound))soundChoice=savedSound;
}catch{}
for(const radio of soundRadios){
radio.checked=radio.value===soundChoice;
radio.addEventListener('change',()=>{
if(!radio.checked)return;
stopSoundSample();soundChoice=radio.value;prepareSound()?.catch(loadError);
try{localStorage.setItem('osm-ocarina-sound',soundChoice);}catch{}
});
}
find('sound-open').addEventListener('click',()=>soundSettings.showModal());
const odeToJoy=[
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[76,1.5],[74,.5],[74,2],
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[74,1.5],[72,.5],[72,2],
[74,1],[74,1],[76,1],[72,1],[74,1],[76,.5],[77,.5],[76,1],[72,1],
[74,1],[76,.5],[77,.5],[76,1],[74,1],[72,1],[74,1],[67,2],
[76,1],[76,1],[77,1],[79,1],[79,1],[77,1],[76,1],[74,1],
[72,1],[72,1],[74,1],[76,1],[74,1.5],[72,.5],[72,2]
];
let soundSampleTimer=null;
function stopSoundSample(){
clearTimeout(soundSampleTimer);soundSampleTimer=null;end('sound-sample');
}
find('sound-preview').addEventListener('click',()=>{
stopSoundSample();stopStep();
let index=0;
function next(){
if(!soundSettings.open||index>=odeToJoy.length)return;
const [pitch,beats]=odeToJoy[index++];
start('sound-sample',-1,pitch);
const duration=340*beats;
soundSampleTimer=setTimeout(()=>{
end('sound-sample');
soundSampleTimer=setTimeout(next,duration*.14);
},duration*.86);
}
next();
});
find('sound-done').addEventListener('click',()=>soundSettings.close());
soundSettings.addEventListener('close',stopSoundSample);


for(const [id,attribute] of [['theme','theme'],['interface-font','font']]){
  const field=find(id),key='osm-'+attribute;
  try{
    const saved=localStorage.getItem(key);
    if([...field.options].some(option=>option.value===saved))field.value=saved;
  }catch{}
  document.documentElement.dataset[attribute]=field.value;
  field.addEventListener('change',()=>{
    document.documentElement.dataset[attribute]=field.value;
    try{localStorage.setItem(key,field.value);}catch{}
  });
}

const settingsTabs=[...soundSettings.querySelectorAll('[data-settings-panel]')];
for(const tab of settingsTabs)tab.onclick=()=>{
  for(const entry of settingsTabs){
    const active=entry===tab;
    entry.setAttribute('aria-pressed',String(active));
    find('settings-'+entry.dataset.settingsPanel).hidden=!active;
  }
  if(tab.dataset.settingsPanel!=='audio')stopSoundSample();
};
