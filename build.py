from pathlib import Path
from tempfile import NamedTemporaryFile
root=Path(__file__).resolve().parent
parts=['core', 'notation', 'projects', 'import-safety', 'abc', 'exports', 'tab-editor', 'page-layout', 'score-paper', 'score-preview', 'preview-editor', 'practice', 'practice-statistics', 'tuner-graphs', 'recognition', 'note-actions', 'tutorial', 'tab-calibration', 'tab-geometry', 'tab-import', 'sounds', 'custom-sound', 'editor', 'formats', 'workspace', 'piano-roll', 'recovery', 'startup']
# The tested pure modules are embedded for classic-script and single-file offline use.
# They remain importable ES modules for tests and future UI migration.
modules=[]
for module in ('domain','project-store','custom-sound'):
    text=(root/'lib'/f'{module}.mjs').read_text()
    text='\n'.join(line for line in text.splitlines() if not line.startswith('import '))
    modules.append(text.replace('export ', ''))
bundle='(()=>{\n'+'\n'.join(modules)+'\n'+'\n'.join((root/f'source-{name}.js').read_text() for name in parts)+'\n})();\n'
with NamedTemporaryFile(mode='w',encoding='utf-8',dir=root,delete=False) as output:
    output.write(bundle)
Path(output.name).replace(root/'app.js')
