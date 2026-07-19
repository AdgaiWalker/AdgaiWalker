import { expect, test } from 'playwright/test';

function filterKnownDevServerNoise(errors: string[]) {
  return errors.filter((message) => !message.includes('Failed to fetch dynamically imported module'));
}

test('client router keeps the fullscreen theme toggle responsive after navigation', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/about');
  const body = page.locator('body');
  const toggle = page.locator('#fullscreen-theme-toggle');

  const firstClass = await body.getAttribute('class');
  await toggle.click();
  await expect.poll(async () => body.getAttribute('class')).not.toBe(firstClass);

  await page.goto('/posts');
  await page.goto('/learn');
  await page.locator('.learn-tab[data-tab="thoughts"]').click();
  await expect(page.locator('#tab-thoughts')).toHaveClass(/active/);

  await page.goto('/about');
  const secondClass = await body.getAttribute('class');
  await toggle.click();
  await expect.poll(async () => body.getAttribute('class')).not.toBe(secondClass);

  expect(filterKnownDevServerNoise(pageErrors)).toEqual([]);
});

test('ideas page supports deep links and card expansion without page errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/ideas');
  const firstCard = page.locator('.card-container:not(.is-blurred)').first();
  await expect(firstCard).toBeVisible();

  const slug = await firstCard.getAttribute('data-id');
  expect(slug).toBeTruthy();

  await page.goto(`/ideas#${encodeURIComponent(slug!)}`);
  const deepLinkedCard = page.locator(`.card-container[data-id="${slug}"]`);
  await expect(deepLinkedCard).toHaveAttribute('aria-expanded', 'true');
  await expect(deepLinkedCard.locator('.read-full-link')).toBeVisible();

  expect(filterKnownDevServerNoise(pageErrors)).toEqual([]);
});
