import { expect } from '@playwright/test';

export const control = (page, name) => page.locator(`#oc93-${name}`);

export async function importNotes(page, notation = 'A4 - C5 - E5 - F6') {
  await page.goto('/');
  await page.locator('[data-oc-page="import"]').click();
  await control(page, 'import-text').fill(notation);
  await control(page, 'import').click();
  await expect(control(page, 'page-editor')).toBeVisible();
  await expect(control(page, 'staff').locator('.abcjs-note').first()).toBeVisible();
}

export async function editorCommand(page, menu, command) {
  await page.locator('.osm-menubar summary').getByText(menu, { exact: true }).click();
  await page.locator(`[data-editor-command="${command}"]`).click();
}

export async function previewCommand(page, menu, command) {
  const preview = control(page, 'score-preview');
  await preview.locator('.osm-preview-menubar summary').getByText(menu, { exact: true }).click();
  await preview.locator(`.osm-preview-menubar details[open] [data-preview-command="${command}"]`).click();
}

export async function waitForPreview(page) {
  await expect(control(page, 'preview-play')).toBeEnabled();
  await expect(control(page, 'preview-paper').locator('.osm-preview-page').first()).toBeVisible();
}

export async function projectBackup(page) {
  await page.locator('.osm-menubar summary').getByText('File', { exact: true }).click();
  await control(page, 'export-toggle').click();
  const pending = page.waitForEvent('download');
  await control(page, 'backup').click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function openRecognition(page, pitch = 'A4') {
  await page.goto('/');
  await page.locator('[data-oc-page="practice-setup"]').click();
  await page.locator('[data-practice-mode="recognition"]').click();
  await control(page, 'practice-recognition').getByText('Choose pitches', { exact: true }).click();
  await control(page, 'recognition-clear').click();
  await control(page, 'recognition-pool').getByRole('button', { name: pitch, exact: true }).click();
  await expect(control(page, 'recognition-target')).toHaveText(pitch);
}

export async function installSyntheticMicrophone(page, frequency) {
  await page.addInitScript((frequency) => {
    Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.12;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        destination.stream.getTracks()[0].addEventListener('ended', () => context.close());
        return destination.stream;
      },
    });
  }, frequency);
}
