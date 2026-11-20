"""Package the static site without developer files or browser-test dependencies."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
destination = root / 'site-dist'
if destination.exists():
    shutil.rmtree(destination)
destination.mkdir()
files = ['index.html', 'app.js', 'osm.css', 'workspace.css', 'osm-offline.html',
         'abcjs.js', 'jspdf.js', 'svg2pdf.js', 'pdf-reader.js', 'pdf-worker.js',
         'fsrs.js', 'oc2.js', 'oc3.js', 'source-fingering-data.js', 'LICENSE', 'FSRS-LICENSE']
for name in files:
    shutil.copy2(root / name, destination / name)
notices = destination / 'docs'
notices.mkdir()
for name in ('third-party-notices.md', 'dependencies.json', 'dependencies.md'):
    shutil.copy2(root / 'docs' / name, notices / name)
shutil.copytree(root / 'docs' / 'licenses', notices / 'licenses')
(destination / '.nojekyll').touch()
print(f'Packaged {len(files)} site files and third-party notices into {destination.name}/')
