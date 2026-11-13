const tunerHistory=[];
const tunerWindowMs=4000;
const pitchCanvas=find('pitch-history');
const waveCanvas=find('input-wave');

function prepareTunerPlot(canvas){
  const bounds=canvas.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const ratio=window.devicePixelRatio||1;
  const width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const context=canvas.getContext('2d');
  const theme=getComputedStyle(canvas);
  context.clearRect(0,0,width,height);
  context.lineWidth=ratio;
  context.strokeStyle=theme.getPropertyValue('--viz-border');
  context.beginPath();
  for(const fraction of [.25,.5,.75]){
    context.moveTo(0,height*fraction);context.lineTo(width,height*fraction);
    context.moveTo(width*fraction,0);context.lineTo(width*fraction,height);
  }
  context.stroke();
  context.lineWidth=1.6*ratio;
  context.strokeStyle=theme.getPropertyValue('--viz-accent');
  context.beginPath();
  return {context,width,height};
}

function drawTunerWave(samples,sampleRate){
  const plot=prepareTunerPlot(waveCanvas);
  if(!plot)return;
  const {context,width,height}=plot;
  const count=Math.min(samples.length,Math.round(sampleRate*.02));
  const peak=Math.max(.03,...samples.subarray(0,count).map(Math.abs));
  for(let i=0;i<count;i++){
    const x=i*width/(count-1),y=height*(.5-.42*samples[i]/peak);
    if(i===0)context.moveTo(x,y);else context.lineTo(x,y);
  }
  context.stroke();
}

function drawPitchHistory(now=performance.now()){
  const plot=prepareTunerPlot(pitchCanvas);
  if(!plot)return;
  const {context,width,height}=plot;
  const reference=[...tunerHistory].reverse().find(point=>point.midi!==null)?.midi;
  const deviation=point=>(point.midi-reference)*100+point.cents;
  const limit=Math.max(50,50*Math.ceil(Math.max(0,...tunerHistory.filter(point=>point.midi!==null).map(point=>Math.abs(deviation(point))))/50));
  find('pitch-range').textContent=reference===undefined?'Cents · last 4 s':name(reference)+' · cents';
  find('plot-high').textContent='+'+limit;
  find('plot-low').textContent='−'+limit;
  let connected=false;
  for(const point of tunerHistory){
    if(point.midi===null){connected=false;continue;}
    const x=(1-(now-point.time)/tunerWindowMs)*width;
    const y=height*(.5-.46*deviation(point)/limit);
    if(connected)context.lineTo(x,y);else context.moveTo(x,y);
    connected=true;
  }
  context.stroke();
}

function plotTunerPitch(midi,cents){
  const time=performance.now();
  tunerHistory.push({midi,cents,time});
  while(tunerHistory[0].time<time-tunerWindowMs)tunerHistory.shift();
  drawPitchHistory(time);
}

function resetTunerGraphs(){
  tunerHistory.length=0;
  drawPitchHistory();
  prepareTunerPlot(waveCanvas);
}

if(window.ResizeObserver){
  new ResizeObserver(()=>{
    drawPitchHistory();
    if(micSession?.mode!=='tuner')prepareTunerPlot(waveCanvas);
  }).observe(pitchCanvas);
}
