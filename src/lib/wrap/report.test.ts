import { describe, expect, it } from 'vitest';
import { dayReport } from '$lib/export/dayReport';
import { input } from '$lib/export/testData';
import { defaultPaper, escapeHtml, reportBody, reportCss, reportDocument } from './report';

const opts = { units: 'metric' as const, printedAt: new Date(2026, 10, 11, 21, 5) };

describe('escapeHtml', () => {
	it('escapes what HTML reads', () => {
		expect(escapeHtml(`<b a="1">&'</b>`)).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;');
	});
});

describe('defaultPaper', () => {
	it('is Letter in North America, A4 elsewhere', () => {
		expect(defaultPaper('en-US')).toBe('letter');
		expect(defaultPaper('en-CA')).toBe('letter');
		expect(defaultPaper('en-GB')).toBe('a4');
		expect(defaultPaper('fr')).toBe('a4');
		expect(defaultPaper('')).toBe('a4');
	});
});

describe('reportBody', () => {
	const report = dayReport(input(), 'd3')!;
	const html = reportBody([report], opts);

	it('heads the page with project, day, unit, location and wrangler', () => {
		expect(html).toContain('Night Train');
		expect(html).toContain('Day 3');
		expect(html).toContain('Tue 10 Nov 2026');
		expect(html).toContain('Main');
		expect(html).toContain('Stage 4');
		expect(html).toContain('Ana Ruiz');
	});

	it('has a block per slate in order', () => {
		const at = (s: string) => html.indexOf(`data-slate="${s}"`);
		expect(at('9')).toBeGreaterThan(0);
		expect(at('9')).toBeLessThan(at('10'));
		expect(at('10')).toBeLessThan(at('42A'));
	});

	it('marks circled and no good takes in words too', () => {
		expect(html).toMatch(/class="[^"]*circled[^"]*"/);
		expect(html).toMatch(/class="[^"]*ng[^"]*"/);
		expect(html).toContain('>NG<');
	});

	it('escapes what was typed', () => {
		const typed = dayReport({ ...input(), project: { id: 'p1', name: '<script>x</script>' } }, 'd3')!;
		expect(reportBody([typed], opts)).not.toContain('<script>');
	});

	it('lists what is missing at the end', () => {
		expect(html).toContain('data-section="todo"');
		expect(html.indexOf('data-section="todo"')).toBeGreaterThan(html.indexOf('data-slate="42A"'));
	});

	it('shows lengths in the units asked for', () => {
		// Typed in feet: shown as typed in feet, escaped.
		expect(reportBody([report], { ...opts, units: 'imperial' })).toContain('10&#39;');
		expect(html).toContain('1.2 m');
	});

	it('starts each further day on a new page', () => {
		const two = reportBody([report, dayReport(input(), 'd4')!], opts);
		expect(two.match(/<article class="day/g)).toHaveLength(2);
		expect(two).toContain('class="day next"');
	});

	it('leaves out a column no take of the day fills', () => {
		// Day 4: one take, no times, no timecode; camera A on the 32 mm prime.
		const d4 = reportBody([dayReport(input(), 'd4')!], opts);
		expect(d4).not.toContain('>Start<');
		expect(d4).not.toContain('>TC in<');
		expect(d4).toContain('>Cam<');
		expect(d4).toContain('>Focal<');
		expect(html).toContain('>Start<');
	});

	it('says when a day has no takes', () => {
		const empty = dayReport({ ...input(), takes: [] }, 'd3')!;
		expect(reportBody([empty], opts)).toContain('data-empty');
	});
});

describe('reportCss and reportDocument', () => {
	it('sets the page size', () => {
		expect(reportCss('a4')).toContain('size: A4 portrait');
		expect(reportCss('letter')).toContain('size: letter portrait');
	});
	it('prints black on white', () => {
		expect(reportCss('a4')).toMatch(/color:\s*#000/);
		expect(reportCss('a4')).toMatch(/background:\s*#fff/);
	});
	it('makes a whole page that stands alone', () => {
		const doc = reportDocument('<p>x</p>', { title: 'A & B', paper: 'a4' });
		expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
		expect(doc).toContain('<title>A &amp; B</title>');
		expect(doc).toContain('<p>x</p>');
		expect(doc).toContain('size: A4 portrait');
	});
});
