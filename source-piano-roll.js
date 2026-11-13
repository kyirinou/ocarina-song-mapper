const rollWindow=find('piano-roll'),rollScroll=find('roll-scroll');
const rollKeys=find('roll-class');
names.forEach((label,i)=>rollKeys.add(new Option(label,i)));
const rollRow=22;
let rollGrid,rollCursor,rollFrame,rollPlayback;
let rollNotes=[];
const rollScale=()=>Number(find('roll-zoom').value);
const rollStep=()=>Number(find('roll-grid').value);
const rollSnap=tick=>Math.round(tick/(find('roll-snap').checked?rollStep():.125))*(find('roll-snap').checked?rollStep():.125);
const rollTotal=()=>score.lengths.reduce((sum,ticks)=>sum+ticks,0);

function drawTimeline(){
  if(!rollWindow.open)return;
  let tick=0;
  rollNotes=score.events.flatMap((event,index)=>{
    const start=tick;tick+=event.ticks;
    return event.pitch===null?[]:[{...event,index,start}];
  });
  const low=Math.min(69,...rollNotes.map(note=>note.pitch));
  const high=Math.max(89,...rollNotes.map(note=>note.pitch));
  const scale=rollScale();
  const content=document.createElement('div');content.className='roll-content';
  const keyboard=document.createElement('div');keyboard.className='roll-keyboard';
  rollGrid=document.createElement('div');rollGrid.className='roll-grid';
  const measure=meterTicks(score.meter);
  const length=Math.max(measure*2,Math.ceil((tick+measure)/measure)*measure);
  rollGrid.style.width=length*scale+'px';
  rollGrid.style.height=((high-low+1)*rollRow+26)+'px';
  rollGrid.style.setProperty('--roll-beat',4*scale+'px');
  rollGrid.style.setProperty('--roll-step',Math.max(2,rollStep()*scale)+'px');
  rollGrid.style.setProperty('--roll-measure',measure*scale+'px');
  const ruler=document.createElement('div');ruler.className='roll-ruler';
  for(let t=0;t<length;t+=measure){
    const marker=document.createElement('span');
    marker.textContent=String(1+Math.round(t/measure));marker.style.left=t*scale+'px';
    ruler.append(marker);
  }
  rollGrid.append(ruler);
  const isBlack=pitch=>names[pitch%12].includes('♯');
  for(let pitch=high;pitch>=low;pitch--){
    const black=isBlack(pitch);
    const top=26+(high-pitch)*rollRow;
    const before=!black&&pitch<high&&isBlack(pitch+1)?rollRow/2:0;
    const after=!black&&pitch>low&&isBlack(pitch-1)?rollRow/2:0;
    const key=document.createElement('button');
    key.type='button';key.className=black?'roll-black-key':'roll-white-key';
    key.style.top=(black?top+2:top-before)+'px';
    key.style.height=(black?rollRow-4:rollRow+before+after)+'px';
    key.title=name(pitch);key.setAttribute('aria-label','Audition '+name(pitch));
    const labels=find('roll-key-labels').value;
    if(labels==='all'||(labels==='octaves'&&pitch%12===0))key.textContent=name(pitch);
    key.onclick=()=>previewPitch(pitch);
    keyboard.append(key);
  }
  for(const note of rollNotes){
    const button=document.createElement('button');
    button.type='button';button.className='roll-note';
    const label=document.createElement('span');
    label.textContent=name(note.pitch);label.hidden=!find('roll-note-labels').checked;
    button.append(label);
    button.setAttribute('aria-label',name(note.pitch));
    button.title=name(note.pitch)+' · Beat '+(1+note.start/4)+' · Velocity '+(note.velocity??100);
    button.style.left=note.start*scale+'px';
    button.style.top=(26+(high-note.pitch)*rollRow+2)+'px';
    button.style.width=Math.max(2,note.ticks*scale)+'px';
    button.classList.toggle('roll-muted',Boolean(note.muted));
    button.dataset.index=note.index;
    const grip=document.createElement('span');grip.className='roll-resize';button.append(grip);
    button.onclick=event=>{selectPosition(note.index,event);updateRollSelection();};
    button.onpointerdown=event=>dragRollNote(event,button,note,grip,low,high);
    rollGrid.append(button);
  }
  rollCursor=document.createElement('div');rollCursor.className='roll-cursor';rollCursor.hidden=!rollPlayback;
  rollGrid.append(rollCursor);
  rollGrid.ondblclick=event=>{
    if(event.target!==rollGrid||recording)return;
    const rect=rollGrid.getBoundingClientRect(),y=event.clientY-rect.top-26;
    if(y<0)return;
    const start=Math.max(0,rollSnap((event.clientX-rect.left)/scale));
    const pitch=high-Math.floor(y/rollRow);
    const next={pitch,start,ticks:rollStep()};
    commitRollNotes([...rollNotes,next],next);
  };
  const {scrollLeft,scrollTop}=rollScroll;
  content.append(keyboard,rollGrid);rollScroll.replaceChildren(content);
  rollScroll.scrollLeft=scrollLeft;rollScroll.scrollTop=scrollTop;
  updateRollSelection();
}

function updateRollSelection(){
  if(!rollWindow.open||!rollGrid)return;
  const selected=rollNotes.filter(note=>selectedNotes.has(note.index));
  for(const card of rollGrid.querySelectorAll('.roll-note')){
    card.setAttribute('aria-pressed',String(selectedNotes.has(Number(card.dataset.index))));
  }
  for(const id of ['roll-delete','roll-mute','roll-velocity'])find(id).disabled=!selected.length;
  const active=selected.find(note=>note.index===position)??selected.at(-1);
  find('roll-start').disabled=selected.length!==1;
  find('roll-duration').disabled=selected.length!==1;
  find('roll-start').value=active?active.start/4:'';
  find('roll-duration').value=active?active.ticks/4:'';
  find('roll-velocity').value=active?(active.velocity??100):'';
  find('roll-status').textContent=selected.length+' selected · '+rollNotes.length+' notes';
}

function commitRollNotes(notes,focus){
  notes.sort((a,b)=>a.start-b.start);
  let end=0,selectedIndex=0;
  const events=[];
  for(const note of notes){
    const gap=note.start-end;
    if(gap<-.00001){
      find('roll-status').textContent='Notes overlap. Move the note to free space or shorten it.';
      return false;
    }
    if(gap>.00001)events.push({pitch:null,ticks:gap,ms:null});
    if(note===focus)selectedIndex=events.length;
    events.push({pitch:note.pitch,ticks:note.ticks,velocity:note.velocity,muted:note.muted,ms:null});
    end=note.start+note.ticks;
  }
  const tail=rollTotal()-end;
  if(tail>.00001)events.push({pitch:null,ticks:tail,ms:null});
  score.events=events;
  edited(selectedIndex,true);
  return true;
}

function dragRollNote(event,button,note,grip,low,high){
  if(event.button!==0||recording||event.shiftKey||event.metaKey||event.ctrlKey)return;
  const x=event.clientX,y=event.clientY,resize=event.target===grip;
  const scale=rollScale();
  let draft;
  button.setPointerCapture(event.pointerId);
  button.onpointermove=move=>{
    const dx=move.clientX-x,dy=move.clientY-y;
    if(!draft&&Math.abs(dx)+Math.abs(dy)<4)return;
    draft={...note};
    if(resize)draft.ticks=Math.max(.125,rollSnap(note.ticks+dx/scale));
    else{
      draft.start=Math.max(0,rollSnap(note.start+dx/scale));
      draft.pitch=Math.min(high,Math.max(low,note.pitch-Math.round(dy/rollRow)));
    }
    button.style.left=draft.start*scale+'px';
    button.style.top=(26+(high-draft.pitch)*rollRow+2)+'px';
    button.style.width=Math.max(2,draft.ticks*scale)+'px';
    button.firstChild.textContent=name(draft.pitch);
  };
  button.onpointerup=()=>{
    button.onpointermove=null;
    if(!draft)return;
    if(!commitRollNotes(rollNotes.map(entry=>entry===note?draft:entry),draft)){
      const message=find('roll-status').textContent;
      drawTimeline();find('roll-status').textContent=message;
    }
  };
  button.onpointercancel=drawTimeline;
}

function changeRollPerformance(change){
  if(recording)return;
  const selected=new Set(selectedNotes);
  const anchor=selectionAnchor;
  const indexes=rollNotes.filter(note=>selected.has(note.index)).map(note=>note.index);
  if(!indexes.length)return;
  change(indexes.map(index=>score.events[index]));
  edited(position);
  selectedNotes=selected;selectionAnchor=anchor;renderNoteSelection();updateRollSelection();
}

function editRollTiming(humanize){
  if(recording)return;
  const step=rollStep();
  const swing=Math.min(75,Math.max(50,Number(find('roll-swing').value)||50));
  const selected=rollNotes.filter(note=>selectedNotes.has(note.index));
  const targets=new Set(selected.length>1?selected:rollNotes);
  const notes=rollNotes.map(note=>{
    if(!targets.has(note))return note;
    const subdivision=Math.round(note.start/step);
    const start=humanize?note.start+(Math.random()-.5)*Math.max(.25,step*.4):
      subdivision*step+(subdivision%2?step*(swing/50-1):0);
    return {...note,start:Math.max(0,Math.round(start*8)/8)};
  });
  for(let i=0;i<notes.length-1;i++){
    const gap=notes[i+1].start-notes[i].start;
    if(gap>=.125&&targets.has(rollNotes[i]))notes[i].ticks=Math.min(notes[i].ticks,gap);
  }
  commitRollNotes(notes,notes.find(note=>note.index===position));
}

function stopRollCursor(){
  cancelAnimationFrame(rollFrame);rollFrame=null;rollPlayback=null;
  if(rollCursor)rollCursor.hidden=true;
}

function startRollCursor(index,duration){
  cancelAnimationFrame(rollFrame);
  const start=score.events.slice(0,index).reduce((sum,event)=>sum+event.ticks,0);
  rollPlayback={start,length:score.events[index].ticks,time:performance.now(),duration};
  if(rollWindow.open)animateRollCursor();
}

function animateRollCursor(){
  if(!rollPlayback||!rollWindow.open||!rollCursor)return;
  const {start,length,time,duration}=rollPlayback;
  const x=(start+length*Math.min(1,(performance.now()-time)/duration))*rollScale();
  rollCursor.hidden=false;rollCursor.style.left=x+'px';
  if(find('roll-follow').checked&&
    (x<rollScroll.scrollLeft||x>rollScroll.scrollLeft+rollScroll.clientWidth-85)){
    rollScroll.scrollLeft=Math.max(0,x-35);
  }
  rollFrame=requestAnimationFrame(animateRollCursor);
}

function openPianoRoll(){
  if(rollWindow.open)return;
  rollWindow.show();
  if(rollWindow.style.inset){const {left,top}=rollWindow.getBoundingClientRect();placeRollWindow(left,top);}
  drawTimeline();
  if(rollPlayback)animateRollCursor();
}

find('roll-close').onclick=()=>rollWindow.close();
find('roll-play').onclick=play;
find('roll-stop').onclick=stopMelody;
for(const id of ['roll-grid','roll-zoom','roll-key-labels','roll-note-labels'])find(id).onchange=drawTimeline;
for(const [id,property,min] of [['roll-start','start',0],['roll-duration','ticks',.125]]){
  find(id).onchange=event=>{
    if(recording||selectedNotes.size!==1||!event.target.value)return;
    const note=rollNotes.find(entry=>selectedNotes.has(entry.index));
    if(!note)return;
    const draft={...note,[property]:Math.max(min,rollSnap(Number(event.target.value)*4))};
    if(!commitRollNotes(rollNotes.map(entry=>entry===note?draft:entry),draft)){
      const message=find('roll-status').textContent;
      updateRollSelection();find('roll-status').textContent=message;
    }
  };
}
find('roll-delete').onclick=()=>{
  if(!recording&&rollNotes.some(note=>selectedNotes.has(note.index)))commitRollNotes(rollNotes.filter(note=>!selectedNotes.has(note.index)));
};
find('roll-mute').onclick=()=>changeRollPerformance(events=>{
  const mute=events.some(event=>!event.muted);
  events.forEach(event=>event.muted=mute);
});
find('roll-velocity').onchange=event=>changeRollPerformance(events=>{
  const value=Math.max(1,Math.min(127,Math.round(Number(event.target.value)||100)));
  events.forEach(note=>note.velocity=value);
});
find('roll-quantize').onclick=()=>editRollTiming(false);
find('roll-humanize').onclick=()=>editRollTiming(true);
find('roll-select').onclick=()=>{
  const pitch=rollKeys.value,length=find('roll-length').value,velocity=find('roll-match').value;
  const indexes=rollNotes.filter(note=>(pitch===''||note.pitch%12===Number(pitch))&&
    (length===''||Math.abs(note.ticks/4-Number(length))<.00001)&&
    (velocity===''||(note.velocity??100)===Number(velocity))).map(note=>note.index);
  selectedNotes=new Set(indexes);
  if(indexes.length)position=selectionAnchor=indexes[0];
  renderNoteSelection();updateRollSelection();
};
rollWindow.addEventListener('keydown',event=>{
  if(event.key==='Escape'){rollWindow.close();return;}
  if(!editable(event.target)&&['Delete','Backspace'].includes(event.key)){
    event.preventDefault();find('roll-delete').click();
  }
});

const rollTitleBar=rollWindow.querySelector('header');
function placeRollWindow(left,top){
  const width=rollWindow.offsetWidth,height=rollWindow.offsetHeight;
  rollWindow.style.inset=Math.max(0,Math.min(top,innerHeight-height))+'px auto auto '+
    Math.max(0,Math.min(left,innerWidth-width))+'px';
}
rollTitleBar.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button'))return;
  const {left,top}=rollWindow.getBoundingClientRect();
  const x=event.clientX-left,y=event.clientY-top;
  rollTitleBar.setPointerCapture(event.pointerId);
  rollTitleBar.onpointermove=move=>placeRollWindow(move.clientX-x,move.clientY-y);
});
rollTitleBar.addEventListener('lostpointercapture',()=>{rollTitleBar.onpointermove=null;});
window.addEventListener('resize',()=>{
  if(!rollWindow.open||!rollWindow.style.inset)return;
  const {left,top}=rollWindow.getBoundingClientRect();
  placeRollWindow(left,top);
});


find('editor-home').onclick=()=>find('home').click();
for(const handle of rollWindow.querySelectorAll('[data-roll-size]')){
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const {left,top,width,height}=rollWindow.getBoundingClientRect();
    const {clientX:x,clientY:y}=event;
    const axis=handle.dataset.rollSize;
    placeRollWindow(left,top);
    handle.setPointerCapture(event.pointerId);
    handle.onpointermove=move=>{
      const availableWidth=innerWidth-left,availableHeight=innerHeight-top;
      if(axis!=='height')rollWindow.style.width=Math.min(availableWidth,Math.max(360,width+move.clientX-x))+'px';
      if(axis!=='width')rollWindow.style.height=Math.min(availableHeight,Math.max(240,height+move.clientY-y))+'px';
    };
  });
  handle.addEventListener('lostpointercapture',()=>{handle.onpointermove=null;});
}
