from pathlib import Path
import re

root = Path(__file__).resolve().parent


def read(name):
    return (root / name).read_text()


html = read('index.html')
for stylesheet in ('osm.css', 'workspace.css'):
    pattern = r'<link rel="stylesheet" href="' + re.escape(stylesheet) + r'(?:\?[^"]*)?">'
    html, count = re.subn(pattern, lambda _: '<style>\n' + read(stylesheet) + '\n</style>', html)
    if count != 1:
        raise ValueError(f'Expected one stylesheet link for {stylesheet}')

script_names = ('abcjs.js', 'jspdf.js', 'svg2pdf.js', 'pdf-reader.js', 'oc2.js', 'oc3.js', 'fsrs.js', 'source-fingering-data.js', 'app.js')
scripts = '\n'.join('<script>\n' + read(name) + '\n</script>' for name in script_names)
worker = '<script type="text/plain" id="osm-pdf-worker">' + read('pdf-worker.js') + '</script>'
html = re.sub(r'<script defer src="source-fingering-data\.js[^"]*"></script>\n', '', html)
html, count = re.subn(r'<script defer src="app\.js(?:\?[^"]*)?"></script>', lambda _: worker + '\n' + scripts, html)
if count != 1:
    raise ValueError('Expected one app script')
(root / 'osm-offline.html').write_text(html)
