import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Starts showing lantern-notes only, through the dialog. */
export async function startShowing(page: Page): Promise<void> {
  await page.getByRole('switch', { name: 'Showing mode' }).click();
  const dialog = page.getByRole('dialog', { name: 'Show which projects in full?' });
  await dialog.getByRole('checkbox', { name: 'lantern-notes' }).check();
  await dialog.getByRole('button', { name: 'Start showing' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Stops it, since the mode is server state. */
export async function stopShowing(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/showing', { data: { projects: [] }, headers: { 'X-Dashboard-Refresh': '1' } });
  expect(response.status()).toBe(204);
}
