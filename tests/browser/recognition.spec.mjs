import { test, expect } from './fixtures.mjs';
import { control, installSyntheticMicrophone, openRecognition } from './helpers.mjs';

for (const [pitch, frequency] of [['A4', 440], ['C5', 523.2511306011972], ['D♯6', 1244.5079348883237]]) {
  test(`microphone recognition identifies a generated ${pitch} tone`, async ({ page }) => {
    await installSyntheticMicrophone(page, frequency);
    await openRecognition(page, pitch);
    await control(page, 'recognition-start').click();
    await expect(control(page, 'recognition-target')).toHaveClass(/recognition-hit/);
    await control(page, 'recognition-stop').click();
    await expect(control(page, 'recognition-diagram')).toBeVisible();
    await control(page, 'practice-mode-back').click();
    await expect(control(page, 'practice-history')).toContainText('1/1 correct');
  });
}

test('flashcard rating persists progress and moves the reviewed pitch out of the due queue', async ({ page }) => {
  await openRecognition(page, 'A4');
  await control(page, 'recognition-flash').click();
  await expect(control(page, 'recognition-flash')).toHaveAttribute('aria-pressed', 'true');
  await control(page, 'recognition-diagram').locator('circle').first().click({ button: 'right' });
  await control(page, 'recognition-fill-holes').click();
  await control(page, 'recognition-submit').click();
  await expect(control(page, 'recognition-target')).toHaveClass(/recognition-hit/);
  await control(page, 'recognition-ratings').getByRole('button', { name: /^Good/ }).click();
  await expect(control(page, 'recognition-status')).toContainText('All caught up');
  const reviewed = await page.evaluate(() => JSON.parse(localStorage.getItem('osm-recognition-fsrs-v1'))['69']);
  expect(reviewed.reps).toBe(1);
  expect(Date.parse(reviewed.due)).toBeGreaterThan(Date.parse(reviewed.last_review));
  await page.reload();
  await page.locator('[data-oc-page="practice-setup"]').click();
  await expect(control(page, 'practice-history')).toContainText('Flashcards');
  await page.locator('[data-practice-mode="recognition"]').click();
  await control(page, 'practice-recognition').getByText('Choose pitches', { exact: true }).click();
  await control(page, 'recognition-clear').click();
  await control(page, 'recognition-pool').getByRole('button', { name: 'A4', exact: true }).click();
  await control(page, 'recognition-flash').click();
  await expect(control(page, 'recognition-status')).toContainText('All caught up');
  const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem('osm-recognition-fsrs-v1'))['69']);
  expect(reopened).toEqual(reviewed);
});
