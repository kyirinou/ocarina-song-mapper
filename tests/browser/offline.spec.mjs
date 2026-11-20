import { test, expect } from './fixtures.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { control, editorCommand, waitForPreview, previewCommand } from './helpers.mjs';

test('standalone offline build can compose, render, play and export without network access', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ offline: true, acceptDownloads: true });
  try {
    const page = await context.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.goto(pathToFileURL(resolve('osm-offline.html')).href);
    await control(page, 'new').click();
    await control(page, 'compose-keys').getByRole('button', { name: 'A4', exact: true }).click();
    await control(page, 'compose-keys').getByRole('button', { name: 'C5', exact: true }).click();
    await expect(control(page, 'staff').locator('.abcjs-note')).toHaveCount(2);
    await control(page, 'play').click();
    await expect(control(page, 'staff').locator('.playing-note').first()).toBeVisible();
    await control(page, 'stop').click();
    await page.locator('[data-editor-view="tabs"]').click();
    await editorCommand(page, 'View', 'score-preview');
    await waitForPreview(page);
    const pending = page.waitForEvent('download');
    await previewCommand(page, 'File', 'export');
    const pdf = await pending;
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    const stream = await pdf.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
    expect(network).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
