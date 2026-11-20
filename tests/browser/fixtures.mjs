import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(errors);
    expect(errors, 'the application should not throw uncaught browser errors').toEqual([]);
  }, { auto: true }],
});
export { expect };
