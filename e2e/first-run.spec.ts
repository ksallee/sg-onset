// The first run: one screen that says what the app is, a project and its first shoot day or the
// sample project, the offers that are never forced, and what a returning person sees: none of it.
// Each test starts on an empty device.
import type { Page } from '@playwright/test';
import { auditLayout } from './audit';
import { expect, open, test } from './fixtures';

const create = (page: Page) => page.getByRole('button', { name: 'Create Project', exact: true });
const name = (page: Page) => page.getByRole('textbox', { name: 'Name' });

test.describe('first run', () => {
	test('says what the app is and offers the two ways in', async ({ page }) => {
		await open(page, '/');
		await expect(page).toHaveURL(/\/welcome$/);
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
		await expect(page.getByText('On-set VFX data capture for Flow Production Tracking.')).toBeVisible();
		await expect(create(page)).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Load the Sample Project' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create and Sign In to Flow PT' })).toBeVisible();
		// The take button owns the word.
		await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
	});

	test('says it is an early prototype until dismissed, and that syncing is optional', async ({ page }) => {
		await open(page, '/welcome');
		const notice = page.getByRole('region', { name: 'Early prototype' });
		await expect(notice).toBeVisible();
		await expect(notice.getByText(/export a backup of anything you care about/)).toBeVisible();
		await expect(notice.getByRole('link', { name: 'Send Feedback on GitHub' })).toHaveAttribute('href', 'https://github.com/ksallee/sg-onset/issues');
		await expect(page.getByText(/^Syncing is optional\. If you try it, use a test project on a test site/)).toBeVisible();
		await notice.getByRole('button', { name: 'Got It' }).tap();
		await expect(notice).toHaveCount(0);
		await page.reload();
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
		await expect(notice).toHaveCount(0);
	});

	test('the date is today and the day is 1', async ({ page }) => {
		await open(page, '/welcome');
		const today = await page.evaluate(() => {
			const d = new Date();
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		});
		await expect(page.getByLabel('Date')).toHaveValue(today);
		await page.getByRole('button', { name: 'Day Number and Location' }).tap();
		await expect(page.getByRole('textbox', { name: 'Day number' })).toHaveValue('1');
	});

	test('a project with a long name in another script leads to its slates, and the first run is not seen again', async ({ page }) => {
		const long = 'Die unendliche Geschichte der Donaudampfschifffahrtsgesellschaft 夜の長い旅 🎬 Épisode 12';
		await open(page, '/welcome');
		await name(page).fill(long);
		await page.getByRole('textbox', { name: 'Unit' }).fill('2nd');
		await create(page).tap();
		await expect(page).toHaveURL(/\/slates$/);
		await auditLayout(page, test.info(), '/slates after a long name');

		await page.goto('/');
		await expect(page).toHaveURL(/\/shoot$/);
		await page.goto('/settings');
		await expect(name(page)).toHaveValue(long);
		await expect(page.getByText(/^Day 1 · /)).toBeVisible();
	});

	test('asks for a name in place, calmly, and loses nothing typed', async ({ page }) => {
		await open(page, '/welcome');
		await page.getByRole('textbox', { name: 'Unit' }).fill('Splinter');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await create(page).tap();
		await expect(page.getByRole('alert')).toHaveText('Give the project a name.');
		await expect(name(page)).toBeFocused();
		await expect(page).toHaveURL(/\/welcome$/);
		await expect(page.getByRole('textbox', { name: 'Unit' })).toHaveValue('Splinter');

		await name(page).fill('The Long Night');
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	test('a day number that is not one is said, with its field opened', async ({ page }) => {
		await open(page, '/welcome');
		await name(page).fill('The Long Night');
		await page.getByRole('button', { name: 'Day Number and Location' }).tap();
		await page.getByRole('textbox', { name: 'Day number' }).fill('two');
		await create(page).tap();
		await expect(page.getByRole('alert')).toHaveText('A day number is a whole number, 1 or more.');
		await expect(page.getByRole('textbox', { name: 'Day number' })).toBeFocused();
		await page.getByRole('textbox', { name: 'Day number' }).fill('2');
		await create(page).tap();
		await expect(page).toHaveURL(/\/slates$/);
	});

	test('what was typed survives a reload', async ({ page }) => {
		await open(page, '/welcome');
		await name(page).fill('Näcken 🎬');
		await page.getByRole('textbox', { name: 'Unit' }).fill('Main');
		await page.getByRole('button', { name: 'Day Number and Location' }).tap();
		await page.getByRole('textbox', { name: 'Location' }).fill('Stage 4');
		await page.reload();
		await expect(name(page)).toHaveValue('Näcken 🎬');
		await expect(page.getByRole('textbox', { name: 'Unit' })).toHaveValue('Main');
		await expect(page.getByRole('textbox', { name: 'Location' })).toHaveValue('Stage 4');
	});

	test('two fast taps make one project', async ({ page }) => {
		await open(page, '/welcome');
		await name(page).fill('The Long Night');
		await create(page).dblclick();
		await expect(page).toHaveURL(/\/slates$/);
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await expect(page.getByRole('dialog').getByRole('button', { name: 'The Long Night' })).toHaveCount(1);
	});

	test('create and sign in goes by sign-in and knows the way back', async ({ page }) => {
		await open(page, '/welcome');
		await name(page).fill('The Long Night');
		await page.getByRole('button', { name: 'Create and Sign In to Flow PT' }).tap();
		await expect(page).toHaveURL(/\/sign-in\?next=%2Fslates$/);
		await expect(page.getByRole('textbox', { name: 'Flow PT site' })).toBeVisible();
		await page.getByRole('link', { name: 'Slates' }).first().tap();
		await expect(page).toHaveURL(/\/slates$/);
	});

	test('the sample project is marked, loads once, and is deleted in Settings', async ({ page }) => {
		await open(page, '/welcome');
		await expect(page.getByText(/A made-up project named Sample project/)).toBeVisible();
		await page.getByRole('button', { name: 'Load the Sample Project' }).dblclick();
		await expect(page).toHaveURL(/\/shoot$/);

		await page.goto('/settings');
		await expect(name(page)).toHaveValue('Sample project');
		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await expect(page.getByRole('dialog').getByRole('button', { name: 'Sample project' })).toHaveCount(1);
		await page.getByRole('button', { name: 'Done' }).tap();

		// The only project: its going is asked, since the app returns to the first run.
		await page.getByRole('button', { name: 'Delete the Sample Project' }).tap();
		await expect(page.getByText('Delete the only project?')).toBeVisible();
		await page.getByRole('button', { name: 'Delete the Sample Project' }).last().tap();
		await expect(page).toHaveURL(/\/welcome$/);
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
	});

	test('one more project is a plain form with a way back, and the sample on offer', async ({ page }) => {
		await open(page, '/welcome');
		await name(page).fill('The Long Night');
		await create(page).tap();
		await expect(page).toHaveURL(/\/slates$/);
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await page.getByRole('button', { name: 'New project' }).tap();
		await expect(page).toHaveURL(/\/welcome$/);
		await expect(page.getByRole('heading', { name: 'New project', level: 1 })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create and Sign In to Flow PT' })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Add to Home Screen first' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Load the Sample Project' })).toBeVisible();
		await auditLayout(page, test.info(), '/welcome (one more project)');
	});

	test('every control is named and at least 44 px, with the problems showing too', async ({ page }) => {
		await open(page, '/welcome');
		await page.getByRole('button', { name: 'Day Number and Location' }).tap();
		await page.getByRole('textbox', { name: 'Day number' }).fill('x');
		await create(page).tap();
		await expect(page.getByRole('alert').first()).toBeVisible();
		const audit = await auditLayout(page, test.info(), '/welcome');
		expect(audit.small).toEqual([]);
		expect(audit.unnamed).toEqual([]);
	});
});

test.describe('add to home screen', () => {
	test('is shown in a tab on iPadOS with the two taps, and never again once dismissed', async ({ page }, testInfo) => {
		test.skip(!testInfo.project.name.startsWith('ipad'), 'the guidance is for Safari on iPadOS and iOS');
		await open(page, '/welcome');
		const card = page.getByRole('region', { name: 'Add to Home Screen first' });
		await expect(card).toBeVisible();
		await expect(card.getByText('Tap Share in the Safari toolbar.')).toBeVisible();
		await expect(card.getByText('Tap Add to Home Screen, then open SG OnSet from there.')).toBeVisible();
		// The form is there to use without answering.
		await expect(create(page)).toBeEnabled();

		await card.getByRole('button', { name: 'Not Now' }).tap();
		await expect(card).toHaveCount(0);
		await page.reload();
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
		await expect(card).toHaveCount(0);
	});

	test('is not shown in another browser', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name.startsWith('ipad'), 'the phone target is not Safari');
		await open(page, '/welcome');
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add to Home Screen first' })).toHaveCount(0);
	});

	test('is not shown once installed', async ({ page }) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
		await open(page, '/welcome');
		await expect(page.getByRole('heading', { name: 'SG OnSet', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Add to Home Screen first' })).toHaveCount(0);
	});
});
