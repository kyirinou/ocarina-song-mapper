import { test, expect } from './fixtures.mjs';
import AxeBuilder from '@axe-core/playwright';
import { control, importNotes, editorCommand, waitForPreview } from './helpers.mjs';

async function expectAccessible(page) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = audit.violations.filter(item => ['serious', 'critical'].includes(item.impact));
  expect(violations.map(({ id, nodes }) => ({ id, elements: nodes.map(node => node.target) }))).toEqual([]);
}

test('home, score editor and page editor have no serious or critical automated accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expectAccessible(page);
  await importNotes(page);
  await expectAccessible(page);
  await editorCommand(page, 'View', 'score-preview');
  await waitForPreview(page);
  await expectAccessible(page);
});

test('manual recognition controls remain keyboard operable', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-oc-page="practice-setup"]').click();
  await page.locator('[data-practice-mode="recognition"]').click();
  const hole = control(page, 'recognition-diagram').getByRole('button', { name: 'Hole 1', exact: true });
  await hole.focus();
  await page.keyboard.press('Space');
  await expect(hole).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(hole).toHaveAttribute('aria-pressed', 'false');
  await expectAccessible(page);
});
