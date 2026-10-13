import { expect, test } from '@playwright/test';

/**
 * Critical user journey across all three roles, through the real UI:
 * admin creates a project -> manager staffs it and adds a milestone ->
 * employee logs time -> manager completes it -> admin archives and restores it.
 *
 * Uses the seeded demo accounts. Each run creates a uniquely named project.
 */
const PROJECT = `E2E Launch ${Date.now()}`;

async function signIn(page, username, password) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello');
}

async function signOut(page) {
  await page.evaluate(() => window.localStorage.clear());
}

async function openProject(page) {
  await page.goto('/projects');
  await page.getByRole('link', { name: PROJECT }).first().click();
  await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible();
}

test('admin -> manager -> employee -> manager -> admin lifecycle', async ({ page }) => {
  // Admin creates the project and assigns Maria as manager.
  await signIn(page, 'admin', 'Admin123!');
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill(PROJECT);
  await page.getByLabel('Project manager').click();
  await page.getByRole('option', { name: 'Maria Lopez' }).click();
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(today); start.setDate(start.getDate() - 7);
  const end = new Date(today); end.setDate(end.getDate() + 30);
  await page.getByLabel('Start date').fill(iso(start));
  await page.getByLabel('Estimated end date').fill(iso(end));
  await page.getByLabel('Budget (USD)').fill('25000');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible();
  await signOut(page);

  // Manager staffs the project (own team + someone from another team) and adds a milestone.
  await signIn(page, 'mlopez', 'Manager123!');
  await openProject(page);
  await page.getByRole('tab', { name: /Team/ }).click();
  await page.getByRole('button', { name: 'Add people' }).first().click();
  await page.getByRole('button', { name: 'Select whole team' }).click();
  await page.getByRole('checkbox', { name: 'Sam Okafor' }).check();
  await page.getByRole('button', { name: /Add 3 people/ }).click();
  await expect(page.getByText('On loan from David Chen\'s team')).toBeVisible();

  await page.getByRole('tab', { name: /Milestones/ }).click();
  await page.getByRole('button', { name: 'Add milestone' }).first().click();
  await page.getByLabel('Milestone name').fill('Beta release');
  await page.getByLabel('Start date').fill(iso(start));
  await page.getByLabel('End date').fill(iso(end));
  await page.getByLabel('Budget (USD)').fill('10000');
  await page.getByRole('button', { name: 'Add milestone' }).last().click();
  await expect(page.getByRole('cell', { name: 'Beta release', exact: true })).toBeVisible();
  await signOut(page);

  // Employee logs a full day on it.
  await signIn(page, 'apatel', 'Employee123!');
  await openProject(page);
  await page.getByRole('button', { name: 'Log time' }).first().click();
  await page.getByLabel('What did you work on?').fill('Built the beta signup flow');
  await page.getByRole('button', { name: 'Log time' }).last().click();
  await expect(page.getByText('Time logged.')).toBeVisible();
  await expect(page.getByText(/8 h \(1 day\)/)).toBeVisible();
  // Employees cannot manage the project.
  await expect(page.getByRole('button', { name: 'Edit project' })).toHaveCount(0);
  await signOut(page);

  // Manager completes the milestone and the project.
  await signIn(page, 'mlopez', 'Manager123!');
  await openProject(page);
  await page.getByRole('button', { name: 'Actions for Beta release' }).click();
  await page.getByRole('menuitem', { name: 'Mark as completed' }).click();
  await expect(page.getByText('Beta release marked as completed.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await page.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(page.getByText('Project marked as completed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0); // managers cannot archive
  await signOut(page);

  // Admin archives it, finds it in the Archive, and restores it.
  await signIn(page, 'admin', 'Admin123!');
  await openProject(page);
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('button', { name: 'Archive project' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('link', { name: PROJECT })).toHaveCount(0);
  await page.goto('/archive');
  const row = page.getByRole('row', { name: new RegExp(PROJECT) });
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(`Restored ${PROJECT}.`)).toBeVisible();
});

test('role-based navigation hides admin areas', async ({ page }) => {
  await signIn(page, 'apatel', 'Employee123!');
  await expect(page.getByRole('link', { name: 'Archive' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /People/ })).toHaveCount(0);
  await page.goto('/archive');
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

test('invalid login shows a clear error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill('admin');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect username or password.')).toBeVisible();
});
