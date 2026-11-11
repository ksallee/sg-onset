import { describe, expect, it } from 'vitest';
import html from '../../app.html?raw';
import { parseColor } from '$lib/theme/contrast';
import { token, valueOf } from '$lib/theme/palette';
import { CHROME_COLOR, DEFAULT_SETTINGS, SETTINGS_KEY, documentLook, parseSettings, resolveMotion, resolveTheme, serializeSettings, withLast, type Settings } from './settings';

describe('parseSettings', () => {
	it('defaults to right hand, the look and the motion of the device, no night mode, standard buttons, metric, an open sidebar, no place', () => {
		expect(parseSettings(null)).toEqual({ hand: 'right', appearance: 'system', night: false, buttonSize: 'standard', units: 'metric', motion: 'system', sidebar: 'open', captureSidebar: 'strip', last: {} });
		expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
	});
	it('reads back what was stored', () => {
		const settings: Settings = {
			hand: 'left',
			appearance: 'light',
			night: true,
			buttonSize: 'large',
			units: 'imperial',
			motion: 'reduced',
			sidebar: 'strip',
			captureSidebar: 'open',
			last: { projectId: 'p1', shootDayId: 'd1', slateId: 's1' },
			sampleProjectId: 'p1'
		};
		expect(parseSettings(serializeSettings(settings))).toEqual(settings);
	});
	it('replaces nonsense by the default, field by field', () => {
		expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings('[1]')).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings('{"hand":"both","appearance":"sepia","night":"yes","buttonSize":"huge","units":"cubits","motion":"wild","sidebar":3,"captureSidebar":"wide","last":{"projectId":7,"slateId":""}}')).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings('{"appearance":"dark","last":null}')).toEqual({ ...DEFAULT_SETTINGS, appearance: 'dark' });
	});
});

describe('withLast', () => {
	const at: Settings = { ...DEFAULT_SETTINGS, last: { projectId: 'p1', shootDayId: 'd1', slateId: 's1' } };
	it('keeps the day and the slate when the project is the same', () => {
		expect(withLast(at, { projectId: 'p1' }).last).toEqual(at.last);
	});
	it('forgets the day and the slate of the project left', () => {
		expect(withLast(at, { projectId: 'p2' }).last).toEqual({ projectId: 'p2' });
	});
	it('forgets the slate of the day left', () => {
		expect(withLast(at, { shootDayId: 'd2' }).last).toEqual({ projectId: 'p1', shootDayId: 'd2' });
		expect(withLast(at, { shootDayId: 'd1' }).last).toEqual(at.last);
	});
	it('sets and forgets the slate', () => {
		expect(withLast(at, { slateId: 's2' }).last.slateId).toBe('s2');
		expect(withLast(at, { slateId: undefined }).last).toEqual({ projectId: 'p1', shootDayId: 'd1' });
	});
	it('sets a whole place at once', () => {
		expect(withLast(at, { projectId: 'p2', shootDayId: 'd9', slateId: 's9' }).last).toEqual({ projectId: 'p2', shootDayId: 'd9', slateId: 's9' });
	});
	it('touches nothing else', () => {
		expect(withLast({ ...at, night: true }, { slateId: 's2' }).night).toBe(true);
	});
});

describe('resolveTheme', () => {
	it('follows the device on system', () => {
		expect(resolveTheme({ appearance: 'system', night: false }, true)).toEqual({ theme: 'dark', night: false });
		expect(resolveTheme({ appearance: 'system', night: false }, false)).toEqual({ theme: 'light', night: false });
	});
	it('holds a choice whatever the device asks', () => {
		expect(resolveTheme({ appearance: 'light', night: false }, true).theme).toBe('light');
		expect(resolveTheme({ appearance: 'dark', night: false }, false).theme).toBe('dark');
	});
	it('lets red night mode win over the appearance, and it is dark', () => {
		expect(resolveTheme({ appearance: 'light', night: true }, false)).toEqual({ theme: 'dark', night: true });
	});
});

describe('CHROME_COLOR', () => {
	it('is each scheme\'s canvas, --bg in palette.ts', () => {
		const hex = (css: string) => {
			const { r, g, b } = parseColor(css);
			return `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
		};
		for (const mode of ['light', 'dark', 'night'] as const) expect(CHROME_COLOR[mode]).toBe(hex(valueOf(token('bg'), mode)));
	});
});

describe('documentLook', () => {
	const system = { dark: true, reducedMotion: false };
	it('gives the theme attributes, the hand, the motion and the chrome colour, and no classes', () => {
		expect(documentLook({ ...DEFAULT_SETTINGS, night: true, hand: 'left' }, system)).toMatchObject({
			theme: 'dark',
			night: true,
			hand: 'left',
			motion: 'full',
			themeColor: CHROME_COLOR.night
		});
		expect(documentLook({ ...DEFAULT_SETTINGS, appearance: 'light' }, system)).toMatchObject({ theme: 'light', night: false, themeColor: CHROME_COLOR.light });
		expect(documentLook({ ...DEFAULT_SETTINGS, appearance: 'dark' }, system).themeColor).toBe(CHROME_COLOR.dark);
		expect(documentLook(DEFAULT_SETTINGS, system)).not.toHaveProperty('classes');
		expect(documentLook(DEFAULT_SETTINGS, { dark: false, reducedMotion: true })).toMatchObject({ theme: 'light', motion: 'reduced' });
	});
	it('grows every target at the large button size: 20 mm to capture, as for gloves', () => {
		expect(documentLook(DEFAULT_SETTINGS, system)).toMatchObject({ buttonSize: 'standard', target: 78, gap: 16, touch: 44 });
		expect(documentLook({ ...DEFAULT_SETTINGS, buttonSize: 'large' }, system)).toMatchObject({ buttonSize: 'large', target: 104, touch: 56 });
	});
});

describe('resolveMotion', () => {
	it('follows the device on system', () => {
		expect(resolveMotion('system', false)).toBe('full');
		expect(resolveMotion('system', true)).toBe('reduced');
	});
	it('holds a choice whatever the device asks', () => {
		expect(resolveMotion('full', true)).toBe('full');
		expect(resolveMotion('reduced', false)).toBe('reduced');
	});
});

describe('app.html, before the first paint', () => {
	it('sets the motion in force', () => {
		expect(html).toContain("root.dataset.motion = s.motion === 'full' || s.motion === 'reduced' ? s.motion : matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'");
	});
	it('reads the same key and sets the theme and the night mode, and no classes', () => {
		expect(html).toContain(`'${SETTINGS_KEY}'`);
		expect(html).toContain("root.dataset.theme = dark ? 'dark' : 'light'");
		expect(html).toContain("root.dataset.night = 'true'");
		expect(html).not.toContain('className');
		expect(html).toContain(`night ? '${CHROME_COLOR.night}' : dark ? '${CHROME_COLOR.dark}' : '${CHROME_COLOR.light}'`);
	});
});
