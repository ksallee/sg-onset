import { describe, expect, it } from 'vitest';
import type { ShotReport } from '$lib/fpt/sendPlan';
import { failureText, missingText, problemText, shotLine, signInText, summaryText } from './text';

const report = (over: Partial<ShotReport> = {}): ShotReport => ({ shot: { id: 1, code: 'SH010' }, linked: false, setShots: 1, slates: 2, slatesFailed: false, note: 'created', ...over });

describe('summaryText', () => {
	it('says what Send will do, in a line', () => {
		expect(summaryText({ kind: 'shot', count: 2, notes: true })).toBe('2 Shots. Link Set Shots and slates, and write the Notes for artists.');
		expect(summaryText({ kind: 'shot', count: 1, notes: true })).toBe('1 Shot. Link Set Shots and slates, and write the Note for artists.');
		expect(summaryText({ kind: 'setShot', count: 3, notes: true })).toBe('3 Set Shots. Link their Shots and slates, and write the Notes for artists.');
		expect(summaryText({ kind: 'setShot', count: 1, notes: false })).toBe('1 Set Shot. Link its Shots and slates.');
		expect(summaryText({ kind: 'shot', count: 2, notes: false })).toBe('2 Shots. Link Set Shots and slates.');
	});
});

describe('missingText', () => {
	it('counts the rows left out', () => {
		expect(missingText(1)).toBe('1 selected row is not in this project. It is left out.');
		expect(missingText(3)).toBe('3 selected rows are not in this project. They are left out.');
	});
});

describe('shotLine', () => {
	it('says per Shot what was done, in short sentences', () => {
		expect(shotLine(report({ linked: true }))).toBe('Linked to its Set Shot. On 2 slates. Note written.');
		expect(shotLine(report({ slates: 1, note: 'updated' }))).toBe('On 1 slate. Note updated, with a reply.');
		expect(shotLine(report({ note: 'unchanged' }))).toBe('On 2 slates. The Note lists all of it already.');
		expect(shotLine(report({ slates: 0, note: 'empty' }))).toBe('On no slate yet. Nothing shot for it yet, so no Note.');
		expect(shotLine(report({ setShots: 0, slates: 0, note: 'empty' }))).toBe('No Set Shot holds it yet. Nothing shot for it yet, so no Note.');
		expect(shotLine(report({ slatesFailed: true, note: 'failed' }))).toBe('On 2 slates. A slate link did not go. The Note did not go.');
		expect(shotLine(report({ note: 'waits' }))).toBe('On 2 slates.');
	});
});

describe('signInText', () => {
	it('names the site, and the one it replaces', () => {
		expect(signInText('signIn', 'studio.shotgrid.autodesk.com')).toBe('Sign in to studio.shotgrid.autodesk.com to go on.');
		expect(signInText('expired', 'studio.shotgrid.autodesk.com')).toBe('Your session on studio.shotgrid.autodesk.com ended. Sign in again to go on.');
		expect(signInText('other', 'studio.shotgrid.autodesk.com', 'other.shotgrid.autodesk.com')).toBe(
			'You are signed in to other.shotgrid.autodesk.com. Sign in to studio.shotgrid.autodesk.com to go on. It replaces that session on this device.'
		);
	});
});

describe('problemText and failureText', () => {
	it('every problem and failure has words', () => {
		for (const p of ['bad-request', 'not-allowed', 'none-selected', 'too-many', 'none', 'type', 'noSetShot'] as const) expect(problemText(p, 'CustomEntity09')).not.toMatch(/^send\./);
		for (const f of ['offline', 'unreachable', 'session', 'setup', 'refused'] as const) expect(failureText(f)).not.toMatch(/^send\./);
		expect(problemText('too-many')).toBe('That is more than 500 rows. Select fewer, then run it again.');
	});
});
