import { expect } from '@playwright/test';

export const PASSWORD = 'Password123!';
export const ACCOUNTS = {
  admin: 'alice.admin@acme.inc',
  engineer: 'tom.eng@acme.inc',
  employee: 'emma@acme.inc',
};

export const stamp = () => Date.now().toString(36);

/** Sign in through the login form; waits for the signed-in shell. */
export async function signIn(page, email, password = PASSWORD) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** A fresh, signed-in page for one persona (separate browser context = separate session). */
export async function asUser(browser, email) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept()); // confirm() prompts
  await signIn(page, email);
  return page;
}

/** Open the bell and click the notification containing `text`. */
export async function openNotification(page, text) {
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName(/unread/);
  await bell.click();
  await page.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: text }).first().click();
}

export const actions = (page, heading) =>
  page.locator('.action-block').filter({ has: page.getByRole('heading', { name: heading }) });
