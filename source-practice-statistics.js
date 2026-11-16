const recognitionStatsKey='osm-recognition-statistics-v1';

function readPracticeData(key){
  try{return JSON.parse(localStorage.getItem(key));}catch{return null;}
}

const savedRecognitionStats=readPracticeData(recognitionStatsKey);
const recognitionTotals=savedRecognitionStats?.totals??{};
const recognitionSessions=Array.isArray(savedRecognitionStats?.sessions)?savedRecognitionStats.sessions:[];
let recognitionSession=null;

function accuracyPercent(correct,attempts){
  return Math.round(100*correct/attempts);
}

function renderPracticeHistory(){
  const stored=readPracticeData('osm-practice-history');
  const sessions=[...(Array.isArray(stored)?stored:[]),...recognitionSessions]
    .filter(session=>session&&Number.isFinite(Date.parse(session.date)))
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
  const list=find('practice-history');
  list.replaceChildren();
  if(!sessions.length){
    const item=document.createElement('li');
    item.textContent='No completed sessions yet.';
    list.append(item);
  }
  for(const session of sessions){
    const item=document.createElement('li');
    const date=new Date(session.date).toLocaleDateString();
    if(session.mode==='recognition'){
      item.textContent=date+' · Note recognition ('+session.studyMode+') · '+session.correct+'/'+session.attempts+
        ' correct · '+accuracyPercent(session.correct,session.attempts)+'%';
    }else{
      item.textContent=date+' · '+session.matched+'/'+session.notes+' matched'+
        (session.meanTiming==null?'':' · '+session.meanTiming+' ms mean timing error');
    }
    list.append(item);
  }
}

const recognitionStatRows=new Map();
function renderRecognitionStatistics(){
  let correct=0,attempts=0;
  for(const [pitch,{bar,result}] of recognitionStatRows){
    const total=recognitionTotals[pitch];
    const count=total?.attempts??0,hits=total?.correct??0;
    correct+=hits;attempts+=count;
    bar.value=count?hits/count:0;
    result.textContent=count?accuracyPercent(hits,count)+'% · '+hits+'/'+count:'No attempts';
  }
  find('recognition-accuracy').textContent=attempts
    ?'Overall: '+accuracyPercent(correct,attempts)+'% · '+correct+'/'+attempts+' correct'
    :'No answers recorded yet.';
}

function recordRecognitionAttempt(pitch,correct,flash){
  if(!recognitionSession){
    recognitionSession={mode:'recognition',studyMode:flash?'Flashcards':'Free mode',attempts:0,correct:0};
    recognitionSessions.unshift(recognitionSession);
    recognitionSessions.length=Math.min(recognitionSessions.length,30);
  }
  recognitionSession.date=new Date().toISOString();
  recognitionSession.attempts++;
  recognitionSession.correct+=Number(correct);
  const total=recognitionTotals[pitch]??{attempts:0,correct:0};
  total.attempts++;
  total.correct+=Number(correct);
  recognitionTotals[pitch]=total;
  try{localStorage.setItem(recognitionStatsKey,JSON.stringify({totals:recognitionTotals,sessions:recognitionSessions}));}catch{}
  renderRecognitionStatistics();
}

for(let pitch=69;pitch<=89;pitch++){
  const item=document.createElement('li'),label=document.createElement('span');
  const bar=document.createElement('meter'),result=document.createElement('span');
  label.textContent=name(pitch);
  bar.max=1;
  bar.setAttribute('aria-label',name(pitch)+' accuracy');
  result.id='oc93-recognition-stat-'+pitch;
  bar.setAttribute('aria-describedby',result.id);
  item.append(label,bar,result);
  find('recognition-pitch-stats').append(item);
  recognitionStatRows.set(pitch,{bar,result});
}
renderRecognitionStatistics();
