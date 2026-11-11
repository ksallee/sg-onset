// The vocabulary of docs/vocabulary.md, enforced: one label per concept, one concept per label,
// a short label for every per-take number, and none of the words the glossary rejects.
import { describe, expect, it } from 'vitest';
import { FIELDS, type FieldDef } from '$lib/model/catalogue';
import { en } from './en';
import { hasMessage, tk } from './messages';

const defs = FIELDS as readonly FieldDef[];
const messages = en as Record<string, string>;
const NUMERIC: readonly FieldDef['type'][] = ['integer', 'number', 'length', 'rational'];

/** Labels that more than one scope uses, each for the same concept. */
const SHARED = new Set(['Name', 'Notes', 'Make', 'Model', 'Serial number', 'Focal length', 'Camera', 'Lens', 'Lighting setup', 'Camera setup']);

/** The longest a short label may be, so the take table's columns stay narrow. */
const SHORT_MAX = 8;

/**
 * Words no string may use, with the reason. Matched as whole words, any case.
 * The take button pair is Start / End: it records nothing.
 */
const BANNED: readonly [RegExp, string][] = [
	[/\brec(ord|ords|orded|ording)?\b/i, 'the app records nothing: Start / End, and "entry" for a stored thing'],
	[/\brolling\b|\brolled\b/i, 'take states are Ready / Running / Ended'],
	[/\bcut\b/i, 'the take button pair is Start / End'],
	[/(?<!T-)\bstop(ped)?\b/i, 'the take button pair is Start / End; only "T-stop" holds the word'],
	[/\breel\b/i, 'the camera roll is "Camera roll" (VES CRIF "Tk Roll")'],
	[/\bmag\b/i, 'the camera roll is "Camera roll"'],
	[/\bpitch\b/i, 'the camera angle up or down is "Tilt"'],
	[/\bitems?\b/i, 'a stored slate, take, camera… is an "entry"'],
	[/\bstills?\b/i, 'a reference photo is a "Photo"; "stills" on set means the unit stills photographer'],
	[/\bserver\b/i, 'say "Flow PT", the place the user knows'],
	[/\btheme\b/i, 'the setting is "Appearance"'],
	[/sg-onset/i, 'the product is "SG OnSet"; sg-onset is for code and URLs only']
];

/** The take button and states may not say Roll in any form. */
const NO_ROLL_PREFIXES = ['rail.', 'phase.', 'timing.', 'undo.'];

/** Keys whose value breaks a rule and lives in a file another area owns, listed in the vocabulary PR. Remove a key when its file is fixed. */
const PENDING = new Set(['stills.title', 'stills.none', 'stills.alt', 'undo.photo']);

const label = (d: FieldDef) => tk(d.labelKey);

describe('field labels', () => {
	it('gives each field of a scope its own label', () => {
		const clashes: string[] = [];
		const seen = new Map<string, string>();
		for (const d of defs) {
			const id = `${d.scope}:${label(d)}`;
			if (seen.has(id)) clashes.push(`${id} (${seen.get(id)}, ${d.key})`);
			seen.set(id, d.key);
		}
		expect(clashes).toEqual([]);
	});

	it('shares a label across scopes only for the same concept', () => {
		const scopesOf = new Map<string, Set<string>>();
		for (const d of defs) scopesOf.set(label(d), (scopesOf.get(label(d)) ?? new Set()).add(d.scope));
		const shared = [...scopesOf].filter(([, scopes]) => scopes.size > 1).map(([l]) => l);
		expect(shared.filter((l) => !SHARED.has(l))).toEqual([]);
	});

	it('writes labels in sentence case', () => {
		const wrong = defs.map(label).filter((l) => /\s[A-Z][a-z]/.test(l.replace(/\b(HDRI|VFX|ISO|T-stop)\b/g, '')));
		expect(wrong).toEqual([]);
	});

	it('has a short label for every per-take number, short and unique', () => {
		const take = defs.filter((d) => d.scope === 'take');
		const missing = take.filter((d) => NUMERIC.includes(d.type) && !hasMessage(`${d.labelKey}.short`)).map((d) => d.key);
		expect(missing).toEqual([]);
		const shorts = take.filter((d) => hasMessage(`${d.labelKey}.short`)).map((d) => tk(`${d.labelKey}.short`));
		expect(shorts.filter((s) => s.length > SHORT_MAX)).toEqual([]);
		expect(shorts.length).toBe(new Set(shorts).size);
		// A short label never names another take field.
		const longs = new Map(take.map((d) => [label(d), d.labelKey]));
		const crossed = take.filter((d) => hasMessage(`${d.labelKey}.short`) && longs.has(tk(`${d.labelKey}.short`)) && longs.get(tk(`${d.labelKey}.short`)) !== d.labelKey);
		expect(crossed.map((d) => d.key)).toEqual([]);
	});

	it('leaves `.short` free for short labels', () => {
		expect(defs.filter((d) => d.options?.includes('short')).map((d) => d.key)).toEqual([]);
	});

	it('keeps the decided words', () => {
		const of = (scope: string, key: string) => label(defs.find((d) => d.scope === scope && d.key === key)!);
		expect(of('take', 'tilt')).toBe('Tilt');
		expect(of('take', 'roll')).toBe('Dutch angle');
		expect(tk('field.take.roll.short')).toBe('Dutch');
		expect(of('take', 'cameraRoll')).toBe('Camera roll');
		expect(tk('field.take.cameraRoll.short')).toBe('Roll');
		expect(of('take', 'lensHeight')).toBe('Lens height');
		expect(of('take', 'focusDistance')).toBe('Focus distance');
		expect(of('take', 'distanceToSubject')).toBe('Subject distance');
		expect(of('take', 'tStop')).toBe('T-stop');
		expect(of('take', 'captureFrameRate')).toBe('Frame rate');
		expect(of('take', 'isoSpeed')).toBe('ISO');
		expect(of('take', 'whiteBalance')).toBe('White balance');
		expect(of('take', 'startedAt')).toBe('Start time');
		expect(of('take', 'endedAt')).toBe('End time');
		expect(of('take', 'cameraSetupId')).toBe('Camera setup');
		expect(of('take', 'cameraId')).toBe('Camera');
		expect(of('cameraSetup', 'cameraLabel')).toBe('Camera letter');
		expect(of('cameraSetup', 'cameraId')).toBe('Camera');
		expect(tk('scope.camera')).toBe('Camera');
		expect(tk('scope.still')).toBe('Photo');
		expect([tk('app.name'), tk('welcome.title')]).toEqual(['SG OnSet', 'SG OnSet']);
	});
});

describe('every string', () => {
	it('uses none of the rejected words', () => {
		const found: string[] = [];
		for (const [key, text] of Object.entries(messages)) {
			if (PENDING.has(key)) continue;
			// A `{name}` is filled by code, never shown.
			const shown = text.replace(/\{\w+\}/g, '');
			for (const [pattern, why] of BANNED) if (pattern.test(shown)) found.push(`${key}: "${text}" (${why})`);
		}
		expect(found).toEqual([]);
	});

	it('never says Roll for the take button or its states', () => {
		const found = Object.entries(messages).filter(([key, text]) => NO_ROLL_PREFIXES.some((p) => key.startsWith(p)) && /\broll/i.test(text));
		expect(found).toEqual([]);
	});

	it('names each sync state once', () => {
		const states = ['synced', 'empty', 'pending', 'local', 'attention'];
		const shorts = states.map((s) => tk(`sync.short.${s}`));
		expect(shorts.length).toBe(new Set(shorts).size);
		// No sync word doubles as a settings word.
		const settingsWords = new Set(Object.entries(messages).filter(([k]) => k.startsWith('settings.')).map(([, v]) => v));
		expect(shorts.filter((s) => settingsWords.has(s))).toEqual([]);
	});
});
