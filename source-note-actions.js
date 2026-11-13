const noteMenu=find('note-menu'), swapDialog=find('swap-dialog'), swapStatus=find('swap-status');
const swapChoices=find('swap-choices'), swapConfirm=find('swap-confirm');
let swapIndex=-1, swapPitch=null;
function closeNoteMenu(){
noteMenu.hidden=true;
}
function openNoteMenu(index,x,y){
selectPosition(index);
find('note-menu-earlier').disabled=index===0;
find('note-menu-later').disabled=index===score.events.length-1;
noteMenu.hidden=false;
noteMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-noteMenu.offsetWidth-8))+'px';
noteMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-noteMenu.offsetHeight-8))+'px';
find('note-menu-swap').focus();
}
function openSwap(){
if(!score.events.length||recording||micSession?.mode==='convert'){
report('Finish recording before swapping a note.');return;
}
closeNoteMenu();stopSound();
swapIndex=position;swapPitch=null;swapConfirm.disabled=true;
swapStatus.textContent='Replacing note '+(swapIndex+1)+' ('+name(score.events[swapIndex].pitch)+'). Click a pitch to hear it.';
for(const button of swapChoices.children)button.setAttribute('aria-pressed','false');
swapDialog.showModal();
}
for(let midi=69;midi<=89;midi++){
const button=document.createElement('button');
button.type='button';button.className='ctrl swap-choice';
button.setAttribute('aria-pressed','false');
const label=document.createElement('span');label.textContent=name(midi);
button.append(makeFinger(midi),label);
button.addEventListener('click',()=>{
swapPitch=midi;swapConfirm.disabled=false;
for(const choice of swapChoices.children)choice.setAttribute('aria-pressed',String(choice===button));
swapStatus.textContent=name(midi)+' selected. Choose it to replace note '+(swapIndex+1)+'.';
previewPitch(midi);
});
swapChoices.append(button);
}
find('swap-note').addEventListener('click',openSwap);
find('swap-cancel').addEventListener('click',()=>swapDialog.close());
swapConfirm.addEventListener('click',()=>{
if(swapPitch===null||swapIndex<0||swapIndex>=score.events.length)return;
const index=swapIndex;
score.events[index].pitch=swapPitch;
edited(index);
swapDialog.close();
report('Note '+(index+1)+' changed to '+name(score.events[index].pitch)+'.');
});
swapDialog.addEventListener('close',()=>{
stopStep();swapIndex=-1;swapPitch=null;
pads[position]?.focus({preventScroll:true});
});
const menuActions={
swap:openSwap,
hear:()=>{stopStep();start('step',position);stepTimer=setTimeout(stopStep,320);},
insert:()=>find('insert').click(),
earlier:()=>move(-1),
later:()=>move(1),
remove:removeSelected,
};
for(const [key,action] of Object.entries(menuActions)){
find('note-menu-'+key).addEventListener('click',()=>{
closeNoteMenu();action();
if(key!=='swap')pads[position]?.focus({preventScroll:true});
});
}
document.addEventListener('pointerdown',e=>{
if(!noteMenu.hidden&&!noteMenu.contains(e.target))closeNoteMenu();
});
document.addEventListener('keydown',e=>{
if(!noteMenu.hidden&&e.key==='Escape'){
e.preventDefault();closeNoteMenu();pads[position]?.focus({preventScroll:true});
}
});
window.addEventListener('resize',closeNoteMenu);

