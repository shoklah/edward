import { expect, test } from '@playwright/test';
import { pinClock } from './fixed-time.ts';

test.beforeEach(async ({ page }) => {
  await pinClock(page);
});

test('the runs list matches its screenshot', async ({ page }) => {
  await page.goto('/work?view=runs');
  await expect(page.getByRole('link', { name: 'Queue edits offline and replay them on reconnect' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveScreenshot('runs.png');
});

test('the run page matches its screenshot', async ({ page }) => {
  await page.goto('/work?view=runs');
  await page.getByRole('link', { name: 'Queue edits offline and replay them on reconnect' }).click();
  await expect(page.getByRole('group', { name: "The run's flow" })).toBeVisible();
  await expect(page.getByRole('main')).toHaveScreenshot('run.png');
});

test("the run page with a step selected matches its screenshot", async ({ page }) => {
  await page.goto('/work?view=runs');
  await page.getByRole('link', { name: 'Queue edits offline and replay them on reconnect' }).click();
  const check = page.getByRole('group', { name: "The run's flow" }).getByRole('button', { name: /^Wave A check/ });
  await check.click();
  await expect(page.getByRole('region', { name: 'Wave A check', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toHaveScreenshot('run-step.png');
});

test("a kit run's page with a kit review selected matches its screenshot", async ({ page }) => {
  await page.goto('/runs/6bc423e6814243f9');
  await page.getByRole('group', { name: "The run's flow" }).getByRole('button', { name: /^Task 1 kit review/ }).click();
  await expect(page.getByRole('region', { name: 'Task 1 kit review', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toHaveScreenshot('run-kit.png');
});
