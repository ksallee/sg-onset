// Settings: every setting applies at once, shows on <html>, and is there after a reload; the
// project, storage in plain words, the backup and its restore; every control at least 44 px.
import type { Page, TestInfo } from '@playwright/test';
import { auditLayout } from './audit';
import { expect, openApp, test } from './fixtures';

const root = (page: Page) => page.locator('html');
const radio = (page: Page, group: string, name: string) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name, exact: true });
/**
 * Playwright's WebKit runs like a private window: it refuses a Blob in IndexedDB ("Error preparing
 * Blob/File data to be stored in object store"), and a snapshot's bytes are one. So snapshots are
 * taken on the Chromium target only; on the WebKit targets the app's answer to that refusal is
 * what is tested. On a real iPad outside Private Browsing a snapshot is taken.
 */
const canSnapshot = (testInfo: TestInfo) => !testInfo.project.name.startsWith('ipad');
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sg-onset.settings') ?? '{}'));

test.describe('settings', () => {
	test('the holding hand applies, moves the on-set column under it, and lasts', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(root(page)).toHaveAttribute('data-hand', 'right');
		const group = page.getByRole('radiogroup', { name: 'Holding hand' });
		const wide = page.viewportSize()!.width >= 1100;
		const side = async () => ((await group.boundingBox())!.x > page.viewportSize()!.width / 2 ? 'right' : 'left');
		if (wide) expect(await side()).toBe('right');
		await expect(page.getByRole('img', { name: 'Capture buttons on the right edge, sections on the left.' })).toBeVisible();

		await radio(page, 'Holding hand', 'Left').tap();
		await expect(root(page)).toHaveAttribute('data-hand', 'left');
		await expect(page.getByRole('img', { name: 'Capture buttons on the left edge, sections on the right.' })).toBeVisible();
		if (wide) expect(await side()).toBe('left');

		await page.reload();
		await expect(root(page)).toHaveAttribute('data-hand', 'left');
		await expect(radio(page, 'Holding hand', 'Left')).toBeChecked();
	});

	test('About shows the version with its build day and the early prototype notice, always', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(page.getByText(/^\d+\.\d+\.\d+ · /)).toBeVisible();
		const notice = page.getByRole('region', { name: 'Early prototype' });
		await expect(notice).toBeVisible();
		await expect(notice.getByRole('button')).toHaveCount(0);
	});

	test('the button size applies, grows the targets, and lasts', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(root(page)).toHaveAttribute('data-button-size', 'standard');
		await expect(page.getByText('Large suits gloves.')).toBeVisible();
		await radio(page, 'Button size', 'Large').tap();
		await expect(root(page)).toHaveAttribute('data-button-size', 'large');
		expect(await root(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--touch').trim())).toBe('56px');
		expect((await radio(page, 'Button size', 'Large').boundingBox())!.height).toBeGreaterThanOrEqual(56);

		await page.reload();
		await expect(root(page)).toHaveAttribute('data-button-size', 'large');
		await expect(radio(page, 'Button size', 'Large')).toBeChecked();
	});

	test('the appearance applies and lasts', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(root(page)).toHaveAttribute('data-theme', 'light');
		await radio(page, 'Appearance', 'Dark').tap();
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await page.reload();
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await expect(radio(page, 'Appearance', 'Dark')).toBeChecked();
		await radio(page, 'Appearance', 'Light').tap();
		await expect(root(page)).toHaveAttribute('data-theme', 'light');
		await radio(page, 'Appearance', 'System').tap();
		// The suite's device asks for light.
		await expect(root(page)).toHaveAttribute('data-theme', 'light');
	});

	test('red night mode says why, applies, wins over the appearance, and lasts', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(page.getByText('Red on black: no white light on a dark set.')).toBeVisible();
		await page.getByRole('switch', { name: 'Red night mode' }).tap();
		await expect(root(page)).toHaveAttribute('data-night', 'true');
		await expect(root(page)).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByText('Red night mode is on. This applies once it is off.')).toBeVisible();
		await page.reload();
		await expect(root(page)).toHaveAttribute('data-night', 'true');
		await expect(page.getByRole('switch', { name: 'Red night mode' })).toBeChecked();
		await page.getByRole('switch', { name: 'Red night mode' }).tap();
		await expect(root(page)).not.toHaveAttribute('data-night', 'true');
		await expect(root(page)).toHaveAttribute('data-theme', 'light');
	});

	test('motion applies and lasts', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(root(page)).toHaveAttribute('data-motion', 'full');
		await radio(page, 'Motion', 'Reduced').tap();
		await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
		await page.reload();
		await expect(root(page)).toHaveAttribute('data-motion', 'reduced');
		await expect(radio(page, 'Motion', 'Reduced')).toBeChecked();
		await radio(page, 'Motion', 'Full').tap();
		await expect(root(page)).toHaveAttribute('data-motion', 'full');
	});

	test('lengths apply and last', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(radio(page, 'Lengths', 'Metres')).toBeChecked();
		await radio(page, 'Lengths', 'Feet and inches').tap();
		expect((await stored(page)).units).toBe('imperial');
		await page.reload();
		await expect(radio(page, 'Lengths', 'Feet and inches')).toBeChecked();
		expect((await stored(page)).units).toBe('imperial');
	});

	test('there is no save button, and a choice moves with the arrow keys', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
		await radio(page, 'Motion', 'System').focus();
		await page.keyboard.press('ArrowRight');
		await expect(root(page)).toHaveAttribute('data-motion', 'full');
		await expect(radio(page, 'Motion', 'Full')).toBeFocused();
	});

	for (const size of ['Standard', 'Large']) {
		test(`every control is named and at least 44 px at the ${size} button size, with no sideways scroll`, async ({ page }) => {
			await openApp(page, '/settings');
			await radio(page, 'Button size', size).tap();
			await expect(page.getByText('Protected from cleanup')).toBeVisible();
			const audit = await auditLayout(page, test.info(), `/settings (${size})`);
			expect(audit.small).toEqual([]);
			expect(audit.unnamed).toEqual([]);
		});
	}
});

test.describe('settings: project', () => {
	test('shows the project and the shoot day, renames in place with an undo, and opens the picker', async ({ page }) => {
		await openApp(page, '/settings');
		const name = page.getByRole('textbox', { name: 'Name' });
		await expect(name).toHaveValue('Sample project');
		await expect(page.getByText(/^Day 2 · /)).toBeVisible();

		await name.fill('Sample, renamed 夜 🎬');
		await name.blur();
		await expect(page.getByRole('status').filter({ hasText: 'Name changed' })).toBeVisible();
		await page.reload();
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sample, renamed 夜 🎬');

		await page.getByRole('textbox', { name: 'Name' }).fill('');
		await page.getByRole('textbox', { name: 'Name' }).blur();
		await expect(page.getByRole('alert')).toHaveText('A project needs a name.');
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sample, renamed 夜 🎬');

		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await expect(page.getByRole('dialog', { name: 'Project and shoot day' })).toBeVisible();
	});

	test('the sample is deleted with an undo when another project stays', async ({ page }) => {
		await openApp(page, '/settings');
		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await page.getByRole('button', { name: 'New project' }).tap();
		// The welcome page first: Settings has a Name field of its own.
		await expect(page.getByRole('heading', { name: 'New project', level: 1 })).toBeVisible();
		await page.getByRole('textbox', { name: 'Name' }).fill('The Long Night');
		await page.getByRole('button', { name: 'Create Project', exact: true }).tap();
		await expect(page).toHaveURL(/\/slates$/);

		await page.goto('/settings');
		await page.getByRole('button', { name: 'Delete the Sample Project' }).dblclick();
		await expect(page.getByRole('button', { name: 'Delete the Sample Project' })).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('The Long Night');
		await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
		await page.getByRole('button', { name: 'Switch Project or Shoot Day' }).tap();
		await expect(page.getByRole('dialog').getByRole('button', { name: 'Sample project' })).toHaveCount(1);
	});

	test('Flow PT links to sign-in and to the sync detail', async ({ page }) => {
		await openApp(page, '/settings');
		await page.getByRole('button', { name: /^Sync/ }).last().tap();
		await expect(page.getByRole('dialog', { name: 'Sync' })).toBeVisible();
		await page.getByRole('button', { name: 'Done' }).tap();
		await page.getByRole('link', { name: /^Sign In/ }).first().tap();
		await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
	});
});

test.describe('settings: storage', () => {
	test('says in plain words whether the data is protected, and what to do', async ({ page }, testInfo) => {
		await openApp(page, '/settings');
		await expect(page.getByText('Protected from cleanup')).toBeVisible();
		await expect(page.getByText('Not promised')).toHaveCount(0);
		if (testInfo.project.name.startsWith('ipad')) {
			await expect(page.getByText('Safari may clear SG OnSet’s data if you don’t open it for 7 days. Add it to the Home Screen to protect it.')).toBeVisible();
			await expect(page.getByText('Tap Share in the Safari toolbar.')).toBeVisible();
		} else {
			await expect(page.getByText(/This browser (may clear SG OnSet’s data if the device runs low on space|will not clear)/)).toBeVisible();
		}
		await expect(page.getByText('Used', { exact: true })).toBeVisible();
		await expect(page.getByText('Free', { exact: true })).toBeVisible();
	});

	test('with no storage API it says it cannot tell', async ({ page }) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }));
		await openApp(page, '/settings');
		await expect(page.getByText('Unknown', { exact: true })).toBeVisible();
		await expect(page.getByText('This browser does not say whether it protects data. Export a backup each day.')).toBeVisible();
		await expect(page.getByText('Not reported by this browser')).toHaveCount(2);
		// The backup works without it.
		await page.getByRole('button', { name: 'Export Backup' }).tap();
		await expect(page.getByRole('button', { name: /Share or Save/ })).toBeVisible();
	});

	test('with no estimate it shows no numbers and no NaN', async ({ page }) => {
		await page.addInitScript(() => {
			// On the prototype: WebKit drops a property set on `navigator.storage` itself when it
			// collects that wrapper, and the real estimate comes back.
			if (globalThis.StorageManager) StorageManager.prototype.estimate = () => Promise.reject(new Error('no estimate'));
		});
		await openApp(page, '/settings');
		await expect(page.getByText('Not reported by this browser')).toHaveCount(2);
		await expect(page.getByText(/NaN|undefined/)).toHaveCount(0);
	});

	test('on the Home Screen it says so and offers to ask', async ({ page }) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
		await openApp(page, '/settings');
		await expect(page.getByText(/On the Home Screen|^Yes$/).first()).toBeVisible();
		await expect(page.getByText('Tap Share in the Safari toolbar.')).toHaveCount(0);
		await expect(page.getByText('Installed', { exact: true })).toBeVisible();
	});
});

test.describe('settings: backup', () => {
	async function exportTo(page: Page, path: string) {
		await page.getByRole('button', { name: 'Export Backup' }).dblclick();
		const share = page.getByRole('button', { name: /Share or Save/ });
		await expect(share).toBeVisible();
		const download = page.waitForEvent('download');
		await share.tap();
		await (await download).saveAs(path);
	}
	const pick = (page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) => page.locator('input[type="file"]').setInputFiles(file);

	test('says when the last backup left, exports a zip, and restores it after a plain warning', async ({ page }, testInfo) => {
		// The download has no share sheet to go through here.
		await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
		await openApp(page, '/settings');
		const section = page.locator('section').filter({ hasText: 'Last backup' });
		await expect(section.getByText('Never')).toBeVisible();

		const file = testInfo.outputPath('backup.zip');
		await exportTo(page, file);
		await expect(section.getByText('Just now')).toBeVisible();
		// The exported zip counts as a copy off this device.
		await expect(page.getByText(/^Backup, (Just now|\d+ min ago)$/)).toBeVisible();

		// Change something, then restore: the warning first, and Cancel changes nothing.
		const name = page.getByRole('textbox', { name: 'Name' });
		await name.fill('Changed after the backup');
		await name.blur();
		await expect(page.getByRole('status').filter({ hasText: 'Name changed' })).toBeVisible();

		await pick(page, file);
		await expect(page.getByText('Replace everything on this device?')).toBeVisible();
		await expect(page.getByText(/The backup takes the place of every project, slate, take and photo on this device\./)).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).last().tap();
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Changed after the backup');

		await pick(page, file);
		await page.getByRole('button', { name: 'Replace Everything' }).tap();
		if (!canSnapshot(testInfo)) {
			// No snapshot could be taken first: said, asked once more, and nothing replaced until then.
			await expect(page.getByText('No snapshot could be taken')).toBeVisible();
			await expect(page.getByText(/replacing it cannot be undone\. Nothing has been replaced yet\./)).toBeVisible();
			await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Changed after the backup');
			await page.getByRole('button', { name: 'Replace Without a Snapshot' }).tap();
		}
		await expect(page.getByText(/^Restored \d+ entries and 0 files\.$/)).toBeVisible({ timeout: 15_000 });
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sample project');

		if (!canSnapshot(testInfo)) return;
		// A snapshot was taken before the replace: restoring it undoes the restore.
		const before = page.getByRole('button', { name: /Before a backup restore/ }).first();
		await expect(before).toBeVisible();
		await before.tap();
		const sheet = page.getByRole('dialog', { name: 'Restore Snapshot' });
		await expect(sheet.getByText('1 changed')).toBeVisible();
		await sheet.getByRole('button', { name: 'Restore This Snapshot' }).tap();
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Changed after the backup', { timeout: 15_000 });
	});

	test('a file that is not a backup, a cut-off one and an empty one are refused in words, and nothing is replaced', async ({ page }, testInfo) => {
		await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
		await openApp(page, '/settings');

		await pick(page, { name: 'holiday.zip', mimeType: 'application/zip', buffer: Buffer.from('this is not a zip at all') });
		await expect(page.getByRole('alert')).toHaveText('That file is not an SG OnSet backup.');

		await pick(page, { name: 'empty.zip', mimeType: 'application/zip', buffer: Buffer.alloc(0) });
		await expect(page.getByRole('alert')).toHaveText('That file is not an SG OnSet backup.');

		const file = testInfo.outputPath('backup.zip');
		await exportTo(page, file);
		const { readFileSync } = await import('node:fs');
		const whole = readFileSync(file);
		await pick(page, { name: 'cut.zip', mimeType: 'application/zip', buffer: whole.subarray(0, Math.floor(whole.length / 2)) });
		await expect(page.getByRole('alert')).toHaveText(/That (file is not an SG OnSet backup|backup is (damaged|incomplete)\. Nothing was restored)\./);

		// One flipped byte in the middle: the checksum catches it.
		const bent = Buffer.from(whole);
		bent[Math.floor(bent.length / 3)] ^= 0xff;
		await pick(page, { name: 'bent.zip', mimeType: 'application/zip', buffer: bent });
		await expect(page.getByRole('alert')).toHaveText(/That (file is not an SG OnSet backup|backup is (damaged|incomplete)\. Nothing was restored)\./);

		await expect(page.getByText('Replace everything on this device?')).toHaveCount(0);
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sample project');
	});
});

test.describe('settings: data safety and snapshots', () => {
	const name = (page: Page) => page.getByRole('textbox', { name: 'Name' });
	const sheet = (page: Page) => page.getByRole('dialog', { name: 'Restore Snapshot' });

	test('says how safe the data is, in words, and what snapshots do not protect against', async ({ page }) => {
		await openApp(page, '/settings');
		await expect(page.getByText(/^(Nothing to do|Copy your data off this device (soon|now))$/)).toBeVisible();
		await expect(page.getByText('Only on this device', { exact: true })).toBeVisible();
		await expect(page.getByText(/^\d+ entries$/).first()).toBeVisible();
		await expect(page.getByText('Last copy off this device')).toBeVisible();
		await expect(page.getByText('Last snapshot', { exact: true })).toBeVisible();
		await expect(
			page.getByText('They do not survive the browser clearing its storage, deleting the Home Screen app, or a lost device. Only a sync to Flow PT or an exported backup does.', { exact: false })
		).toHaveCount(1);
	});

	test('take a snapshot, change data, restore it after a preview, see the old data, undo the restore', async ({ page }, testInfo) => {
		test.skip(!canSnapshot(testInfo), 'Playwright WebKit cannot store a snapshot (a Blob in IndexedDB)');
		await openApp(page, '/settings');
		await page.getByRole('button', { name: 'Take a Snapshot Now' }).dblclick();
		const taken = page.getByRole('button', { name: /Taken by hand/ });
		await expect(taken).toHaveCount(1);
		await expect(taken).toContainText(/Today \d\d:\d\d/);
		await expect(taken).toContainText(/\d+ entries · [\d.]+ (B|KB|MB)/);

		await name(page).fill('Changed after the snapshot');
		await name(page).blur();
		await expect(page.getByRole('status').filter({ hasText: 'Name changed' })).toBeVisible();

		// The preview: what would change, per kind of entry, and what will sync.
		await taken.tap();
		await expect(sheet(page).getByText('Project', { exact: true })).toBeVisible();
		await expect(sheet(page).getByText('1 changed')).toBeVisible();
		await expect(sheet(page).getByText(/(\d+ changes?|Nothing) will sync to Flow PT\./)).toBeVisible();
		await expect(sheet(page).getByText('A snapshot of what is here now is taken first. Restore that one to undo.', { exact: false })).toBeVisible();
		const audit = await auditLayout(page, test.info(), '/settings (restore snapshot)');
		expect(audit.small).toEqual([]);
		expect(audit.unnamed).toEqual([]);

		// Cancel changes nothing.
		await sheet(page).getByRole('button', { name: 'Cancel' }).tap();
		await expect(name(page)).toHaveValue('Changed after the snapshot');

		await taken.tap();
		await sheet(page).getByRole('button', { name: 'Restore This Snapshot' }).dblclick();
		await expect(page.getByText('Snapshot restored. To undo, restore the one marked Before a restore.')).toBeVisible({ timeout: 15_000 });
		await expect(name(page)).toHaveValue('Sample project');

		// The snapshot taken before the restore is at the top: restoring it undoes the restore.
		const rows = page.locator('section').filter({ hasText: 'Take a Snapshot Now' }).getByRole('button');
		await expect(rows.nth(1)).toContainText('Before a restore');
		await rows.nth(1).tap();
		await expect(sheet(page).getByText('1 changed')).toBeVisible();
		await sheet(page).getByRole('button', { name: 'Restore This Snapshot' }).tap();
		await expect(name(page)).toHaveValue('Changed after the snapshot', { timeout: 15_000 });
	});

	test('a snapshot that cannot be taken is said, not hidden', async ({ page }, testInfo) => {
		test.skip(canSnapshot(testInfo), 'only where the browser refuses a Blob in IndexedDB');
		await openApp(page, '/settings');
		await page.getByRole('button', { name: 'Take a Snapshot Now' }).tap();
		await expect(page.getByRole('alert')).toHaveText('The snapshot could not be taken. Try again.');
		await expect(page.getByText('No snapshot yet. One is taken a few minutes after a change.')).toBeVisible();
	});

	test('a snapshot that holds what is here says there is nothing to restore', async ({ page }, testInfo) => {
		test.skip(!canSnapshot(testInfo), 'Playwright WebKit cannot store a snapshot (a Blob in IndexedDB)');
		await openApp(page, '/settings');
		await page.getByRole('button', { name: 'Take a Snapshot Now' }).tap();
		await page.getByRole('button', { name: /Taken by hand/ }).tap();
		await expect(sheet(page).getByText('This snapshot holds what is on this device now. There is nothing to restore.')).toBeVisible();
		await expect(sheet(page).getByRole('button', { name: 'Restore This Snapshot' })).toHaveCount(0);
	});
});
