// The layout audit, for any page in any suite: `await auditLayout(page, testInfo)`.
//
// Hard fail: the page scrolls sideways, or an element is wider than the viewport with nothing
// around it to clip or scroll it. Soft, reported only (for now): buttons and links with no
// accessible name, and those with a hit area under 44×44 CSS px. The findings are attached to
// the test as `layout-audit.json`, and `pnpm qa` lists them in its report.
import { expect, type Page, type TestInfo } from '@playwright/test';

export const MIN_TARGET = 44;

export interface Offender {
	/** A short description: tag, role, name or text, and a few classes for finding it. */
	what: string;
	width: number;
	height: number;
}

export interface LayoutAudit {
	url: string;
	viewport: { width: number; height: number };
	/** Visible buttons and links checked. */
	controls: number;
	/** How far the document scrolls sideways, in px. 0 is right. */
	overflowX: number;
	/** Elements wider than the viewport, not inside a clipping or scrolling box. */
	wide: Offender[];
	/** Buttons and links with no accessible name. */
	unnamed: Offender[];
	/** Buttons and links under MIN_TARGET in either side. */
	small: Offender[];
}

/** Runs in the page: no imports, no closures. */
function measure(min: number): Omit<LayoutAudit, 'url'> {
	const vw = document.documentElement.clientWidth;
	const vh = document.documentElement.clientHeight;
	const visible = (el: Element) => {
		const s = getComputedStyle(el);
		if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
		if (el.closest('[aria-hidden="true"], [inert]')) return false;
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	};
	const describe = (el: Element) => {
		const role = el.getAttribute('role');
		const name = (el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
		const cls = [...el.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 3).join('.');
		return `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ''}${cls ? `.${cls}` : ''}${name ? ` "${name}"` : ''}`;
	};
	const box = (el: Element) => {
		const r = el.getBoundingClientRect();
		return { what: describe(el), width: Math.round(r.width), height: Math.round(r.height) };
	};
	const clipped = (el: Element) => {
		for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
			const ox = getComputedStyle(p).overflowX;
			if (ox !== 'visible') return true;
		}
		return false;
	};
	const accessibleName = (el: Element) => {
		const label = el.getAttribute('aria-label')?.trim();
		if (label) return label;
		const by = el.getAttribute('aria-labelledby');
		if (by) {
			const text = by
				.split(/\s+/)
				.map((id) => document.getElementById(id)?.textContent ?? '')
				.join(' ')
				.trim();
			if (text) return text;
		}
		const text = (el.textContent ?? '').trim();
		if (text) return text;
		const img = el.querySelector('img[alt]:not([alt=""]), svg[aria-label], [role="img"][aria-label]');
		if (img) return img.getAttribute('alt') ?? img.getAttribute('aria-label') ?? '';
		return el.getAttribute('title')?.trim() ?? '';
	};

	const all = [...document.body.querySelectorAll('*')].filter(visible);
	const wide = all.filter((el) => el.getBoundingClientRect().width > vw + 1 && !clipped(el)).map(box);
	const controls = all.filter((el) => el.matches('button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"]'));
	const unnamed = controls.filter((el) => !accessibleName(el)).map(box);
	const small = controls
		.filter((el) => {
			const r = el.getBoundingClientRect();
			return r.width < min - 0.5 || r.height < min - 0.5;
		})
		.map(box);
	return {
		viewport: { width: vw, height: vh },
		controls: controls.length,
		overflowX: Math.max(0, document.documentElement.scrollWidth - vw),
		wide,
		unnamed,
		small
	};
}

/** Audit the page as it is now. Fails the test on sideways overflow only; reports the rest. */
export async function auditLayout(page: Page, testInfo: TestInfo, label = new URL(page.url()).pathname): Promise<LayoutAudit> {
	const audit: LayoutAudit = { url: page.url(), ...(await page.evaluate(measure, MIN_TARGET)) };
	await testInfo.attach('layout-audit.json', { body: JSON.stringify({ label, ...audit }, null, 1), contentType: 'application/json' });
	for (const [kind, list] of [
		['unnamed', audit.unnamed],
		['small', audit.small]
	] as const) {
		if (list.length) {
			testInfo.annotations.push({ type: `audit-${kind}`, description: `${label}: ${list.map((o) => `${o.what} ${o.width}×${o.height}`).join('; ')}` });
		}
	}
	expect(audit.overflowX, `${label} scrolls sideways`).toBe(0);
	expect(audit.wide, `${label} has elements wider than the viewport`).toEqual([]);
	return audit;
}
