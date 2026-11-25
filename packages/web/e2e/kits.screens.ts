import { expect, test } from '@playwright/test';
import { pinClock } from './fixed-time.ts';

test('the kits page matches its screenshot', async ({ page }) => {
  await pinClock(page);
  await page.goto('/kits');
  // A chosen line, so its findings are on screen.
  await page.getByRole('button', { name: 'Every width' }).click();
  await expect(page.getByRole('region', { name: 'Findings', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toHaveScreenshot('kits.png');
});
