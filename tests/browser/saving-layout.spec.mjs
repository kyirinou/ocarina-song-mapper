import { test, expect } from './fixtures.mjs';
import { control, editorCommand, importNotes, previewCommand, projectBackup, waitForPreview } from './helpers.mjs';

const pixelPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQImWP4z8Dwn4GBgYGJAQoAHgQCAWP6H+IAAAAASUVORK5CYII=', 'base64');

async function changeField(page, selector, value) {
  const field = page.locator(selector);
  await field.fill(String(value));
  await field.press('Tab');
  await waitForPreview(page);
}

test('project backup and saved reopen retain tab text, page design and embedded images', async ({ page }) => {
  await importNotes(page, 'A4 - C5 - F6');
  await page.locator('[data-editor-view="tabs"]').click();
  const tabs = 'A  D\tU\n\n D A';
  await control(page, 'native-tab-text').fill(tabs);
  await control(page, 'native-tab-title').fill('Layout reference');
  await control(page, 'native-tab-credit').fill('Example author');
  await editorCommand(page, 'View', 'score-preview');
  await waitForPreview(page);
  await control(page, 'score-preview').locator('[data-heading-field="font"]').selectOption('Times New Roman, serif');
  await waitForPreview(page);
  await changeField(page, '[data-paper-field="tabSize"]', 40);
  await previewCommand(page, 'Edit', 'text');
  await changeField(page, '[data-object-field="text"]', 'Practice slowly\nKeep the breath steady');
  await changeField(page, '[data-object-field="opacity"]', 65);
  await control(page, 'preview-image').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: pixelPNG });
  await expect(control(page, 'preview-object')).toHaveValue(/.+/);
  await expect(control(page, 'preview-object').locator('option')).toHaveCount(3);
  await waitForPreview(page);
  await previewCommand(page, 'File', 'save');
  await control(page, 'score-preview').getByRole('button', { name: 'Close page editor', exact: true }).click();
  const before = await projectBackup(page);
  expect(before.tabDraft.text).toBe(tabs);
  expect(before.tabDraft.paperLayouts.tabs.title.font).toBe('Times New Roman, serif');
  expect(before.tabDraft.paperLayouts.tabs.objects).toHaveLength(2);
  expect(before.tabDraft.paperLayouts.tabs.objects[0].text).toBe('Practice slowly\nKeep the breath steady');
  expect(before.tabDraft.paperLayouts.tabs.objects[0].opacity).toBe(0.65);
  expect(before.tabDraft.paperLayouts.tabs.objects[1].src).toMatch(/^data:image\/png;base64,/);
  await page.reload();
  await control(page, 'recent-scores').getByRole('button').first().click();
  const reopened = await projectBackup(page);
  for (const property of ['notes', 'lengths', 'intervals', 'performance', 'tabDraft']) expect(reopened[property]).toEqual(before[property]);

  await control(page, 'editor-home').click();
  await page.locator('[data-oc-page="import"]').click();
  await control(page, 'restore').setInputFiles({ name: 'reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
  await expect(control(page, 'page-editor')).toBeVisible();
  const restored = await projectBackup(page);
  expect(restored.id).not.toBe(before.id);
  for (const property of ['notes', 'lengths', 'intervals', 'performance', 'tabDraft']) expect(restored[property]).toEqual(before[property]);
});

test('Enter sustains a selected note until release without skipping on key repeat', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('osm-ocarina-sound', 'oc1'));
  await importNotes(page, 'A4 - C5 - F6');
  await page.locator('[data-editor-view="sequence"]').click();
  await page.keyboard.down('Enter');
  await expect(control(page, 'now')).toHaveText('A4');
  await page.waitForTimeout(450);
  await page.keyboard.down('Enter');
  await expect(control(page, 'now')).toHaveText('A4');
  await page.keyboard.up('Enter');
  await expect(control(page, 'now')).toHaveText('—');
  await page.keyboard.down('Enter');
  await expect(control(page, 'now')).toHaveText('C5');
  await page.keyboard.up('Enter');
  await expect(control(page, 'now')).toHaveText('—');
});
