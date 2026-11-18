import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, asUser, signIn, stamp } from './helpers.js';

test('a new employee registers with an acme.inc email and signs in', async ({ page }) => {
  const email = `e2e.${stamp()}@acme.inc`;
  await page.goto('/');
  await expect(page).toHaveTitle('Sign in · ACME Facility Desk');
  await page.getByRole('tab', { name: 'Register' }).click();

  await page.getByLabel('Full name').fill('Erin Example');
  await page.getByLabel('Work email').fill('erin@gmail.com');
  await page.locator('input[autocomplete="new-password"]').first().fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Please use your @acme.inc email address.');

  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account created. You can now sign in.');

  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Erin' })).toBeVisible();
  await expect(page).toHaveTitle('Erin Example · ACME Facility Desk');
  await expect(page.getByText("You haven't reported any incidents yet.")).toBeVisible();

  // registering twice is refused
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByLabel('Full name').fill('Erin Again');
  await page.getByLabel('Work email').fill(email);
  await page.locator('input[autocomplete="new-password"]').first().fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.');
});

test('wrong password shows a clear error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Work email').fill(ACCOUNTS.employee);
  await page.locator('input[autocomplete="current-password"]').fill('not-my-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
});

test('employees cannot reach admin pages', async ({ browser }) => {
  const page = await asUser(browser, ACCOUNTS.employee);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Facilities' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Engineers' })).toHaveCount(0);

  await page.goto('/#/admin/engineers');
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
});

test('engineers only see their own tickets', async ({ browser }) => {
  const page = await asUser(browser, ACCOUNTS.engineer);
  await page.getByRole('link', { name: 'Incidents' }).click();
  await expect(page.getByRole('heading', { name: 'My tickets' })).toBeVisible();
  const engineers = page.locator('.incident-table tbody tr');
  for (const row of await engineers.all()) await expect(row).toContainText('Tom Tech');
});

test('the app explains when the server cannot be reached', async ({ page }) => {
  await signIn(page, ACCOUNTS.employee);
  await page.route('**/api/api-service/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
});
