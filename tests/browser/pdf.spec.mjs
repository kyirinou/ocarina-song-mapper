import { test, expect } from './fixtures.mjs';
import { control, editorCommand, importNotes, previewCommand, waitForPreview } from './helpers.mjs';

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return [...Buffer.concat(chunks)];
}

test('tab PDF preserves every preview page and renders fingerings at their preview locations', async ({ page }) => {
  test.setTimeout(90000);
  await importNotes(page, 'A4 - C5 - F6');
  await page.locator('[data-editor-view="tabs"]').click();
  const text = 'A  D\tU\n\n D A\n' + 'ADU\n'.repeat(35);
  await control(page, 'native-tab-text').fill(text);
  await control(page, 'native-tab-title').fill('PDF reference');
  await editorCommand(page, 'View', 'score-preview');
  await waitForPreview(page);
  const geometry = await control(page, 'preview-paper').evaluate(element => {
    const pages = [...element.querySelectorAll('.osm-preview-page')];
    return pages.map(page => ({
      width: parseFloat(page.style.width), height: parseFloat(page.style.height),
      cells: [...page.querySelectorAll('[data-tab-index]')].map(cell => ({
        x: parseFloat(cell.style.left), y: parseFloat(cell.style.top),
        width: parseFloat(cell.style.width), height: parseFloat(cell.style.height),
      })),
    }));
  });
  expect(geometry.length).toBeGreaterThan(1);
  expect(geometry.reduce((count, page) => count + page.cells.length, 0)).toBe((text.match(/[A-Ur]/g) ?? []).length);
  const pending = page.waitForEvent('download');
  await previewCommand(page, 'File', 'export');
  const bytes = await readDownload(await pending);
  expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  const rendered = await page.evaluate(async ({ bytes, geometry }) => {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/pdf-reader.js'; script.onload = resolve; script.onerror = reject;
        document.head.append(script);
      });
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf-worker.js';
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const results = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const sheet = await pdf.getPage(number), viewport = sheet.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      await sheet.render({ canvasContext: context, viewport }).promise;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const darkPixels = geometry[number - 1].cells.map(cell => {
        let count = 0;
        const right = Math.min(canvas.width, Math.ceil(cell.x + cell.width));
        const bottom = Math.min(canvas.height, Math.ceil(cell.y + cell.height));
        for (let y = Math.max(0, Math.floor(cell.y)); y < bottom; y++) {
          for (let x = Math.max(0, Math.floor(cell.x)); x < right; x++) {
            const offset = (y * canvas.width + x) * 4;
            if (image.data[offset] < 150 && image.data[offset + 1] < 150 && image.data[offset + 2] < 150) count++;
          }
        }
        return count;
      });
      results.push({ width: viewport.width, height: viewport.height, darkPixels });
    }
    await pdf.destroy();
    return results;
  }, { bytes, geometry });
  expect(rendered).toHaveLength(geometry.length);
  for (const [index, sheet] of rendered.entries()) {
    expect(sheet.width).toBeCloseTo(geometry[index].width, 1);
    expect(sheet.height).toBeCloseTo(geometry[index].height, 1);
    for (const pixels of sheet.darkPixels) expect(pixels).toBeGreaterThan(15);
    for (const cell of geometry[index].cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(sheet.width + 1);
      expect(cell.y + cell.height).toBeLessThanOrEqual(sheet.height + 1);
    }
  }
});
