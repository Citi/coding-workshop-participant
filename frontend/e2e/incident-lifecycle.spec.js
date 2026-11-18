import { expect, test } from '@playwright/test';
import { ACCOUNTS, actions, asUser, openNotification, stamp } from './helpers.js';

/**
 * The core journey across all three personas, through the real UI, API and database:
 * employee reports + escalates -> admin reviews, sets priority, assigns ->
 * engineer works and resolves -> employee confirms and closes.
 * Each hand-off is followed through the notification bell.
 */
test('incident lifecycle across employee, admin and engineer', async ({ browser }) => {
  const title = `[e2e] Projector flickering ${stamp()}`;

  // --- Employee reports the incident -------------------------------------------------
  const employee = await asUser(browser, ACCOUNTS.employee);
  await employee.getByRole('link', { name: 'Report incident' }).first().click();
  await expect(employee.getByRole('heading', { name: 'Report an incident' })).toBeVisible();
  await expect(employee.getByRole('option', { name: 'Critical' })).toHaveCount(0); // employees can't pick critical

  await employee.getByLabel('Title').fill(title);
  await employee.getByLabel('Description').fill('The projector in room 1A flickers every few seconds.');
  await employee.getByLabel('Category').selectOption('audio_visual');
  await employee.getByLabel('Building').selectOption({ label: 'ACME Headquarters' });
  await employee.getByLabel(/^Floor/).selectOption({ index: 1 });
  await employee.getByRole('button', { name: 'Submit incident' }).click();

  await expect(employee.getByRole('heading', { name: title })).toBeVisible();
  await expect(employee.locator('.badge-row')).toContainText('Open');
  const incidentUrl = employee.url();

  // ...and escalates it, asking for High priority
  await employee.getByRole('button', { name: /Escalate \/ request/ }).click();
  await employee.getByPlaceholder('Why is this urgent?').fill('Client presentation at 2pm.');
  await employee.locator('.action-block select').selectOption('high');
  await employee.getByRole('button', { name: 'Escalate', exact: true }).click();
  await expect(employee.getByText('Escalation reason')).toBeVisible();
  await expect(employee.getByText('→ High requested')).toBeVisible();

  // --- Admin is notified, approves the priority and assigns Tom ----------------------
  const admin = await asUser(browser, ACCOUNTS.admin);
  const needsAttention = admin.locator('section.panel').filter({ has: admin.getByRole('heading', { name: 'Needs attention' }) });
  await expect(needsAttention.getByRole('row', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) })).toContainText('Escalated');
  await openNotification(admin, new RegExp(`reported INC-\\d+: \\[e2e\\] Projector flickering`));
  await expect(admin).toHaveURL(incidentUrl);

  await expect(admin.getByText('Employee requested High.')).toBeVisible();
  await admin.getByRole('button', { name: 'Set priority' }).click();
  await expect(admin.locator('.badge-row')).toContainText('High');
  await admin.getByRole('button', { name: 'Clear escalation' }).click();
  await expect(admin.locator('.badge-row')).not.toContainText('Escalated');

  const assign = actions(admin, 'Assign engineer').locator('select');
  const tomId = await assign.locator('option', { hasText: 'Tom Tech' }).getAttribute('value');
  await assign.selectOption(tomId);
  await admin.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(admin.locator('.details')).toContainText('Tom Tech');
  await expect(admin.locator('.badge-row')).toContainText('Assigned');

  // --- Engineer gets the assignment, works it and resolves --------------------------
  const engineer = await asUser(browser, ACCOUNTS.engineer);
  await openNotification(engineer, /assigned INC-\d+ to you/);
  await expect(engineer.getByRole('heading', { name: title })).toBeVisible();
  await expect(engineer.getByRole('button', { name: 'Delete incident' })).toHaveCount(0);

  await engineer.getByRole('button', { name: 'Start work' }).click();
  await expect(engineer.locator('.badge-row')).toContainText('In progress');

  await engineer.getByPlaceholder('Write a note…').fill('Lamp module is failing, swapping it now.');
  await engineer.getByRole('button', { name: 'Add note' }).click();
  await expect(engineer.getByRole('heading', { name: 'Notes (1)' })).toBeVisible();
  await engineer.getByPlaceholder('Write a note…').fill('Spare lamp taken from store room B.');
  await engineer.getByLabel(/Internal/).check();
  await engineer.getByRole('button', { name: 'Add note' }).click();
  await expect(engineer.getByRole('heading', { name: 'Notes (2)' })).toBeVisible();

  await engineer.getByPlaceholder(/Optional comment/).fill('New lamp fitted and tested.');
  await engineer.getByRole('button', { name: 'Mark resolved' }).click();
  await expect(engineer.locator('.badge-row')).toContainText('Resolved');

  // --- Employee is asked to confirm, sees only public notes, and closes -------------
  await employee.goto('/');
  await openNotification(employee, /to Resolved\. Please confirm the fix/);
  await expect(employee.getByText('Lamp module is failing, swapping it now.')).toBeVisible();
  await expect(employee.getByText('Spare lamp taken from store room B.')).toHaveCount(0); // internal
  await employee.getByRole('button', { name: 'Confirm fixed & close' }).click();

  await expect(employee.locator('.badge-row')).toContainText('Closed');
  await expect(employee.getByText('Notes are closed for this incident.')).toBeVisible();
  await expect(employee.getByText('Changed status: Resolved → Closed')).toBeVisible();
  await expect(employee.getByText('Changed priority: Medium → High')).toBeVisible();
});
