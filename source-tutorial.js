const tutorial=find('tour');
const tutorialSteps=[
 [
  "Home and sounds",
  "home",
  "[data-oc-page='help']",
  "Find your way around",
  "OSM groups composing, importing, saved scores, playable notes, practice, and tuning on the home screen. The lower-right link opens kiri’s GitHub profile."
 ],
 [
  "Home and sounds",
  "home",
  "#oc93-sound-open",
  "Choose an ocarina sound",
  "Open the gear and choose oc1, oc2, or oc3. Hear sample plays Ode to Joy. The browser remembers your choice for score playback and note previews."
 ],
 [
  "Home and sounds",
  "palette",
  "#oc93-palette",
  "Hear and see fingerings",
  "Click a pitch or press its displayed letter. The centered chart shows the matching fingering and pitch."
 ],
 [
  "Home and sounds",
  "tuner",
  "#oc93-tuner-start",
  "Tune a real ocarina",
  "Start the microphone to see the pitch, frequency, cents from center, and Alto C fingering. Pitch history shows vibrato over four seconds. Input waveform shows the microphone signal."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-text",
  "Paste notes or ABC",
  "Paste note names such as F4 - C5 - Bb4, or single-voice ABC. Notes outside A4–F6 appear in yellow in the editor. Supported ABC can include key signatures, accidentals, rests, ties, tuplets, and inline tempo changes."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-import-image",
  "Read a fingering image",
  "Upload clear PNG or JPG fingering diagrams or a PDF. OSM reads numbered PDF labels when present and otherwise tries scanning the diagrams. Correct detected pitches in the review dialog before continuing. Image imports start with one beat per event."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-midi-file",
  "Import a MIDI melody",
  "Choose a monophonic track. Written durations and rests are retained, and tempo changes are used in playback and notation. If possible, OSM offers to transpose an out-of-range melody."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-musicxml-file",
  "Import MusicXML",
  "Import a single partwise melody. OSM reads pitch, key, meter, rests, forward gaps, ties, tuplet durations, and tempo directions. Multipart scores, chords, grace notes, and multiple simultaneous voices need preparation elsewhere."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-audio-file",
  "Transcribe a recording",
  "Select a solo WAV or MP3. Review the resulting pitches and estimated tempo before opening the take as a score."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-calibrate",
  "Record with the microphone",
  "Optionally measure room noise, then play one note at a time. The waveform and input meter show what the microphone receives. Leave a clear gap between repeated pitches."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-take-tempo",
  "Review a detected melody",
  "Stop capture to see pitch choices, uncertain notes, durations, and the estimated tempo. Correct pitches and adjust the tempo before opening the take. Detected pauses can become rests."
 ],
 [
  "Import and capture",
  "import",
  "#oc93-restore",
  "Restore a project backup",
  "Import an exported JSON project to restore its score and settings. Saved scores are stored in this browser and listed under Recent scores on the main menu."
 ],
 [
  "Score editing",
  "editor",
  ".osm-menubar",
  "Use the editor menus",
  "File opens imports and exports. Edit has note actions. View switches between the staff and note sequence. Window shows or hides the editing panels. Help opens this tutorial."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-compose-panel",
  "Compose a score",
  "Make new score opens a blank editor. Choose a playable pitch to hear it and insert it after the current selection."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-save",
  "Name and save a score",
  "Enter a title and optional source or author. Save score stores the project in this browser. Use a project backup for another device or browser."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-sequence",
  "Edit the sequence",
  "Click a card to select and hear it. Shift-click selects a range. Command-click on Mac or Ctrl-click on Windows toggles individual cards. Arrow keys move the selection. Delete removes it. Right-click to hear, insert, move, remove, or audition a replacement with Swap note."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-edit-pitch",
  "Change pitch or duration",
  "Use the selected-note controls to edit pitch and beats. The fingering, playback, staff, and exports share the same score events."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-rest",
  "Insert, split, and merge",
  "Insert a rest for silence. Split divides a duration. Merge combines adjacent events of the same pitch. Copy event and Paste event reuse a pitch and duration."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-undo",
  "Undo and redo",
  "Use Undo and Redo for note and notation changes in the current editing session. Command-Z or Control-Z undoes an edit. Add Shift to redo."
 ],
 [
  "Score editing",
  "editor",
  ".osm-menubar",
  "Edit in the piano roll",
  "Open Window → Piano roll. Double-click empty space to add a note. Drag notes to move them or drag their right edge to resize. Shift-click selects a range. Command-click or Ctrl-click toggles individual notes."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-piano-roll",
  "Set up the piano roll",
  "Drag the title bar to move the window or drag an edge or corner to resize it. Piano roll settings controls labels, snap, zoom, swing, humanize, and playback follow."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-transpose",
  "Fit the instrument range",
  "Use the semitone and octave buttons above the note cards to shift selected pitches together. Yellow cards mark pitches outside A4–F6. Use Transpose under Timeline and arrangement to shift the entire score."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-meter",
  "Set meter, key, and tempo",
  "Choose a time signature, major key signature, and base tempo. A key signature changes how accidentals are written while preserving pitches. Applying a new global tempo replaces the imported tempo map and exact timing."
 ],
 [
  "Notation and playback",
  "editor",
  ".osm-viewbar",
  "Read and edit the staff",
  "Use Staff to read notation and click a note to select it. Open Rhythm and timing to edit written durations or work with a recording. The timing table lets you edit written beats and apply them to playback. Long pitches can be tied across barlines."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-view",
  "Read triplets and tempo changes",
  "Eligible equal-duration 3:2 triplets show a triplet marking. Imported tempo changes appear in the staff and carry through ABC and MusicXML exports."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-play",
  "Play a score",
  "Play all follows the rhythm and updates the large fingering and staff highlights without scrolling the page. Use Stop, Loop, or Playback speed. Press Enter to step through notes manually."
 ],
 [
  "Notation and playback",
  "editor",
  "#oc93-record",
  "Tap in a rhythm",
  "Select a starting note, start Record Enter timing, and tap Enter in rhythm. Finish recording, then apply exact intervals or quantized written durations."
 ],
 [
  "Practice",
  "practice-setup",
  "#oc93-practice-options",
  "Practice without saving",
  "Choose pasted notes or ABC, uploaded fingering tabs, or a JSON project backup. Play Along is also available directly from the Score Editor."
 ],
 [
  "Practice",
  "practice-setup",
  "#oc93-practice-recognition",
  "Note recognition",
  "Free mode opens with a blank fingering chart. Tap holes and submit, or choose Use microphone to answer by playing. Manual input returns to the chart. Use the speaker to hear the target and Choose pitches to set your pool. In Flashcards, rate your recall to schedule your next FSRS review."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-chart",
  "Follow the fingering",
  "The large diagram shows the next fingering. With the microphone running, the corner shows the detected pitch. A blue outline marks the target, and a correct match turns the card green."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-start",
  "Advance and restart",
  "Play a matching note or press Enter to advance manually. Pause stops listening. Restart clears progress in the current range. The arrow below the cards expands the default eight-note view."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-part",
  "Work on a specific part",
  "Choose the first and last notes in the range picker. Practice selected notes uses only that range. Loop section repeats it, and Practice full sequence restores the song."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-metronome",
  "Practice with a beat",
  "Set the practice BPM and enable the metronome for a reference click. Timed practice gives a visual four-beat count-in, then reports early or late matches. The input offset is a manual adjustment."
 ],
 [
  "Practice",
  "practice",
  "#oc93-practice-feedback",
  "Review feedback",
  "Play Along tracks matched notes and reports expected versus heard pitch. Completed microphone sessions appear in Recent practice. Pitch accuracy measures detected attempts, including wrong notes."
 ],
 [
  "Export",
  "editor",
  "#oc93-music-panel",
  "Export sheet music",
  "Choose Music score for ABC, MusicXML, or an engraved PDF. ABC and MusicXML retain supported triplets and tempo marks. Copy for chat includes notation and available measured timing."
 ],
 [
  "Export",
  "editor",
  "#oc93-tabs-panel",
  "Export fingering tabs",
  "Choose Ocarina tabs. Edit the title, credit, spaces, and line breaks. Preview the fingerings and rhythm, then download PDF, SVG, or PNG, or copy codes for Ocarina Tabs Creator."
 ],
 [
  "Export",
  "editor",
  "#oc93-backup",
  "Keep a project backup",
  "Choose Project backup and download JSON. Reimport it to edit the project or open it in Practice. The separate installable preview package supports offline use after a first online visit in a compatible browser."
 ]
];
let tutorialIndex=0,tutorialTarget=null;
const tutorialTopic=find('tour-topic');
for(const topic of new Set(tutorialSteps.map(step=>step[0])))tutorialTopic.add(new Option(topic,topic));
tutorialTopic.onchange=()=>{
tutorialIndex=tutorialSteps.findIndex(step=>step[0]===tutorialTopic.value);
showTutorialStep();
};
function showTutorialStep(){
tutorialTarget?.classList.remove('tutorial-target');
const [topic,page,selector,heading,description]=tutorialSteps[tutorialIndex];
tutorialTopic.value=topic;
if(page==='practice'&&currentPage!=='practice')showPractice([72,74,76,77,79,77,76,74,72],'help');
else openPage(page);
if(selector==='#oc93-piano-roll')openPianoRoll();
else if(tutorialTarget===rollWindow)rollWindow.close();
if(page==='editor'){
if(selector==='#oc93-sequence')switchEditorView('sequence');
if(selector==='#oc93-view'||selector==='.osm-viewbar')switchEditorView('staff');
}
if(page==='practice-setup')choosePractice(selector==='#oc93-practice-recognition'?'recognition':null);
const exportModes={'#oc93-music-panel':'music','#oc93-tabs-panel':'tabs','#oc93-backup':'backup'};
if(exportModes[selector]){
const menu=find('export-kind');menu.value=exportModes[selector];menu.dispatchEvent(new Event('change'));
}
tutorialTarget=root.querySelector(selector);
for(let parent=tutorialTarget?.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
tutorialTarget?.classList.add('tutorial-target');
tutorialTarget?.scrollIntoView({block:'center'});
find('tour-progress').textContent=(tutorialIndex+1)+' of '+tutorialSteps.length;
find('tour-heading').textContent=heading;
find('tour-text').textContent=description;
const example=find('tour-example');
example.hidden=heading!=='Read triplets and tempo changes';
if(!example.hidden)loadNotation().then(()=>{if(!example.hidden)window.ABCJS.renderAbc(example,'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n(3cde [Q:1/4=90] f2 z4 |]',{responsive:'resize',staffwidth:300});}).catch(loadError);
else example.replaceChildren();
find('tour-back').disabled=tutorialIndex===0;
find('tour-next').textContent=tutorialIndex===tutorialSteps.length-1?'Finish':'Next';
}
function startTutorial(index){
tutorialIndex=index;showTutorialStep();tutorial.show();find('tour-next').focus();
}
find('tutorial').addEventListener('click',()=>startTutorial(0));
root.querySelectorAll('[data-tour-topic]').forEach(button=>{
button.onclick=()=>startTutorial(tutorialSteps.findIndex(step=>step[0]===button.dataset.tourTopic));
});
find('tour-back').addEventListener('click',()=>{tutorialIndex--;showTutorialStep();});
find('tour-next').addEventListener('click',()=>{
if(tutorialIndex===tutorialSteps.length-1){tutorial.close();return;}
tutorialIndex++;showTutorialStep();
});
find('tour-close').addEventListener('click',()=>tutorial.close());
tutorial.addEventListener('close',()=>{
tutorialTarget?.classList.remove('tutorial-target');tutorialTarget=null;
openPage('help');find('tutorial').focus();
});
document.addEventListener('keydown',e=>{
if(e.code==='Escape'&&tutorial.open){e.preventDefault();tutorial.close();}
});

const composeKeys=find('compose-keys');
for(let midi=69;midi<=89;midi++){
const button=document.createElement('button');
button.className='ctrl';button.textContent=name(midi);
button.addEventListener('click',()=>{
if(recording){report('Finish recording before adding notes.');return;}
const index=score.events.length?position+1:0;
score.splice(index,0,[{pitch:midi,ticks:4}]);
edited(index,true);showPlaybackFingering(index);previewPitch(midi);
});
composeKeys.append(button);
}
let practiceMode=null;
function choosePractice(mode){
if(practiceMode==='recognition'&&mode!=='recognition')leaveRecognition();
if(mode==='recognition')setRecognitionMode(false);
if(mode===null){
const list=find('practice-history');list.replaceChildren();
let history=[];try{history=JSON.parse(localStorage.getItem('osm-practice-history')||'[]');}catch{}
for(const session of Array.isArray(history)&&history.length?history:[null]){
const item=document.createElement('li');
item.textContent=session?new Date(session.date).toLocaleDateString()+' · '+session.matched+'/'+session.notes+' matched'+(session.meanTiming===null?'':' · '+session.meanTiming+' ms mean timing error'):'No completed sessions yet.';
list.append(item);
}
}
practiceMode=mode;pdfRequest++;find('reference-hint').hidden=true;
find('practice-options').hidden=mode!==null;
find('practice-mode-back').hidden=mode===null;
for(const choice of ['paste','tabs','backup','recognition'])find('practice-'+choice).hidden=choice!==mode;
report('');
}
for(const button of root.querySelectorAll('[data-practice-mode]')){
button.addEventListener('click',()=>choosePractice(button.dataset.practiceMode));
}
find('practice-mode-back').addEventListener('click',()=>choosePractice(null));
