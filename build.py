from pathlib import Path
root=Path(__file__).resolve().parent
parts=['core', 'notation', 'projects', 'abc', 'exports', 'practice', 'note-actions', 'tutorial', 'tab-import', 'sounds', 'editor', 'formats', 'startup']
(root/'app.js').write_text('(()=>{\n'+'\n'.join((root/f'source-{name}.js').read_text() for name in parts)+'\n})();\n')
