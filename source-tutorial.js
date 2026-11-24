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
  "Upload clear PNG or JPG fingering diagrams or a PDF. OSM assigns pitches automatically for supported diagrams. Review them before importing. For an unfamiliar layout, use Teach this layout to label each distinct fingering. OSM reads numbered PDF labels when present and otherwise tries scanning the diagrams. Correct detected pitches in the review dialog before continuing. Image imports start with one beat per event."
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
  "Import an exported JSON project to restore its score and settings. Saved scores are stored in this browser and listed under Recent scores on the main menu. Right-click a recent score and choose Delete, or open it and choose File → Delete score."
 ],
 [
  "Score editing",
  "editor",
  ".osm-menubar",
  "Use the editor menus",
  "File opens imports and exports. Edit has note actions. View opens Preview and switches between the staff and note sequence. Window shows or hides the editing panels. Help opens this tutorial."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-compose-panel",
  "Compose a score",
  "Make new score opens a blank editor. Choose a pitch to hear it and insert it after the current selection. View more opens octave groups from C0 to G9. Notes outside A4–F6 appear in yellow and can be shifted with the transposition tools."
 ],
 [
  "Score editing",
  "editor",
  "#oc93-save",
  "Name and save a score",
  "Choose File → Rename to edit the title and source or author. Use Save score to keep your changes. The Edit history panel shows dated changes and saves."
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
  "Play all follows the rhythm and updates the large fingering and staff highlights without scrolling the page. Use Stop, Loop, or Playback speed. Press Enter to step through notes manually. Hold Enter to sustain the current note."
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
  "Free mode opens with a blank fingering chart. Tap holes and submit, or use Reveal to see the answer. Choose Use microphone to answer by playing. Manual input returns to the chart. Use the speaker to hear the target and Choose pitches to set your pool. In Flashcards, rate your recall to schedule your next FSRS review. Open Statistics for accuracy by pitch. Your sessions appear in Recent practice."
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
  "Play a matching note or press Enter to advance manually. For uploaded tabs, Enter and the arrow keys highlight and play each note. Hold Enter to sustain it. Pause stops listening. Restart clears progress in the current range. The arrow below the cards expands the default eight-note view."
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
  "#oc93-export-options",
  "Export sheet music",
  "Open File → Export for ABC, MusicXML, or an engraved PDF. ABC and MusicXML retain supported triplets and tempo marks. Copy for chat includes notation and available measured timing."
 ],
 [
  "Export",
  "editor",
  "#oc93-tab-creator",
  "Export fingering tabs",
  "Choose Edit → Open tab editor, or select Tab editor beside Staff. Edit the diagrams, spacing, title, and credit. Press Play to follow the highlighted fingerings, or use Enter and the left or right arrow keys to hear one at a time. Hold Enter to sustain a note. Tabs matching the score use its timing. A different tab sequence plays one beat per note. Use View → Preview to follow playback on the same pages as the PDF. The tab pages keep your spaces and line breaks. Pause and press Play to resume. Use Save as PDF for a paginated fingering sheet. Save the score once to find it in Recent scores. Tab drafts save automatically in this browser, and changes appear in Edit history."
 ],
 [
  "Export",
  "editor",
  "#oc93-backup",
  "Keep a project backup",
  "Choose File → Export → Download project backup. Reimport it to edit the project or open it in Practice. The separate installable preview package supports offline use after a first online visit in a compatible browser."
 ]
];
tutorialSteps.splice(tutorialSteps.findIndex(step=>step[3]==='Keep a project backup'),0,
 ['Export','editor','[data-editor-command="score-preview"]','Design the printed page', 'Open View → Preview for the page editor. File exports the current view as PDF or downloads a project backup. View switches between Staff and Fingering tabs. Edit inserts text boxes, images, watermarks, and blank pages, with layout Undo and Redo. Use Formatting for paper size, orientation, margins, heading fonts, sizes, alignment, color, and offsets. Fingering tabs also support custom diagram size and line spacing. Drag objects or resize their corner, then set opacity, rotation, page, repeat, and layer in Objects. Layouts save with the tab draft and project backup.'],
 ['Export','editor','[data-editor-command="score-preview"]','Arrange images and text',
  'Insert an image or text box from the page editor toolbar. Select it on the page, drag to move it, and drag the lower-right corner to resize it. Objects offers exact coordinates, dimensions, opacity, rotation, text styling, page placement, repetition, locking, and front or back layers. Delete removes an object, and Command-Z or Control-Z undoes a layout edit.'],
 ['Export','editor','[data-editor-command="score-preview"]','Save a page design',
  'File → Export PDF inside the page editor exports the view you are looking at. Formatting is also used by the score PDF and Tab editor PDF buttons. Save score keeps the project, and a project backup includes your images and both page layouts. Tab line breaks and spaces stay intact when a wide row is fitted to paper.']);
tutorialSteps.push(['Export','home','#oc93-recovery-open','Recover recent edits',
'OSM keeps recent recovery snapshots as you edit. Recover work opens snapshots from this browser, including unsaved notes and page layouts. Restore copy opens a separate score. Download backup keeps your work outside browser storage. Clearing site data removes both saved scores and snapshots.']);
tutorialSteps.splice(2,0,['Home and sounds','home','#oc93-sound-open','Custom Sound','Open Settings → Ocarina sound → Custom Sound. Select a note and use the fingering diagram below the controls. Choose Record note, then hold it within ±40 cents for three continuous seconds. The green circle fills while you are in tune and resets if you drift or stop. Successful takes save automatically. The microphone stays on between takes, and each successful save automatically starts recording the next missing pitch without another permission request. Click any recorded pitch to hear or re-record it. After all 21 pitches from A4 to F6 are recorded, choose Use my ocarina. Your custom sound then supplies note previews, keyboard sounds, tab playback, and full score playback. Name a take and choose Save sound to keep it. Save as new keeps a separate version; select Saved sounds to switch, New sound to start fresh, or Delete saved sound to remove one. Record again continues through the pitches even when they were already recorded. Recordings are stored separately in this browser.']);
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
if(selector==='#oc93-tab-creator')switchEditorView('tabs');
if(selector==='#oc93-export-options'||selector==='#oc93-backup')setExportMenu(true);
tutorialTarget=root.querySelector(selector);
for(let parent=tutorialTarget?.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}
tutorialTarget?.classList.add('tutorial-target');
tutorialTarget?.scrollIntoView({block:'center'});
find('tour-progress').textContent=(tutorialIndex+1)+' of '+tutorialSteps.length;
find('tour-heading').textContent=heading;
find('tour-text').textContent=description;
const example=find('tour-example');
example.style.cssText='';
example.hidden=!['Read triplets and tempo changes','Design the printed page','Arrange images and text','Save a page design'].includes(heading);
if(!example.hidden&&heading!=='Read triplets and tempo changes')showPaperTutorialExample(example);
else if(!example.hidden)loadNotation().then(()=>{if(!example.hidden)window.ABCJS.renderAbc(example,'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n(3cde [Q:1/4=90] f2 z4 |]',{responsive:'resize',staffwidth:300});}).catch(loadError);
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
function composePitchButton(midi){
const button=document.createElement('button');
button.type='button';button.className='ctrl';button.textContent=name(midi);
if(!Music.playable(midi)){
button.classList.add('outside-range');
button.title='Outside A4–F6 · transpose after adding';
}
button.addEventListener('click',()=>{
if(recording){report('Finish recording before adding notes.');return;}
const index=score.events.length?position+1:0;
score.splice(index,0,[{pitch:midi,ticks:4}]);
edited(index,true);showPlaybackFingering(index);previewPitch(midi);
});
return button;
}
for(let midi=69;midi<=89;midi++)composeKeys.append(composePitchButton(midi));
const extendedCompose=find('compose-extended');
for(let octave=0;octave<=9;octave++){
const group=document.createElement('details'),heading=document.createElement('summary'),keys=document.createElement('div');
heading.textContent='Octave '+octave;keys.className='toolbar';
for(let midi=(octave+1)*12;midi<=Math.min(127,(octave+2)*12-1);midi++)keys.append(composePitchButton(midi));
group.append(heading,keys);extendedCompose.append(group);
}
find('compose-more').onclick=event=>{
extendedCompose.hidden=!extendedCompose.hidden;
event.currentTarget.setAttribute('aria-expanded',String(!extendedCompose.hidden));
event.currentTarget.textContent=extendedCompose.hidden?'View more':'View fewer';
};
let practiceMode=null;
function choosePractice(mode){
if(practiceMode==='recognition'&&mode!=='recognition')leaveRecognition();
if(mode==='recognition')setRecognitionMode(false);
if(mode===null)renderPracticeHistory();
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

async function showPaperTutorialExample(host){
const step=tutorialIndex;
const layout=defaultPaperLayout();
layout.title.align='center';layout.title.font=paperFonts[1];layout.tabSize=52;
layout.objects=cleanPaperLayout({objects:[{id:'demo',type:'text',text:'Practice',x:180,y:160,width:260,height:90,size:40,rotation:-20,opacity:.16,layer:'background'}]}).objects;
const pages=await tabPaper({text:'A  D U\n\nD A',size:'52',title:'My ocarina song',credit:'Source / author',paperLayouts:{tabs:layout}});
const page=await drawPreviewPage(pages[0],0,pages,[]);
if(!tutorial.open||host.hidden||step!==tutorialIndex)return;
host.replaceChildren(page);host.style.cssText='height:190px;overflow:hidden;background:#fff;position:relative';
page.style.cssText+=';transform:scale(.42);transform-origin:top left;position:relative;color:#000';
}
