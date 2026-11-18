import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, asUser, stamp } from './helpers.js';

test('admin defines a building, floor and seat, then removes them', async ({ browser }) => {
  const page = await asUser(browser, ACCOUNTS.admin);
  const code = `E2E${stamp().slice(-6).toUpperCase()}`;
  await page.getByRole('link', { name: 'Facilities' }).click();

  await page.getByRole('button', { name: 'Add building' }).click();
  await page.getByLabel('Code').fill(code);
  await page.getByLabel('Name', { exact: true }).fill(`E2E Test Building ${code}`);
  await page.getByRole('button', { name: 'Create building' }).click();
  await expect(page.getByRole('button', { name: new RegExp(code) })).toContainText('0 floors · 0 seats');

  await page.getByLabel('New floor number').fill('4');
  await page.getByLabel('New floor name').fill('Fourth Floor');
  await page.getByRole('button', { name: 'Add floor' }).click();
  await expect(page.getByText('Floor 4')).toBeVisible();

  await page.getByLabel('New seat code').fill('4A-001');
  await page.getByRole('button', { name: 'Add seat' }).click();
  await expect(page.getByRole('cell', { name: '4A-001' })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(code) })).toContainText('1 floor · 1 seat');

  // the new location is offered to employees when reporting
  const employee = await asUser(browser, ACCOUNTS.employee);
  await employee.goto('/#/incidents/new');
  await employee.getByLabel('Building').selectOption({ label: `E2E Test Building ${code}` });
  await employee.getByLabel(/^Floor/).selectOption({ label: 'Fourth Floor' });
  await expect(employee.getByLabel(/^Seat/).locator('option', { hasText: '4A-001' })).toHaveCount(1);

  // unused items can be deleted (confirm dialogs are accepted by the helper)
  await page.getByRole('row', { name: /4A-001/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('cell', { name: '4A-001' })).toHaveCount(0);
  await page.locator('.panel-header').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: new RegExp(code) })).toHaveCount(0);
});

test('admin cannot delete a building that incidents use', async ({ browser }) => {
  const page = await asUser(browser, ACCOUNTS.admin);
  await page.goto('/#/admin/facilities');
  await page.getByRole('button', { name: /HQ1 ACME Headquarters/ }).click();
  await page.locator('.panel-header').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alert')).toContainText('Deactivate it instead.');
});

test('admin creates an engineer who can sign in and set availability', async ({ browser }) => {
  const admin = await asUser(browser, ACCOUNTS.admin);
  const email = `e2e.eng.${stamp()}@acme.inc`;
  await admin.getByRole('link', { name: 'Engineers' }).click();
  await admin.getByRole('button', { name: 'Add engineer' }).click();
  await admin.getByLabel('Full name').fill('Eddie Endtoend');
  await admin.getByLabel('Work email').fill(email);
  await admin.getByLabel('Temporary password').fill(PASSWORD);
  await admin.getByLabel('HVAC').check();
  await admin.getByRole('button', { name: 'Create engineer' }).click();
  await expect(admin.getByRole('status')).toContainText(`can now sign in as ${email}`);
  await expect(admin.getByRole('row', { name: /Eddie Endtoend/ })).toContainText('HVAC');

  const engineer = await asUser(browser, email);
  await expect(engineer.getByRole('heading', { name: 'Hello, Eddie' })).toBeVisible();
  const availability = engineer.getByRole('radiogroup', { name: 'My availability' });
  await availability.getByRole('radio', { name: 'On leave' }).click();
  await expect(availability.getByRole('radio', { name: 'On leave' })).toHaveAttribute('aria-checked', 'true');

  // ...which the admin sees straight away
  await admin.reload();
  await expect(admin.getByRole('row', { name: /Eddie Endtoend/ })).toContainText('On leave');
});
