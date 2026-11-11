// Automatic snapshots, wired (#54): a delete of a whole tree leaves a snapshot to restore, and the
// shell says when entries have been only on this device too long. The time is the browser's
// (Playwright's clock); the snapshots are read from the page's IndexedDB, as the store wrote them.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './fixtures';

type Row = { reason: string; kind: string; counts: Record<string, number>; checkedAt?: number; bad?: true; size: number };

/** The snapshots table of the app's database, newest first. */
function snapshots(page: Page): Promise<Row[]> {
	return page.evaluate(
		() =>
			new Promise<Row[]>((resolve, reject) => {
				const req = indexedDB.open('sg-onset');
				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					const db = req.result;
					const get = db.transaction('snapshots').objectStore('snapshots').getAll();
					get.onsuccess = () => {
						db.close();
						resolve((get.result as (Row & { at: number })[]).sort((a, b) => b.at - a.at));
					};
					get.onerror = () => reject(get.error);
				};
			})
	);
}

test('deleting the sample project leaves a checked snapshot of it to restore', async ({ page }) => {
	await openApp(page, '/settings');
	await page.getByRole('button', { name: 'Delete the Sample Project' }).tap();
	await page.getByRole('button', { name: 'Delete', exact: true }).tap();
	await page.waitForURL(/\/welcome$/);
	await expect.poll(async () => (await snapshots(page)).find((s) => s.reason === 'deleteProject')).toBeTruthy();
	const snap = (await snapshots(page)).find((s) => s.reason === 'deleteProject')!;
	expect(snap.kind).toBe('risky');
	// Read back and checked once written, and it holds the project with its days, slates and takes.
	expect(snap.bad).toBeUndefined();
	expect(snap.checkedAt).toBeGreaterThan(0);
	expect(snap.counts.project).toBe(1);
	expect(snap.counts.shootDay).toBeGreaterThan(0);
	expect(snap.counts.take).toBeGreaterThan(0);
});

test('the safety line: nothing at first, a quiet line after four hours, a warning after a day, never over Shoot', async ({ page }, info) => {
	const device = info.project.name.startsWith('ipad') ? 'iPad' : 'device';
	await page.clock.install({ time: new Date('2026-11-11T08:00:00') });
	await openApp(page, '/slates');
	const line = page.getByRole('status').filter({ hasText: `only on this ${device}` });
	await expect(line).toHaveCount(0);

	// The sample's entries have waited five hours: a quiet line, which can be hidden.
	await page.clock.fastForward('05:00:00');
	await expect(line).toBeVisible();
	await expect(line).toContainText(new RegExp(`\\d+ entries only on this ${device}, for 5\\sh\\. Sync or export a backup\\.`));
	await expect(line.getByRole('button', { name: 'Hide' })).toBeVisible();
	await expect(line.getByRole('link', { name: 'Go to Backup' })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath('remind.png') });

	// A day: the warning. It cannot be hidden; it leads to the backup.
	await page.clock.fastForward('20:00:00');
	await expect(line).toContainText(/for 1\sd\./);
	await expect(line.getByRole('link', { name: 'Go to Backup' })).toHaveAttribute('href', '/settings#backup');
	await expect(line.getByRole('button', { name: 'Hide' })).toHaveCount(0);
	await page.screenshot({ path: info.outputPath('warn.png') });

	// Shoot keeps its room: no line over the page, the sync status says it.
	await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Shoot' }).tap();
	await page.waitForURL(/\/shoot$/);
	await expect(line).toHaveCount(0);
	await expect(page.getByRole('button', { name: new RegExp(`only on this ${device}, for 1\\sd`) })).toBeVisible();
});
