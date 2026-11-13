const recognitionPitches=Array.from({length:21},(_,i)=>69+i);
const recognitionPool=new Set(recognitionPitches);
const recognitionTarget=find('recognition-target');
const recognitionStatus=find('recognition-status');
const recognitionRatings=find('recognition-ratings');
const recognitionDeckKey='osm-recognition-fsrs-v1';
const recognitionButtons=new Map();
let recognitionDeck={};
try{recognitionDeck=JSON.parse(localStorage.getItem(recognitionDeckKey))||{};}catch{}
let recognitionPitch=null,recognitionMask=0,recognitionTimer=null;
let recognitionFlash=false,recognitionAnswered=false,recognitionNeedsRelease=false;
let recognitionScheduler;

function makeHoleDiagram(){
  const svg=makeFinger(69);
  svg.firstChild.setAttribute('d',fingerPaths[0][2].split('Z').slice(0,2).join('Z')+'Z');
  svg.classList.add('osm-hole-diagram');
  svg.firstChild.classList.add('recognition-body');
  for(const [x,y] of fingeringHoles){
    const hole=document.createElementNS(svgNS,'circle');
    hole.setAttribute('cx',x);hole.setAttribute('cy',y);hole.setAttribute('r',32);
    svg.append(hole);
  }
  return svg;
}
const diagram=makeHoleDiagram();
const holeControls=[...diagram.querySelectorAll('circle')].map((hole,i)=>{
  hole.setAttribute('role','button');hole.setAttribute('aria-label','Hole '+(i+1));
  hole.tabIndex=0;
  const toggle=()=>{
    if(recognitionAnswered||recognitionPitch===null)return;
    recognitionMask^=1<<i;drawRecognitionHoles();
  };
  hole.onclick=toggle;
  hole.onkeydown=event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}
  };
  return hole;
});
find('recognition-diagram').append(diagram);

function drawRecognitionHoles(){
  holeControls.forEach((hole,i)=>hole.setAttribute('aria-pressed',String(Boolean(recognitionMask&(1<<i)))));
}

function showRecognitionInput(microphone){
  find('recognition-diagram').hidden=microphone;
  find('recognition-submit').hidden=microphone;
  find('recognition-start').hidden=microphone;
  find('recognition-stop').hidden=!microphone;
  find('recognition-target').closest('.recognition-card').classList.toggle('recognition-mic',microphone);
}

function leaveRecognition(){
  clearTimeout(recognitionTimer);recognitionTimer=null;
  if(micSession?.mode==='recognition')stopMic();
  stopStep();
}

function nextRecognitionPitch(){
  clearTimeout(recognitionTimer);recognitionTimer=null;
  recognitionAnswered=false;recognitionMask=0;drawRecognitionHoles();
  recognitionTarget.classList.remove('recognition-hit');
  recognitionRatings.hidden=true;recognitionRatings.replaceChildren();
  const pitches=[...recognitionPool];
  if(recognitionFlash){
    const due=pitches.filter(pitch=>Date.parse(recognitionDeck[pitch]?.due??0)<=Date.now()||!recognitionDeck[pitch]);
    due.sort((a,b)=>Number(Boolean(recognitionDeck[b]))-Number(Boolean(recognitionDeck[a]))||
      (Date.parse(recognitionDeck[a]?.due)||0)-(Date.parse(recognitionDeck[b]?.due)||0));
    recognitionPitch=due[0]??null;
  }else{
    const choices=pitches.length>1?pitches.filter(pitch=>pitch!==recognitionPitch):pitches;
    recognitionPitch=choices[Math.floor(Math.random()*choices.length)]??null;
  }
  recognitionTarget.textContent=recognitionPitch===null?'—':name(recognitionPitch);
  for(const action of ['hear','submit','reveal'])find('recognition-'+action).disabled=recognitionPitch===null;
  find('recognition-start').disabled=recognitionPitch===null||micSession?.mode==='recognition';
  const nextDue=pitches.map(pitch=>Date.parse(recognitionDeck[pitch]?.due)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  recognitionStatus.textContent=!pitches.length?'Choose at least one pitch.':
    recognitionPitch===null?'All caught up. Next review '+new Date(nextDue).toLocaleString()+'.':'';
  if(recognitionPitch===null&&micSession?.mode==='recognition')stopMic();
}

function setRecognitionMode(flash){
  leaveRecognition();
  recognitionFlash=flash;
  find('recognition-free').setAttribute('aria-pressed',String(!flash));
  find('recognition-flash').setAttribute('aria-pressed',String(flash));
  find('recognition-reveal').hidden=!flash;
  nextRecognitionPitch();
}

async function openRecognitionFlashcards(){
  const button=find('recognition-flash');
  button.disabled=true;
  try{
    if(typeof OSMFSRS==='undefined')await loadAsset('fsrs.js');
    recognitionScheduler??=OSMFSRS.fsrs({request_retention:.9});
    if(currentPage==='practice-setup'&&practiceMode==='recognition')setRecognitionMode(true);
  }catch(error){recognitionStatus.textContent=error.message;}
  finally{button.disabled=false;}
}

function answerRecognition(correct){
  if(recognitionAnswered||recognitionPitch===null)return;
  if(!recognitionFlash&&!correct){recognitionStatus.textContent='Try again.';return;}
  recognitionAnswered=true;
  recognitionTarget.classList.toggle('recognition-hit',correct);
  recognitionStatus.textContent=correct?'Correct!':'Correct fingering shown.';
  if(!recognitionFlash){
    recognitionTimer=setTimeout(()=>{
      recognitionNeedsRelease=recognitionPool.size===1;
      nextRecognitionPitch();
    },650);
    return;
  }
  recognitionMask=fingeringMasks[recognitionPitch-69];drawRecognitionHoles();
  recognitionRatings.hidden=false;
  const pitch=recognitionPitch,now=new Date();
  const stored=recognitionDeck[pitch];
  const card=stored?{...stored,due:new Date(stored.due),last_review:new Date(stored.last_review)}:OSMFSRS.createEmptyCard(now);
  const options=recognitionScheduler.repeat(card,now);
  for(const label of (correct?['Again','Hard','Good','Easy']:['Again'])){
    const rating=document.createElement('button');
    rating.type='button';rating.className='ctrl';
    const next=options[OSMFSRS.Rating[label]].card;
    // Give new pitches an early confirmation review before FSRS sets longer intervals.
    if(!stored&&label==='Easy'&&next.due-now>1800000){
      next.due=new Date(now.getTime()+1800000);
      next.scheduled_days=0;
    }
    const minutes=Math.max(1,Math.round((next.due-now)/60000));
    const interval=minutes<60?minutes+'m':minutes<1440?Math.round(minutes/60)+'h':Math.round(minutes/1440)+'d';
    rating.textContent=label+' · '+interval;
    rating.onclick=()=>{
      recognitionDeck[pitch]=next;
      let saved=true;
      try{localStorage.setItem(recognitionDeckKey,JSON.stringify(recognitionDeck));}catch{saved=false;}
      recognitionNeedsRelease=true;nextRecognitionPitch();
      if(!saved)recognitionStatus.textContent='Review saved for this session only.';
    };
    recognitionRatings.append(rating);
  }
}

function updateRecognitionPool(){
  for(const [pitch,button] of recognitionButtons)button.setAttribute('aria-pressed',String(recognitionPool.has(pitch)));
  nextRecognitionPitch();
}

for(const pitch of recognitionPitches){
  const button=document.createElement('button');
  button.type='button';button.className='ctrl';button.textContent=name(pitch);
  function toggle(){
    if(recognitionPool.has(pitch))recognitionPool.delete(pitch);else recognitionPool.add(pitch);
    updateRecognitionPool();
  }
  button.onclick=toggle;
  button.oncontextmenu=event=>{event.preventDefault();toggle();};
  recognitionButtons.set(pitch,button);find('recognition-pool').append(button);
}
find('recognition-all').onclick=()=>{recognitionPitches.forEach(pitch=>recognitionPool.add(pitch));updateRecognitionPool();};
find('recognition-clear').onclick=()=>{recognitionPool.clear();updateRecognitionPool();};
find('recognition-free').onclick=()=>setRecognitionMode(false);
find('recognition-flash').onclick=openRecognitionFlashcards;
find('recognition-submit').onclick=()=>answerRecognition(recognitionMask===fingeringMasks[recognitionPitch-69]);
find('recognition-reveal').onclick=()=>answerRecognition(false);
find('recognition-hear').onclick=()=>{
  recognitionNeedsRelease=true;
  previewPitch(recognitionPitch);
};
find('recognition-stop').onclick=()=>stopMic('');
find('recognition-start').onclick=()=>listenMic('recognition',(midi,frequency,cents)=>{
  if(recognitionNeedsRelease){
    if(midi!==recognitionPitch&&!voices.has('step'))recognitionNeedsRelease=false;
    return;
  }
  if(midi!==null&&midi===recognitionPitch&&Math.abs(cents)<=45)answerRecognition(true);
});
find('practice-home').onclick=()=>openPage('home');
updateRecognitionPool();
