// The reference log (#93) on the sample project: a reference added in two taps, a kind then the
// name, seen on the slate, in Wrap and in the day report; the next name suggested; a project's own
// kind from Settings; a reference edited and deleted, and the delete undone; a lidar scan turning the
// slate's switch on, and its delete offering Turn Off; an HDRI shown on every slate of its lighting
// setup, saying where it was logged, and moved to another slate of the setup when that slate is
// deleted (#107). Role and label selectors only. Every test starts on an empty device.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

/** Until a push or pop has finished: a page still sliding in is not where it lands. */
const settled = (page: Page) => page.waitForFunction(() => !document.documentElement.dataset.nav);

async function openSlate(page: Page, slate: string) {
	await openApp(page, '/slates');
	await page.getByRole('link', { name: new RegExp(`^${slate}`) }).tap();
	await expect(page.getByRole('heading', { name: `Slate ${slate}`, level: 1 })).toBeVisible();
	await settled(page);
}
const open42A = (page: Page) => openSlate(page, '42A');
const notice = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

const references = (page: Page) => page.getByRole('list').filter({ has: page.getByRole('group', { name: 'Add a reference' }) });

test('adds a reference in two taps and sees it on the slate and in Wrap', async ({ page }) => {
	await open42A(page);
	await expect(references(page).getByText('None yet.')).toBeVisible();

	// The first of its kind: a kind, then the name typed.
	await page.getByRole('button', { name: 'Add HDRI 360' }).tap();
	const sheet = page.getByRole('dialog', { name: 'HDRI 360' });
	const name = sheet.getByRole('textbox', { name: 'File or folder' });
	await expect(name).toHaveValue('');
	await name.fill('HDRI_0412');
	await name.press('Enter');
	await expect(sheet).toBeHidden();
	await expect(references(page).getByRole('button', { name: /^HDRI_0412\b/ })).toContainText('HDRI 360');

	// The next one is two taps: the kind, then Add on the name it suggests.
	await page.getByRole('button', { name: 'Add HDRI 360' }).tap();
	await expect(name).toHaveValue('HDRI_0413');
	await sheet.getByRole('button', { name: 'Add' }).tap();
	await expect(sheet).toBeHidden();
	await expect(references(page).getByRole('button', { name: /^HDRI_0413\b/ })).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Reference HDRI_0413 added' })).toBeVisible();

	// Wrap counts the day's references by kind.
	await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Wrap' }).tap();
	await expect(page.getByRole('heading', { name: 'Wrap', level: 1 })).toBeVisible();
	const wrap = page.getByRole('list').filter({ has: page.getByText('HDRI 360', { exact: true }) });
	await expect(wrap.getByText('2', { exact: true })).toBeVisible();

	// The day report lists them under their slate.
	await page.getByRole('link', { name: /^Day Report/ }).tap();
	await expect(page).toHaveURL(/\/wrap\/report\?days=/);
	await expect(page.getByText('HDRI 360: HDRI_0412', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('HDRI 360: HDRI_0413', { exact: true }).first()).toBeVisible();
});

test('a kind the project adds in Settings is one to log; a reference is edited, deleted and brought back', async ({ page }) => {
	await openApp(page, '/settings');
	await page.getByRole('button', { name: /^Reference kinds/ }).tap();
	const kinds = page.getByRole('dialog', { name: 'Reference Kinds' });
	await kinds.getByRole('textbox', { name: 'New kind' }).fill('Drone survey');
	await kinds.getByRole('button', { name: 'Add' }).tap();
	await expect(kinds.getByText('Drone survey', { exact: true })).toBeVisible();
	await kinds.getByRole('textbox', { name: 'New kind' }).fill('lidar scan');
	await kinds.getByRole('button', { name: 'Add' }).tap();
	await expect(kinds.getByText('That kind is already there.')).toBeVisible();
	await kinds.getByRole('button', { name: 'Done' }).tap();

	await open42A(page);
	await page.getByRole('button', { name: 'Add Drone survey' }).tap();
	const sheet = page.getByRole('dialog', { name: 'Drone survey' });
	await sheet.getByRole('textbox', { name: 'File or folder' }).fill('Flight 1');
	await sheet.getByRole('button', { name: 'Add' }).tap();
	await expect(sheet).toBeHidden();

	// Edited: the device shows under the name.
	await references(page).getByRole('button', { name: /^Flight 1\b/ }).tap();
	const detail = page.getByRole('dialog', { name: 'Flight 1' });
	await detail.getByRole('textbox', { name: 'Device' }).fill('DJI Mavic 3');
	await detail.getByRole('textbox', { name: 'Device' }).press('Enter');
	await expect(detail.getByRole('combobox', { name: 'Kind' })).toHaveValue('Drone survey');
	await detail.getByRole('button', { name: 'Done' }).tap();
	await expect(references(page).getByText('Drone survey · DJI Mavic 3')).toBeVisible();

	// Deleted, and Undo brings it back.
	await references(page).getByRole('button', { name: /^Flight 1\b/ }).tap();
	await detail.getByRole('button', { name: 'Delete Reference' }).tap();
	await expect(references(page).getByText('None yet.')).toBeVisible();
	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(references(page).getByRole('button', { name: /^Flight 1\b/ })).toBeVisible();
});

test('a lidar scan turns the slate switch on; deleting the last one offers Turn Off', async ({ page }) => {
	// 42B has no lidar scan yet.
	await openSlate(page, '42B');
	const lidar = page.getByRole('switch', { name: 'Lidar scan' });
	await expect(lidar).not.toBeChecked();

	await page.getByRole('button', { name: 'Add Lidar scan' }).tap();
	const sheet = page.getByRole('dialog', { name: 'Lidar scan' });
	await sheet.getByRole('textbox', { name: 'File or folder' }).fill('Scan 01');
	await sheet.getByRole('button', { name: 'Add' }).tap();
	await expect(notice(page, 'Reference Scan 01 added. Slate 42B: Lidar scan on')).toBeVisible();
	await expect(lidar).toBeChecked();

	// The switch stays editable, and the app never turns it off by itself.
	await references(page).getByRole('button', { name: /^Scan 01\b/ }).tap();
	await page.getByRole('dialog', { name: 'Scan 01' }).getByRole('button', { name: 'Delete Reference' }).tap();
	const offer = notice(page, 'Slate 42B: Lidar scan stays on');
	await expect(offer).toBeVisible();
	await expect(lidar).toBeChecked();
	await offer.getByRole('button', { name: 'Turn Off' }).tap();
	await expect(notice(page, 'Slate 42B: Lidar scan turned off')).toBeVisible();
	await expect(lidar).not.toBeChecked();
});

// #107: 42A and 42B share the street's lighting setup in the sample.
test('an HDRI shows on every slate of its lighting setup, edited from any of them; a lidar scan stays on its slate', async ({ page }) => {
	await open42A(page);
	for (const [kind, name] of [
		['HDRI 360', 'HDRI_0412'],
		['Lidar scan', 'Scan 01']
	]) {
		await page.getByRole('button', { name: `Add ${kind}` }).tap();
		const sheet = page.getByRole('dialog', { name: kind });
		await sheet.getByRole('textbox', { name: 'File or folder' }).fill(name);
		await sheet.getByRole('button', { name: 'Add' }).tap();
		await expect(sheet).toBeHidden();
	}

	await openSlate(page, '42B');
	const hdri = references(page).getByRole('button', { name: /^HDRI_0412\b/ });
	await expect(hdri).toContainText('HDRI 360 · Logged on 42A');
	await expect(references(page).getByRole('button', { name: /^Scan 01\b/ })).toHaveCount(0);

	// One reference: edited from 42B, it reads the same on 42A.
	await hdri.tap();
	const detail = page.getByRole('dialog', { name: 'HDRI_0412' });
	await detail.getByRole('textbox', { name: 'Device' }).fill('Ricoh Theta Z1');
	await detail.getByRole('textbox', { name: 'Device' }).press('Enter');
	await detail.getByRole('button', { name: 'Done' }).tap();
	await expect(references(page).getByText('HDRI 360 · Ricoh Theta Z1')).toBeVisible();
	await open42A(page);
	await expect(references(page).getByText('HDRI 360 · Ricoh Theta Z1', { exact: true })).toBeVisible();
});

test('deleting the slate an HDRI was logged on moves it to another slate of the lighting setup, and Undo puts it back', async ({ page }) => {
	await open42A(page);
	await page.getByRole('button', { name: 'Add HDRI 360' }).tap();
	const sheet = page.getByRole('dialog', { name: 'HDRI 360' });
	await sheet.getByRole('textbox', { name: 'File or folder' }).fill('HDRI_0412');
	await sheet.getByRole('button', { name: 'Add' }).tap();
	await expect(sheet).toBeHidden();

	await page.getByRole('button', { name: 'Delete Slate' }).tap();
	await expect(page).toHaveURL(/\/slates$/);
	await expect(notice(page, 'Slate 42A deleted')).toBeVisible();
	await page.getByRole('link', { name: /^42B/ }).tap();
	await expect(page.getByRole('heading', { name: 'Slate 42B', level: 1 })).toBeVisible();
	// Now logged on 42B: nothing says another slate.
	const hdri = references(page).getByRole('button', { name: /^HDRI_0412\b/ });
	await expect(hdri).toContainText('HDRI 360');
	await expect(hdri).not.toContainText('Logged on');

	await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
	await expect(hdri).toContainText('HDRI 360 · Logged on 42A');
});
