import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { pinClock } from './fixed-time.ts';
import { settled } from './settled.ts';

test.beforeEach(async ({ page }) => {
  await pinClock(page);
});

// dev:fixtures' report-kits: the ui kit in four runs, the prose kit in one.
test('the kits page shows a kit’s reviews, lists a line’s findings and has no axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Kits' }).click();
  await expect(page.getByRole('heading', { name: 'Kits', level: 1 })).toBeVisible();
  const kit = page.getByRole('combobox', { name: 'Kit' });
  await expect(kit).toHaveValue('ui');
  const reviews = page.getByRole('region', { name: "Reviews in the kit's runs table", exact: true });
  await expect(reviews.getByRole('row').nth(2).getByRole('cell')).toHaveText(['6', '2', '0', '–not known', '3', '67', '4', '0', '1', '2', '3.05']);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const line = page.getByRole('button', { name: 'Every width' });
  await line.click();
  const list = page.getByRole('region', { name: '3 findings of "Every width"' });
  await expect(list.getByRole('link', { name: 'Show what each sync did' })).toHaveCount(2);
  await settled(page.getByRole('row').filter({ has: line }));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
