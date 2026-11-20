import { test, expect } from './fixtures.mjs';
import { control, editorCommand, importNotes, projectBackup } from './helpers.mjs';
import { melodyMIDI } from '../fixtures/melody.mjs';

test('pasted out-of-range pitches survive import and a selected range transposes together', async ({ page }) => {
  await importNotes(page, 'F4 - C5 - G#4 - A#4');
  await page.locator('[data-editor-view="sequence"]').click();
  const notes = control(page, 'sequence').getByRole('button');
  await expect(control(page, 'sequence').locator('.outside-range')).toHaveCount(2);
  await notes.first().click();
  await notes.nth(2).click({ modifiers: ['Shift'] });
  await expect(control(page, 'sequence').locator('[aria-pressed="true"]')).toHaveCount(3);
  await control(page, 'octave-up').click();
  const backup = await projectBackup(page);
  expect(backup.notes).toEqual([77, 84, 80, 70]);
  expect(backup.lengths).toEqual([4, 4, 4, 4]);
});

test('ABC import retains rests, triplets, key, meter and tempo changes', async ({ page }) => {
  await importNotes(page, 'X:1\nT:Reference\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n(3cde [Q:1/4=90] f2 z2 |]');
  const backup = await projectBackup(page);
  expect(backup.notes).toEqual([72, 74, 76, 77, null]);
  for (const length of backup.lengths.slice(0, 3)) expect(length).toBeCloseTo(4 / 3, 6);
  expect(backup.lengths.slice(3)).toEqual([4, 4]);
  expect(backup.tempo).toBe(120);
  expect(backup.tempoMap).toEqual([{ tick: 4, bpm: 90 }]);
  expect(backup.meter).toBe('4/4');
  expect(backup.key).toBe('C');
});

test('MIDI import preserves the reference melody, silence and variable-tempo timing', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-oc-page="import"]').click();
  await control(page, 'midi-file').setInputFiles({ name: 'reference.mid', mimeType: 'audio/midi', buffer: melodyMIDI() });
  await expect(control(page, 'midi-picker')).toBeVisible();
  await control(page, 'midi-use').click();
  await expect(control(page, 'page-editor')).toBeVisible();
  const backup = await projectBackup(page);
  expect(backup.notes).toEqual([69, null, 72]);
  expect(backup.lengths).toEqual([4, 2, 8]);
  expect(backup.intervals).toEqual([500, 250, 1500]);
  expect(backup.tempo).toBe(120);
  expect(backup.tempoMap).toEqual([{ tick: 10, bpm: 60 }]);
});

test('malformed MIDI reports an error without replacing the existing song', async ({ page }) => {
  await importNotes(page, 'A4 - C5');
  await control(page, 'save').click();
  await control(page, 'editor-home').click();
  await page.locator('[data-oc-page="import"]').click();
  await control(page, 'midi-file').setInputFiles({ name: 'broken.mid', mimeType: 'audio/midi', buffer: Buffer.from('MThd') });
  await expect(control(page, 'project-status')).toContainText('Invalid MIDI header');
  await control(page, 'home').click();
  await control(page, 'recent-scores').getByRole('button').first().click();
  expect((await projectBackup(page)).notes).toEqual([69, 72]);
});

test('piano-roll edits and undo/redo restore pitches, timing, velocity and mute state', async ({ page }) => {
  await importNotes(page, 'A4 - C5 - E5');
  const original = await projectBackup(page);
  await editorCommand(page, 'Window', 'piano-roll');
  await control(page, 'roll-scroll').locator('.roll-note').first().click();
  await control(page, 'roll-velocity').fill('82');
  await control(page, 'roll-velocity').press('Tab');
  await control(page, 'roll-mute').click();
  await control(page, 'roll-duration').fill('0.5');
  await control(page, 'roll-duration').press('Tab');
  const edited = await projectBackup(page);
  expect(edited.notes).toEqual([69, null, 72, 76]);
  expect(edited.lengths).toEqual([2, 2, 4, 4]);
  expect(edited.performance[0]).toEqual({ velocity: 82, muted: true });
  await control(page, 'roll-close').click();
  await page.getByText('Edit tools', { exact: true }).click();
  for (let index = 0; index < 3; index++) await control(page, 'undo').click();
  const undone = await projectBackup(page);
  for (const property of ['notes', 'lengths', 'performance', 'intervals']) expect(undone[property]).toEqual(original[property]);
  for (let index = 0; index < 3; index++) await control(page, 'redo').click();
  const redone = await projectBackup(page);
  for (const property of ['notes', 'lengths', 'performance', 'intervals']) expect(redone[property]).toEqual(edited[property]);
});

test('malformed MIDI sysex length and XML entity declarations are rejected before replacing a score', async ({ page }) => {
  await importNotes(page, 'A4 - C5');
  await control(page, 'save').click();
  await control(page, 'editor-home').click();
  await page.locator('[data-oc-page="import"]').click();
  const sysex = Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 7,
    0, 0xf0, 0x7f, 0, 0xff, 0x2f, 0,
  ]);
  await control(page, 'midi-file').setInputFiles({ name: 'broken.mid', mimeType: 'audio/midi', buffer: sysex });
  await expect(control(page, 'midi-picker')).toBeHidden();
  await expect(control(page, 'project-status')).toContainText(/Incomplete|Invalid|Unsupported/);
  await control(page, 'musicxml-file').setInputFiles({
    name: 'entity.musicxml', mimeType: 'application/xml',
    buffer: Buffer.from('<!DOCTYPE score-partwise [<!ENTITY test "unsafe">]><score-partwise>&test;</score-partwise>'),
  });
  await expect(control(page, 'project-status')).toContainText('entity declarations');
  await control(page, 'home').click();
  await control(page, 'recent-scores').getByRole('button').first().click();
  expect((await projectBackup(page)).notes).toEqual([69, 72]);
});

test('standard MusicXML public doctype imports without requesting the external DTD', async ({ page }) => {
  const external = [];
  page.on('request', request => { if (request.url().includes('musicxml.org')) external.push(request.url()); });
  await page.goto('/');
  await page.locator('[data-oc-page="import"]').click();
  const xml = '<?xml version="1.0"?>\n' +
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    '<score-partwise version="4.0"><work><work-title>Public DTD example</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Ocarina</part-name></score-part></part-list><part id="P1"><measure number="1">' +
    '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' +
    '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
  await control(page, 'musicxml-file').setInputFiles({ name: 'reference.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(control(page, 'page-editor')).toBeVisible();
  const backup = await projectBackup(page);
  expect(backup.notes).toEqual([69]);
  expect(backup.lengths).toEqual([4]);
  expect(external).toEqual([]);
});
