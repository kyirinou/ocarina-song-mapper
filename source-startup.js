restoreSavedProjects();
loadProject(projects.find(p=>p.id===projectId)??projects[0]??{id:newId(),title:'Untitled song',author:'',notes:[],lengths:[],tempo:130,intervals:[]});

window.addEventListener('beforeunload',e=>{if(draftChanged){e.preventDefault();e.returnValue='';}});
window.addEventListener('blur',()=>{stopStep();stopMelody();for(const id of [...voices.keys()])end(id)});
