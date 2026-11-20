import test from 'node:test';
import assert from 'node:assert/strict';
import { Music, toMidi, pitchName, validateProject, migrateProject, meterTicks, detectPitch } from '../../lib/domain.mjs';
import { project } from './helpers.mjs';

const supportedPitches = Array.from({ length: 116 }, (_, index) => index + 12);

test('all supported pitches survive name conversion, including the extended octave range', () => {
  for (const midi of supportedPitches) assert.equal(toMidi(pitchName(midi)), midi);
  assert.equal(toMidi('A1'), 33);
  assert.equal(toMidi('F8'), 113);
  assert.equal(pitchName(null), 'Rest');
});

test('note conversion accepts flats, sharp symbols, and whitespace', () => {
  for (const note of ['C#5', 'C♯5', 'Db5', 'D♭5', ' c#5 ']) assert.equal(toMidi(note), 73);
  assert.equal(toMidi('Cb5'), 71);
});

test('note conversion rejects malformed and unsupported names', () => {
  for (const note of ['', 'H4', 'A-1', 'C10', 'A4 trailing', 'Cbb4', 'G#9', null, 69]) assert.throws(() => toMidi(note));
  for (const midi of [11, 128, NaN, Infinity, 69.5, '69']) assert.throws(() => pitchName(midi));
});

test('transposition moves every pitch by the requested semitones and preserves rests and inputs', () => {
  const original = [89, 87, 86, 84, 82, 86, 84, null];
  assert.deepEqual(Music.transpose(original, -6), [83, 81, 80, 78, 76, 80, 78, null]);
  assert.deepEqual(original, [89, 87, 86, 84, 82, 86, 84, null]);
  for (const steps of [-24, -12, -1, 0, 1, 6, 12, 24]) {
    assert.deepEqual(Music.transpose(supportedPitches, steps), supportedPitches.map(pitch => pitch + steps));
  }
});

test('instrument range and supported composition range are distinct and include rests', () => {
  assert.ok(Music.validPitch(33)); assert.equal(Music.playable(33), false);
  assert.ok(Music.validPitch(113)); assert.equal(Music.playable(113), false);
  for (let midi = 69; midi <= 89; midi++) assert.ok(Music.playable(midi));
  assert.equal(Music.playable(68), false); assert.equal(Music.playable(90), false);
  assert.ok(Music.validPitch(null)); assert.ok(Music.playable(null));
});

test('rhythm conversion uses sixteenth-note ticks and handles common tempos', () => {
  assert.equal(Music.ticks(500, 120), 4);
  assert.equal(Music.ticks(250, 120), 2);
  assert.equal(Music.ticks(1000, 60), 4);
  assert.equal(Music.ticks(1, 120), 1);
  assert.equal(Music.tempo([]), 120);
  assert.equal(Music.tempo([0, 500, 1000, 1500, 2000]), 120);
});

test('time signatures produce the correct number of ticks per measure', () => {
  for (const [meter, ticks] of [['4/4', 16], ['3/4', 12], ['6/8', 12], ['7/8', 14], ['5/16', 5]]) assert.equal(meterTicks(meter), ticks);
  for (const meter of ['0/4', '25/4', '4/3', '4', null, 'four/four']) assert.equal(meterTicks(meter), 0);
});

test('project validation rejects malformed score timing without mutating the project', () => {
  const valid = project(); assert.ok(validateProject(valid));
  const invalid = [
    { notes: [128, 73, null, 89] }, { notes: [NaN] }, { lengths: [4] },
    { lengths: [4, 0, 1, 8] }, { lengths: [4, -2, 1, 8] }, { tempo: 0 }, { tempo: 401 },
    { intervals: [0] }, { intervals: [Infinity] }, { performance: [{ velocity: 0 }] },
    { tempoMap: [{ tick: 8, bpm: 100 }, { tick: 8, bpm: 120 }] },
    { tempoMap: [{ tick: -1, bpm: 100 }] }, { schemaVersion: 999 }
  ];
  for (const changes of invalid) assert.equal(validateProject(project(changes)), false, JSON.stringify(changes));
  assert.equal(validateProject(null), false);
  assert.equal(validateProject({}), false);
  assert.deepEqual(valid, project());
});

test('legacy projects acquire schema and timing defaults while preserving score and page data', () => {
  const legacy = project({ author: undefined, meter: undefined, key: undefined, tempoMap: undefined, intervals: [500] });
  const migrated = migrateProject(legacy);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.author, ''); assert.equal(migrated.key, 'C'); assert.equal(migrated.meter, '4/4');
  assert.deepEqual(migrated.tempoMap, []); assert.deepEqual(migrated.intervals, [500, null, null, null]);
  assert.deepEqual(migrated.tabDraft, legacy.tabDraft);
  assert.equal(legacy.schemaVersion, undefined);
  assert.deepEqual(migrateProject(migrated), migrated);
  migrated.tabDraft.title = 'Changed'; assert.equal(legacy.tabDraft.title, 'Print title');
});

test('invalid or future projects fail migration instead of silently dropping fields', () => {
  assert.throws(() => migrateProject(project({ schemaVersion: 2 })));
  assert.throws(() => migrateProject(project({ meter: '0/4' })));
  assert.throws(() => migrateProject(project({ lengths: [] })));
});

test('known synthesized tones identify all 21 playable pitches at both common microphone rates', () => {
  for (const rate of [44100, 48000]) {
    for (let midi = 69; midi <= 89; midi++) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const tone = Float32Array.from({ length: 2048 }, (_, index) => 0.2 * Math.sin(2 * Math.PI * frequency * index / rate));
      const detected = detectPitch(tone, rate);
      const cents = Math.abs(1200 * Math.log2(detected.frequency / frequency));
      assert.ok(cents < 8, `${pitchName(midi)} at ${rate} Hz deviated by ${cents.toFixed(2)} cents`);
      assert.ok(detected.confidence > 0.95);
    }
  }
});

test('silence, quiet input and insufficient audio do not invent a pitch', () => {
  assert.equal(detectPitch(new Float32Array(2048), 48000).frequency, 0);
  const quiet = Float32Array.from({ length: 2048 }, (_, i) => 0.001 * Math.sin(2 * Math.PI * 440 * i / 48000));
  assert.equal(detectPitch(quiet, 48000).frequency, 0);
  assert.equal(detectPitch(new Float32Array(32).fill(0.1), 48000).frequency, 0);
});
