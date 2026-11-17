// Audio notes (#89) on stored data, slate 42A of the sample: made from the take sheet with the
// microphone, kept on the take, played back there, taken off and put back, and in the wrap
// package. Chromium hears its fake microphone (a tone); Playwright's WebKit has none, and its
// session refuses stored Blobs, so the recording is checked on Chromium only. A refused microphone
// is checked everywhere.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { entryBlob, readZip } from '../src/lib/store/zipRead';
import { expect, openApp, test } from './fixtures';

// Chromium's fake microphone, granted with no prompt. Launch options are per worker: top level.
test.use({
	launchOptions: [
		async ({ browserName }, use) => use(browserName === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {}),
		{ scope: 'worker' }
	]
});

const rail = (page: Page) => page.getByRole('toolbar', { name: 'Capture' });
const notice = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'Take 3' });

/** Shoot on slate 42A of the sample, whatever was picked before. */
async function openShoot(page: Page) {
	await openApp(page, '/shoot');
	const pick = page.getByRole('button', { name: /^Slate 42A(?!,)\b/ });
	const change = page.getByRole('button', { name: /^Change Slate/ });
	await expect(pick.or(change).first()).toBeVisible();
	if (await change.count()) {
		if ((await change.getAttribute('aria-label'))?.endsWith(' 42A')) return;
		await change.tap();
	}
	await pick.tap();
	await expect(rail(page)).toBeVisible();
}

/** The take sheet of take 3. */
async function openSheet(page: Page) {
	await page.getByRole('button', { name: /^(Add Note|Note:)/ }).first().tap();
	await expect(sheetOf(page)).toBeVisible();
	return sheetOf(page);
}

test.describe('audio notes', () => {
	test('one is made from the microphone, played back in the take sheet, kept on the take, and taken off with Undo', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'no fake microphone in Playwright WebKit, and its session refuses stored Blobs');
		await openShoot(page);
		const sheet = await openSheet(page);
		await sheet.getByRole('button', { name: 'Record Audio Note' }).tap();
		// The row says Save at once, and the time it has run.
		const save = sheet.getByRole('button', { name: /^Save Audio Note/ });
		await expect(save).toBeVisible();
		await expect(save).toContainText('0:01', { timeout: 8_000 });
		await save.tap();
		await expect(sheet.getByRole('button', { name: 'Record Audio Note' })).toBeVisible();

		const note = sheet.getByRole('listitem').filter({ hasText: 'Audio note 1' });
		await expect(note).toBeVisible();
		// It plays here, then stops by itself at its end.
		await note.getByRole('button', { name: 'Play audio note 1' }).tap();
		await expect(note.getByRole('button', { name: 'Pause audio note 1' })).toBeVisible();
		await expect(note.getByRole('button', { name: 'Play audio note 1' })).toBeVisible({ timeout: 6_000 });

		await sheet.getByRole('button', { name: 'Done' }).tap();
		await expect(notice(page, 'Audio note added to take 3')).toBeVisible();
		// Not a photo: the strip and the rail's count leave it out.
		await expect(page.getByRole('region', { name: 'Photos and videos' }).getByText('No photos or videos on this take.')).toBeVisible();
		await expect(rail(page).getByRole('button', { name: 'Photo' })).not.toContainText(/\d/);

		// Kept on the device as a photo is, its file as the browser wrote it.
		await page.reload();
		await expect(rail(page)).toBeVisible();
		const again = await openSheet(page);
		const kept = again.getByRole('listitem').filter({ hasText: 'Audio note 1' });
		await expect(kept).toBeVisible();
		const type = await page.evaluate(async () => {
			const audio = document.querySelector<HTMLAudioElement>('[role="dialog"] audio');
			for (let i = 0; i < 50 && !audio?.src; i++) await new Promise((r) => setTimeout(r, 50));
			return audio?.src ? (await (await fetch(audio.src)).blob()).type : '';
		});
		expect(['audio/mp4', 'audio/webm']).toContain(type);

		await kept.getByRole('button', { name: 'Remove audio note 1' }).tap();
		await expect(kept).toHaveCount(0);
		await again.getByRole('button', { name: 'Done' }).tap();
		await expect(notice(page, 'Audio note removed from take 3')).toBeVisible();
		await rail(page).getByRole('button', { name: 'Undo' }).tap();
		await openSheet(page);
		await expect(sheetOf(page).getByRole('listitem').filter({ hasText: 'Audio note 1' })).toBeVisible();
	});

	test('closing the sheet keeps what was heard', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'no fake microphone in Playwright WebKit, and its session refuses stored Blobs');
		await openShoot(page);
		const sheet = await openSheet(page);
		await sheet.getByRole('button', { name: 'Record Audio Note' }).tap();
		await expect(sheet.getByRole('button', { name: /^Save Audio Note/ })).toContainText('0:01', { timeout: 8_000 });
		await sheet.getByRole('button', { name: 'Done' }).tap();
		await expect(notice(page, 'Audio note added to take 3')).toBeVisible();
		await openSheet(page);
		await expect(sheetOf(page).getByRole('listitem').filter({ hasText: 'Audio note 1' })).toBeVisible();
	});

	test('a refused microphone says how to allow it, and nothing is added', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'mediaDevices', {
				configurable: true,
				value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) }
			});
		});
		await openShoot(page);
		const sheet = await openSheet(page);
		await sheet.getByRole('button', { name: 'Record Audio Note' }).tap();
		await expect(sheet.getByRole('status').filter({ hasText: 'The microphone is not allowed for SG OnSet. Allow it in Settings, then try again.' })).toBeVisible();
		await expect(sheet.getByRole('button', { name: 'Record Audio Note' })).toBeVisible();
		await expect(sheet.getByRole('listitem').filter({ hasText: 'Audio note 1' })).toHaveCount(0);
	});

	// Kevin, 2026-11-17: the switch is for photos and videos; audio notes always go.
	test('lands in the wrap package with the photos and videos left out, in its slate folder, named in the manifest', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'no fake microphone in Playwright WebKit, and its session refuses stored Blobs');
		// No share sheet: the hand-over is a download.
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
			Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
		});
		await openShoot(page);
		const sheet = await openSheet(page);
		await sheet.getByRole('button', { name: 'Record Audio Note' }).tap();
		const save = sheet.getByRole('button', { name: /^Save Audio Note/ });
		await expect(save).toContainText('0:01', { timeout: 8_000 });
		await save.tap();
		await sheet.getByRole('button', { name: 'Done' }).tap();
		await expect(notice(page, 'Audio note added to take 3')).toBeVisible();

		await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Wrap' }).tap();
		await expect(page.getByRole('heading', { name: 'Wrap', level: 1 })).toBeVisible();
		// The day counts it as an audio note, not a photo.
		const day = page.locator('dl[aria-label="The day"]');
		await expect(day.locator('div').filter({ hasText: /^\s*Audio notes\s*1\s*$/ })).toBeVisible();
		await expect(day.locator('div').filter({ hasText: /^\s*Photos\s*0\s*$/ })).toBeVisible();
		await page.getByRole('switch', { name: 'Photos and videos' }).uncheck();
		await page.getByRole('button', { name: 'Make Wrap Package' }).tap();
		const download = page.getByRole('button', { name: 'Download Wrap Package' });
		await expect(download).toBeVisible();
		const [file] = await Promise.all([page.waitForEvent('download'), download.tap()]);
		const zip = new Blob([await readFile((await file.path())!)]);
		const entries = await readZip(zip);
		const root = file.suggestedFilename().replace(/\.zip$/, '');
		const note = entries.find((e) => /\/42A\/42A-[A-Z]-audio-note-1\.(m4a|webm)$/.test(e.name));
		expect(note, entries.map((e) => e.name).join('\n')).toBeDefined();
		expect(note!.size).toBeGreaterThan(0);
		expect(entries.filter((e) => /-reference-\d+/.test(e.name))).toEqual([]);
		const manifest = await (await entryBlob(zip, entries.find((e) => e.name === `${root}/42A/42A_manifest.csv`)!)).text();
		const path = note!.name.slice(root.length + 1);
		expect(manifest.split('\r\n').some((line) => line.startsWith('Audio note,3,') && line.includes(`,${path},`))).toBe(true);
	});
});
