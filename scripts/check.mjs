import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || String(result.error));
    process.exit(result.status || 1);
  }
};
const generated = ['app.js', 'osm-offline.html'];
const before = new Map(generated.map(file => [file, readFileSync(new URL('../' + file, import.meta.url))]));
run('python3', ['build.py']);
run('python3', ['build-offline.py']);
for (const file of generated) {
  assert.ok(readFileSync(new URL('../' + file, import.meta.url)).equals(before.get(file)), file + ' is stale. Run npm run build and include the generated files.');
}
for (const file of readdirSync(root).filter(file => file.endsWith('.js'))) {
  if (file.startsWith('source-') && file !== 'source-fingering-data.js') continue;
  run(process.execPath, ['--check', file]);
}
for (const file of readdirSync(root + 'lib').filter(file => file.endsWith('.mjs'))) {
  run(process.execPath, ['--check', 'lib/' + file]);
}
const html = readFileSync(root + 'index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'index.html contains duplicate IDs');
for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)) {
  if (/^(?:https?:|data:|#)/.test(match[1])) continue;
  assert.ok(existsSync(root + match[1]), 'Missing local asset ' + match[1]);
}
const inventory = JSON.parse(readFileSync(root + 'docs/dependencies.json', 'utf8'));
for (const component of inventory.components) {
  for (const file of component.files) {
    const actual = createHash('sha256').update(readFileSync(root + file.path)).digest('hex');
    assert.equal(actual, file.sha256, 'Bundled dependency changed without an inventory update: ' + file.path);
  }
}
console.log('Generated builds, JavaScript syntax, unique IDs, local assets, and bundled dependency hashes passed.');
