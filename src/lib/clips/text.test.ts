import { describe, expect, it } from 'vitest';
import type { Slate, Take } from '$lib/model/types';
import type { Clip } from './clips';
import { clipLine, columnLabel, commitText, fieldLines, issueText, matchLine, takeText } from './text';

const slate: Slate = { id: 's1', shootDayId: 'd1', slateUID: '42A' };
const take: Take = { id: 't1', slateId: 's1', take: '3' };
const clip = (extra: Partial<Clip> = {}): Clip => ({ row: 10, name: 'A001C003', roll: 'A001', start: '14:02:11:04', end: '14:02:59:09', rate: { num: 24, denom: 1 }, dropFrame: false, ...extra });

describe('takeText', () => {
	it('names the take by slate, number and camera letter', () => {
		expect(takeText({ take, slate, camera: 'A' })).toBe('Slate 42A, take 3 · A');
		expect(takeText({ take, slate, camera: '' })).toBe('Slate 42A, take 3');
	});
});

describe('matchLine', () => {
	it('says the take and how it was found', () => {
		expect(matchLine({ take, slate, camera: 'A' }, 'time')).toBe('Slate 42A, take 3 · A · By time of day');
		expect(matchLine({ take, slate, camera: 'B' }, 'order')).toBe('Slate 42A, take 3 · B · By roll and order');
		expect(matchLine({ take, slate, camera: 'A' }, 'picked')).toBe('Slate 42A, take 3 · A · Picked');
	});
});

describe('fieldLines', () => {
	it('lists the fields filled on one line, then each update and each typed value kept', () => {
		expect(
			fieldLines([
				{ key: 'clipName', kind: 'add', to: 'A001C003' },
				{ key: 'timecodeEnd', kind: 'add', to: '14:02:59:09' },
				{ key: 'cameraRoll', kind: 'update', from: 'A001', to: 'A002' },
				{ key: 'timecodeStart', kind: 'kept', from: '01:00:00:00', to: '14:02:11:04' }
			])
		).toEqual(['Fills: Clip name, Timecode out', 'Camera roll: A001 to A002', 'Timecode in kept: 01:00:00:00. The file has 14:02:11:04.']);
	});
	it('says when there is nothing new', () => {
		expect(fieldLines([])).toEqual(['Nothing new']);
	});

	it('says a field a person cleared stays empty', () => {
		expect(fieldLines([{ key: 'clipName', kind: 'kept', to: 'A001C003' }])).toEqual(['Clip name kept empty. The file has A001C003.']);
	});

	it('writes the camera’s values with their units, and the lens by its name', () => {
		const names = new Map([['c32', 'Cooke S4/i 32mm']]);
		expect(
			fieldLines(
				[
					{ key: 'lensId', kind: 'add', to: 'c32' },
					{ key: 'isoSpeed', kind: 'add', to: 800 },
					{ key: 'whiteBalance', kind: 'update', from: 4300, to: 5600 },
					{ key: 'shutterAngle', kind: 'kept', from: 180, to: 172.8 },
					{ key: 'captureFrameRate', kind: 'update', from: { num: 24, denom: 1 }, to: { num: 24000, denom: 1001 } }
				],
				{ names }
			)
		).toEqual(['Fills: ISO', 'Lens: Cooke S4/i 32mm', 'White balance: 4300 K to 5600 K', 'Frame rate: 24 fps to 23.976 fps', 'Shutter angle kept: 180°. The file has 172.8°.']);
	});

	it('says when the lens the file names is not matched in the gear', () => {
		const cooke = { id: 'c32', projectId: 'p', lensMake: 'Cooke', lensModel: 'S4/i 32mm', lensSerialNumber: '111' };
		const twin = { ...cooke, id: 'c32b', lensSerialNumber: '222' };
		expect(fieldLines([], { lens: { name: 'PRIMO_ZOO', match: { kind: 'none' } } })).toEqual(['Nothing new', 'Lens not matched: PRIMO_ZOO is not in the gear.']);
		expect(fieldLines([], { lens: { name: 'S4/i 32mm', match: { kind: 'many', lenses: [cooke, twin] } } })).toEqual(['Nothing new', 'Lens not matched: S4/i 32mm fits Cooke S4/i 32mm, serial 111 and Cooke S4/i 32mm, serial 222.']);
		expect(fieldLines([], { lens: { name: 'S4/i 32mm', match: { kind: 'one', lens: cooke } } })).toEqual(['Nothing new']);
	});
});

describe('clipLine', () => {
	it('gives the roll and the timecode of a clip', () => {
		expect(clipLine(clip())).toBe('A001 · 14:02:11:04 to 14:02:59:09');
		expect(clipLine(clip({ roll: undefined, start: undefined, end: undefined }))).toBe('No timecode');
	});
});

describe('issueText', () => {
	it('says what could not be read', () => {
		expect(issueText({ kind: 'noNameColumn' })).toBe('Pick the column with the clip name.');
		expect(issueText({ kind: 'noRate', rate: { num: 25, denom: 1 } })).toBe('The file names no timecode rate. Read at 25 fps.');
		expect(issueText({ kind: 'noName', row: 4 })).toBe('Row 4: no clip name. The row was left out.');
		expect(issueText({ kind: 'badTimecode', row: 5, column: 'Start', value: 'soon' })).toBe('Row 5, Start: “soon” is not timecode. The value was left out.');
	});
});

describe('columnLabel', () => {
	it('names what a column is read as, with the field labels', () => {
		expect(columnLabel('clipName')).toBe('Clip name');
		expect(columnLabel('cameraRoll')).toBe('Camera roll');
		expect(columnLabel('camera')).toBe('Camera letter');
		expect(columnLabel('timecodeStart')).toBe('Timecode in');
		expect(columnLabel('timecodeEnd')).toBe('Timecode out');
		expect(columnLabel('duration')).toBe('Duration');
		expect(columnLabel('fps')).toBe('Timecode rate');
		expect(columnLabel('lens')).toBe('Lens');
		expect(columnLabel('isoSpeed')).toBe('ISO');
		expect(columnLabel('captureFrameRate')).toBe('Frame rate');
		expect(columnLabel('focalLength')).toBe('Focal length');
	});
});

describe('commitText', () => {
	it('counts the takes the button fills', () => {
		expect(commitText(0)).toBe('Nothing to Fill');
		expect(commitText(1)).toBe('Fill 1 Take');
		expect(commitText(4)).toBe('Fill 4 Takes');
	});
});
