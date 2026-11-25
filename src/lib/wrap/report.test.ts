import { describe, expect, it } from 'vitest';
import { dayReport } from '$lib/export/dayReport';
import { input, t42A1A, t42A1B } from '$lib/export/testData';
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

	// Kevin, 2026-11-17 (#89): each kind counted as itself.
	it('totals the day, photos, videos and audio notes each as itself', () => {
		expect(html).toContain('3 slates · 7 takes · 2 circled · 1 no good · 3 photos');
		const data = { ...input(), videos: ['st1'], audioNotes: [{ id: 'an1', takeId: t42A1A.id, capturedAt: '2026-11-10T22:30:00.000Z' }] };
		expect(reportBody([dayReport(data, 'd3')!], opts)).toContain('3 slates · 7 takes · 2 circled · 1 no good · 2 photos, 1 video, 1 audio note');
		const none = dayReport({ ...input(), stills: [] }, 'd3')!;
		expect(reportBody([none], opts)).toContain('1 no good · 0 photos');
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

	it('lists the set references of a slate under it, in the order logged', () => {
		const block = html.slice(html.indexOf('data-slate="42A"'));
		expect(block).toContain('References');
		expect(block).toContain('Lidar scan: Scan 01');
		expect(block).toContain('HDRI 360: HDRI_0412 (Ricoh Theta Z1, A003, ×7, Noon sun)');
		expect(block.indexOf('Scan 01')).toBeLessThan(block.indexOf('HDRI_0412'));
		const nine = html.slice(html.indexOf('data-slate="9"'), html.indexOf('data-slate="10"'));
		expect(nine).not.toContain('References');
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

	it('shows the take type where a take of the day is not Main', () => {
		expect(html).not.toContain('>Type<');
		const shoot = input();
		shoot.takes = shoot.takes.map((t) => (t.id === t42A1A.id ? { ...t, takeType: 'cleanPlate' } : t));
		const typed = reportBody([dayReport(shoot, 'd3')!], opts);
		expect(typed).toContain('>Type<');
		// One take is a clean plate; the Main takes leave the cell empty.
		expect(typed.match(/>Clean plate</g)).toHaveLength(1);
		expect(typed.match(/>Main</g)).toHaveLength(html.match(/>Main</g)!.length);
	});

	it('shows the plates at the tail in the type column, after the type', () => {
		const shoot = input();
		shoot.takes = shoot.takes.map((t) => (t.id === t42A1A.id ? { ...t, takeType: 'lightPass', takeTail: ['cleanPlate'] } : t.id === t42A1B.id ? { ...t, takeTail: ['cleanPlate', 'ballsAndChart'] } : t));
		const tailed = reportBody([dayReport(shoot, 'd3')!], opts);
		expect(tailed).toContain('>Type<');
		expect(tailed).toContain('>Light pass, Clean plate tail<');
		expect(tailed).toContain('>Clean plate tail, Balls and chart tail<');
	});

	// #138: the rig of each take, a built-in one by its label, a project one as typed.
	it('shows the rig of each take where a take of the day has one, after the tilt', () => {
		expect(html).not.toContain('>Rig<');
		const shoot = input();
		shoot.takes = shoot.takes.map((t) => (t.id === t42A1A.id ? { ...t, cameraMount: 'hiHat' } : t.id === t42A1B.id ? { ...t, cameraMount: 'Russian arm' } : t));
		const rigged = reportBody([dayReport(shoot, 'd3')!], opts);
		expect(rigged).toContain('>Rig<');
		expect(rigged).toContain('>Hi-hat<');
		expect(rigged).toContain('>Russian arm<');
		expect(rigged).toContain('>Tilt</th><th>Rig</th>');
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
