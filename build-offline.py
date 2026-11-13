from pathlib import Path
root=Path(__file__).resolve().parent
def read(name):return (root/name).read_text()
html=read('index.html').replace('<link rel="stylesheet" href="osm.css?v=note-recognition">','<style>'+read('osm.css')+'</style>')
scripts='\n'.join('<script>\n'+read(name)+'\n</script>' for name in ['abcjs.js','jspdf.js','svg2pdf.js','pdf-reader.js','oc2.js','oc3.js','app.js'])
worker='<script type="text/plain" id="osm-pdf-worker">'+read('pdf-worker.js')+'</script>'
(root/'osm-offline.html').write_text(html.replace('<script src="app.js?v=note-recognition"></script>',worker+'\n'+scripts))
