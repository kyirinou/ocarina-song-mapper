const teachDialog=find('scan-teach');
const teachCanvas=find('scan-canvas');
const teachStatus=find('scan-teach-status');
const teachExamples=find('scan-examples');
const teachUse=find('scan-teach-use');

function teachTabLayout(source){
  const {width,height}=source;
  const context=teachCanvas.getContext('2d');
  const pixels=source.getContext('2d').getImageData(0,0,width,height).data;
  teachCanvas.width=width;teachCanvas.height=height;
  let start=null,groups=[],ordered=[];
  function paint(boxes=[]){
    context.drawImage(source,0,0);
    context.lineWidth=Math.max(2,width/450);context.strokeStyle='#0077df';
    for(const {l,t,w,h} of boxes)context.strokeRect(l,t,w,h);
  }
  function point(event){
    const rect=teachCanvas.getBoundingClientRect();
    return [Math.round(Math.min(width,Math.max(0,(event.clientX-rect.left)*width/rect.width))),
      Math.round(Math.min(height,Math.max(0,(event.clientY-rect.top)*height/rect.height)))];
  }
  function selection(event){
    const [x,y]=point(event),[a,b]=start;
    return {l:Math.min(x,a),t:Math.min(y,b),w:Math.abs(x-a),h:Math.abs(y-b)};
  }
  function labelGroups(example){
    groups=[];ordered=[];teachExamples.replaceChildren();teachUse.disabled=true;
    if(example.w<12||example.h<12){teachStatus.textContent='Draw a larger box around one fingering.';return;}
    const boxes=collectSimilarTabBoxes(pixels,width,height,example);
    const rows=[];
    for(const box of boxes.sort((a,b)=>a.t-b.t)){
      const row=rows.find(row=>Math.abs(row[0].t-box.t)<example.h*.45);
      if(row)row.push(box);else rows.push([box]);
    }
    ordered=rows.flatMap(row=>row.sort((a,b)=>a.l-b.l));
    for(const box of ordered){
      const signature=tabCropSignature(pixels,width,box);
      let group=groups.find(entry=>entry.signature.reduce((sum,value,i)=>sum+Math.abs(value-signature[i]),0)/signature.length<.012);
      if(!group){group={box,signature,count:0};groups.push(group);}
      group.count++;box.group=group;
    }
    paint(ordered);
    teachStatus.textContent=ordered.length+' diagrams found. Check the boxes, then label each distinct fingering.';
    for(const group of groups){
      const {l,t,w,h}=group.box;
      const label=document.createElement('label');
      const thumbnail=document.createElement('canvas');
      thumbnail.width=w;thumbnail.height=h;
      thumbnail.getContext('2d').drawImage(source,l,t,w,h,0,0,w,h);
      const select=document.createElement('select');
      select.setAttribute('aria-label','Pitch for fingering '+(teachExamples.children.length+1));
      select.add(new Option('Choose pitch',''));
      for(let midi=69;midi<=89;midi++)select.add(new Option(name(midi),midi));
      select.add(new Option('Skip diagram','skip'));
      select.onchange=()=>{
        group.pitch=select.value;
        teachUse.disabled=groups.some(entry=>!entry.pitch)||groups.every(entry=>entry.pitch==='skip');
      };
      label.append(thumbnail,document.createTextNode('×'+group.count),select);
      teachExamples.append(label);
    }
  }
  teachCanvas.onpointerdown=event=>{
    if(event.button!==0)return;
    start=point(event);teachCanvas.setPointerCapture(event.pointerId);
  };
  teachCanvas.onpointermove=event=>{if(start)paint([selection(event)]);};
  teachCanvas.onpointerup=event=>{
    if(!start)return;
    const example=selection(event);start=null;labelGroups(example);
  };
  teachCanvas.onpointercancel=()=>{start=null;paint(ordered);};
  teachUse.onclick=()=>teachDialog.close('use');
  find('scan-teach-cancel').onclick=()=>teachDialog.close('cancel');
  teachExamples.replaceChildren();teachStatus.textContent='';teachUse.disabled=true;
  paint();teachDialog.returnValue='';teachDialog.showModal();
  return new Promise(resolve=>teachDialog.addEventListener('close',()=>{
    teachCanvas.onpointerdown=teachCanvas.onpointermove=teachCanvas.onpointerup=teachCanvas.onpointercancel=null;
    resolve(teachDialog.returnValue==='use'?ordered.filter(box=>box.group.pitch!=='skip').map(box=>Number(box.group.pitch)):null);
    teachExamples.replaceChildren();teachCanvas.width=teachCanvas.height=1;
  },{once:true}));
}

function collectSimilarTabBoxes(pixels,width,height,example){
  const matches=[example];
  // Try several contrasts so pale backgrounds and thin strokes can still form
  // a connected outline. Merge repeated detections of the same diagram.
  for(const threshold of [585,690,480]){
    const {boxes}=findFingeringBoxes(pixels,width,height,threshold,.45,2.4,12,12);
    for(const box of boxes){
      if(Math.abs(box.w/example.w-1)>.24||Math.abs(box.h/example.h-1)>.24)continue;
      if(matches.some(other=>Math.abs(other.l+other.w/2-box.l-box.w/2)<example.w*.45&&
        Math.abs(other.t+other.h/2-box.t-box.h/2)<example.h*.45))continue;
      matches.push(box);
    }
  }
  return matches;
}

function tabCropSignature(pixels,width,{l,t,w,h}){
  const signature=[];
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){
    const index=((t+Math.floor((y+.5)*h/24))*width+l+Math.floor((x+.5)*w/24))*4;
    const light=(pixels[index]+pixels[index+1]+pixels[index+2])/765;
    signature.push(pixels[index+3]>128&&light<.55?1:0);
  }
  return signature;
}
