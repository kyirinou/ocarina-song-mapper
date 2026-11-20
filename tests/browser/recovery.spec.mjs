import { test, expect } from './fixtures.mjs';
import { control, importNotes, projectBackup } from './helpers.mjs';

const libraryKey = 'ocarina-song-mapper-v1';

test('automatic recovery restores unsaved edits as a separate copy after reload', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await importNotes(page, 'A4 - C5');
  await control(page, 'save').click();
  const saved = await projectBackup(page);
  await control(page, 'compose-keys').getByRole('button', { name: 'E5', exact: true }).click();
  await expect.poll(() => page.evaluate(key => {
    const raw = localStorage.getItem(key + '-checkpoints');
    return raw ? JSON.parse(raw).payload.entries[0].project.notes.length : 0;
  }, libraryKey)).toBe(3);
  await page.reload();
  await control(page, 'recovery-open').click();
  const newest = control(page, 'recovery').locator('.osm-recovery-row').first();
  await expect(newest).toContainText('3 notes');
  await newest.getByRole('button', { name: 'Restore copy', exact: true }).click();
  const recovered = await projectBackup(page);
  expect(recovered.notes).toEqual([69, 76, 72]);
  expect(recovered.id).not.toBe(saved.id);
  expect(recovered.title).toContain('(recovered)');
  const original = await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key)).payload.projects.find(project => project.id === id), { key: libraryKey, id: saved.id });
  expect(original.notes).toEqual([69, 72]);
});

test('a failed storage commit keeps the prior saved library and allows downloading current edits', async ({ page }) => {
  await importNotes(page, 'A4 - C5');
  await control(page, 'save').click();
  const before = await page.evaluate(key => localStorage.getItem(key), libraryKey);
  await control(page, 'compose-keys').getByRole('button', { name: 'E5', exact: true }).click();
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Test storage quota reached', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, libraryKey);
  await control(page, 'save').click();
  await expect(control(page, 'project-status')).toContainText('Save failed');
  expect(await page.evaluate(key => localStorage.getItem(key), libraryKey)).toBe(before);
  const recoverable = await projectBackup(page);
  expect(recoverable.notes).toEqual([69, 76, 72]);
});

test('a truncated saved library falls back to the last verified library', async ({ page }) => {
  await importNotes(page, 'A4 - C5');
  await control(page, 'save').click();
  await control(page, 'save').click();
  await page.evaluate(key => localStorage.setItem(key, '{truncated'), libraryKey);
  await page.reload();
  await control(page, 'recent-scores').getByRole('button').first().click();
  expect((await projectBackup(page)).notes).toEqual([69, 72]);
  expect(await page.evaluate(key => localStorage.getItem(key + '-recovery'), libraryKey)).toBe('{truncated');
});
