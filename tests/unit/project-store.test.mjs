import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStore } from '../../lib/project-store.mjs';
import { migrateProject } from '../../lib/domain.mjs';
import { project, MemoryStorage } from './helpers.mjs';

const key = 'ocarina-song-mapper-v1';

function savedStore() {
  const storage = new MemoryStorage();
  const store = new ProjectStore(storage);
  store.save([project()], 'song-one');
  return { storage, store };
}

test('new libraries and current projects retain every score and page-layout field on round trip', () => {
  const { storage } = savedStore();
  const result = new ProjectStore(storage).read();
  assert.deepEqual(result.projects, [migrateProject(project())]);
  assert.equal(result.active, 'song-one'); assert.equal(result.recovered, false);
  const envelope = JSON.parse(storage.getItem(key));
  assert.equal(envelope.schemaVersion, 1); assert.equal(envelope.revision, 1);
  assert.equal(typeof envelope.checksum, 'string');
});

test('legacy libraries load without being rewritten during a read', () => {
  const raw = JSON.stringify({ projects: [project()], active: 'song-one' });
  const storage = new MemoryStorage({ [key]: raw });
  const store = new ProjectStore(storage), result = store.read();
  assert.deepEqual(result.projects, [migrateProject(project())]);
  assert.equal(storage.getItem(key), raw);
  store.save(result.projects, result.active);
  assert.equal(JSON.parse(storage.getItem(key)).schemaVersion, 1);
});

test('malformed projects leave valid siblings accessible and retain the original library', () => {
  const raw = JSON.stringify({ projects: [project(), null, { id: 'broken' }], active: 'song-one' });
  const storage = new MemoryStorage({ [key]: raw });
  const result = new ProjectStore(storage).read();
  assert.deepEqual(result.projects, [migrateProject(project())]);
  assert.ok(result.issues.length); assert.equal(result.recovered, true);
  assert.equal(storage.getItem(key + '-recovery'), raw);
});

test('interrupted primary writes recover the newer verified journal', () => {
  const { storage, store } = savedStore();
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (target, value) => {
    if (target === key) throw Error('Simulated browser interruption');
    setItem(target, value);
  };
  assert.throws(() => store.save([project({ title: 'Recovered latest take' })], 'song-one'));
  storage.setItem = setItem;
  const next = new ProjectStore(storage), recovered = next.read();
  assert.equal(recovered.projects[0].title, 'Recovered latest take');
  assert.equal(recovered.recovered, true);
  next.save(recovered.projects, recovered.active);
  assert.equal(new ProjectStore(storage).read().projects[0].title, 'Recovered latest take');
});

test('a truncated primary library recovers the last verified library and preserves corrupt bytes', () => {
  const { storage, store } = savedStore();
  store.save([project({ title: 'Second take' })], 'song-one');
  const raw = '{"schemaVersion":1,"payload":';
  storage.setItem(key, raw);
  const next = new ProjectStore(storage), recovered = next.read();
  assert.equal(recovered.projects[0].title, 'Study');
  assert.equal(recovered.recovered, true);
  assert.equal(storage.getItem(key + '-recovery'), raw);
  next.save(recovered.projects, recovered.active);
  assert.equal(new ProjectStore(storage).read().projects[0].title, 'Study');
  assert.equal(storage.getItem(key + '-recovery'), raw);
});

test('checksum mismatches are detected even when the JSON still parses', () => {
  const { storage, store } = savedStore();
  store.save([project({ title: 'Second take' })], 'song-one');
  const envelope = JSON.parse(storage.getItem(key));
  envelope.payload.projects[0].title = 'Unexpected modification';
  const raw = JSON.stringify(envelope); storage.setItem(key, raw);
  const result = new ProjectStore(storage).read();
  assert.equal(result.projects[0].title, 'Study');
  assert.ok(result.issues.some(issue => /integrity/i.test(issue)));
  assert.equal(storage.getItem(key + '-recovery'), raw);
});

test('failed writes are reported without replacing the prior saved score', () => {
  const { storage, store } = savedStore(), before = storage.getItem(key);
  storage.setItem = () => { throw Error('QuotaExceededError'); };
  assert.throws(() => store.save([project({ title: 'Unsaved take' })], 'song-one'), /Quota/);
  assert.equal(storage.getItem(key), before);
  assert.equal(new ProjectStore(storage).read().projects[0].title, 'Study');
});

test('a storage adapter that silently drops a write fails verification', () => {
  const { storage, store } = savedStore(), before = storage.getItem(key);
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (target, value) => { if (target !== key + '-pending') setItem(target, value); };
  assert.throws(() => store.save([project({ title: 'Dropped take' })], 'song-one'), /verified/);
  assert.equal(storage.getItem(key), before);
});

test('a stale browser tab cannot overwrite a newer saved library', () => {
  const { storage } = savedStore();
  const first = new ProjectStore(storage), stale = new ProjectStore(storage);
  first.read(); stale.read();
  first.save([project({ title: 'New work in the first tab' })], 'song-one');
  assert.throws(() => stale.save([project({ title: 'Stale tab' })], 'song-one'), /Another OSM tab/);
  assert.equal(new ProjectStore(storage).read().projects[0].title, 'New work in the first tab');
});

test('future schema versions are preserved and blocked from accidental overwrite', () => {
  const raw = JSON.stringify({ schemaVersion: 999, payload: { projects: [project()] } });
  const storage = new MemoryStorage({ [key]: raw }), store = new ProjectStore(storage);
  assert.deepEqual(store.read().projects, []);
  assert.throws(() => store.save([project()], 'song-one'));
  assert.equal(storage.getItem(key), raw);
});

test('duplicate project identifiers cannot replace a valid saved library', () => {
  const { storage, store } = savedStore(), before = storage.getItem(key);
  assert.throws(() => store.save([project(), project()], 'song-one'), /Duplicate/);
  assert.equal(storage.getItem(key), before);
});

test('recovery snapshots keep editable page layouts and suppress unchanged duplicates', () => {
  const storage = new MemoryStorage(), store = new ProjectStore(storage);
  const entry = store.checkpoint(project(), 'Before editing');
  assert.equal(entry.reason, 'Before editing');
  assert.deepEqual(entry.project, migrateProject(project()));
  assert.equal(store.checkpoint(project()), null);
  assert.deepEqual(new ProjectStore(storage).checkpoints()[0].project.tabDraft, project().tabDraft);
});

test('recovery snapshot retention is bounded and deleting one score keeps other snapshots', () => {
  const storage = new MemoryStorage(), store = new ProjectStore(storage);
  for (let index = 0; index < 70; index++) store.checkpoint(project({ id: 'song-' + index % 5, title: 'Take ' + index }));
  assert.ok(store.checkpoints().length <= 30);
  const others = store.checkpoints().filter(entry => entry.project.id !== 'song-1');
  store.removeCheckpoints('song-1');
  assert.deepEqual(store.checkpoints(), others);
});

test('malformed snapshots fail visibly and remain available for diagnosis', () => {
  const raw = '{truncated';
  const storage = new MemoryStorage({ [key + '-checkpoints']: raw }), store = new ProjectStore(storage);
  assert.throws(() => store.checkpoint(project()));
  assert.equal(storage.getItem(key + '-checkpoints'), raw);
});

test('another tab cannot replace a newer interrupted-save journal with stale work', () => {
  const { storage } = savedStore();
  const interrupted = new ProjectStore(storage), stale = new ProjectStore(storage);
  interrupted.read(); stale.read();
  const setItem = storage.setItem.bind(storage), previous = storage.getItem(key);
  storage.setItem = (target, value) => {
    if (target === key) throw Error('Simulated interruption');
    setItem(target, value);
  };
  assert.throws(() => interrupted.save([project({ title: 'Pending work from first tab' })], 'song-one'));
  storage.setItem = setItem;
  const pending = storage.getItem(key + '-pending');
  assert.throws(() => stale.save([project({ title: 'Stale work from second tab' })], 'song-one'), /another.*tab/i);
  assert.equal(storage.getItem(key), previous);
  assert.equal(storage.getItem(key + '-pending'), pending);
  const recovered = new ProjectStore(storage).read();
  assert.equal(recovered.projects[0].title, 'Pending work from first tab');
});

test('the tab that created an interrupted journal can retry its own save', () => {
  const { storage, store } = savedStore();
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (target, value) => {
    if (target === key) throw Error('Simulated interruption');
    setItem(target, value);
  };
  const changed = project({ title: 'Retry this take' });
  assert.throws(() => store.save([changed], 'song-one'));
  storage.setItem = setItem;
  assert.equal(store.save([changed], 'song-one'), true);
  assert.equal(storage.getItem(key + '-pending'), null);
  const result = new ProjectStore(storage).read();
  assert.equal(result.projects[0].title, 'Retry this take');
  assert.equal(result.recovered, false);
});

test('a failed recovery-copy write keeps valid siblings readable and protects the original library', () => {
  const raw = JSON.stringify({ projects: [project(), null], active: 'song-one' });
  const storage = new MemoryStorage({ [key]: raw });
  storage.setItem = () => { throw Error('Storage is full'); };
  const store = new ProjectStore(storage), result = store.read();
  assert.deepEqual(result.projects, [migrateProject(project())]);
  assert.equal(result.recovered, true);
  assert.throws(() => store.save(result.projects, result.active));
  assert.equal(storage.getItem(key), raw);
});
