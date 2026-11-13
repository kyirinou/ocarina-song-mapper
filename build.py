from pathlib import Path
root=Path(__file__).resolve().parent
parts=['core', 'notation', 'projects', 'abc', 'exports', 'tab-editor', 'practice', 'tuner-graphs', 'recognition', 'note-actions', 'tutorial', 'tab-calibration', 'tab-geometry', 'tab-import', 'sounds', 'editor', 'formats', 'workspace', 'piano-roll', 'startup']
(root/'app.js').write_text('(()=>{\n'+'\n'.join((root/f'source-{name}.js').read_text() for name in parts)+'\n})();\n')
