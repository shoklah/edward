import { expect, test } from '@playwright/test';
import { pinClock } from './fixed-time.ts';

// The one e2e file with motion on: the others run under reduced motion (`playwright.config.ts`).

test.use({ reducedMotion: 'no-preference' });
test.beforeEach(({ page }) => pinClock(page));

test('hover, presses and focus are instant; a thumb, a dialog and a tooltip have their times', async ({ page }) => {
  await page.goto('/work?view=sessions', { waitUntil: 'networkidle' });
  // A probe with a slot's attributes, so a state shown for 120 ms is read without a race.
  const style = (attributes: Record<string, string>, property: string, tag = 'div') =>
    page.evaluate(([attributes, property, tag]) => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
      document.body.append(el);
      const read = getComputedStyle(el).getPropertyValue(property);
      el.remove();
      return read;
    }, [attributes, property, tag] as const);
  for (const el of ['[data-variant][data-size]', '[data-slot="table-row"]', '[data-slot="switch"]']) {
    expect(await page.locator(el).first().evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  }
  expect(await style({ 'data-slot': 'input' }, 'transition-duration', 'input')).toBe('0s');
  expect(await style({ 'data-slot': 'dialog-close', class: 'transition-opacity' }, 'transition-duration')).toBe('0s');
  const thumb = page.locator('[data-slot="switch-thumb"]').first();
  expect(await thumb.evaluate((e) => [getComputedStyle(e).transitionProperty, getComputedStyle(e).transitionDuration])).toEqual(['translate', '0.16s']);
  for (const slot of ['dialog-content', 'dialog-overlay']) {
    expect(await style({ 'data-slot': slot, 'data-state': 'closed' }, 'animation-duration')).toBe('0.12s');
  }
  expect(await style({ 'data-slot': 'tooltip-content' }, 'animation-duration')).toBe('0.2s');
  await page.getByRole('complementary').getByRole('switch', { name: 'Showing mode' }).click();
  expect(await page.getByRole('dialog').evaluate((e) => getComputedStyle(e).animationDuration)).toBe('0.2s');
});
