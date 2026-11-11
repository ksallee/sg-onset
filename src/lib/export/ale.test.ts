// The expected text follows the ALE files from ARRI, Avid and Silverstack in research/ontologies:
// a Heading block, Column, Data, tab-separated; End is the frame after the last one, as
// Start + Duration in those files.
import { describe, expect, it } from 'vitest';
import { ALE_COLUMNS, exportAle } from './ale';
import { flatten } from './selection';
import { input, t42A1A, t42A1B } from './testData';

const rows = () => flatten(input());
const lines = (text: string) => text.split('\n');

function parse(text: string) {
	const l = lines(text);
	const head = l[l.indexOf('Column') + 1].split('\t');
	const data = l.slice(l.indexOf('Data') + 1).filter((x) => x !== '').map((x) => x.split('\t'));
	return { head, data, cell: (row: number, col: string) => data[row][head.indexOf(col)] };
}

describe('exportAle', () => {
	it('writes the heading block, then Column and Data', () => {
		const { text } = exportAle(rows(), { fps: { num: 24000, denom: 1001 } });
		expect(lines(text).slice(0, 6)).toEqual(['Heading', 'FIELD_DELIM\tTABS', 'VIDEO_FORMAT\t1080', 'FPS\t23.976', '', 'Column']);
		expect(lines(text)[6]).toBe(ALE_COLUMNS.join('\t'));
		expect(lines(text)[7]).toBe('');
		expect(lines(text)[8]).toBe('Data');
		expect(text.endsWith('\n')).toBe(true);
	});

	it('writes one row per take with timecode, End one frame past the last', () => {
		const { text } = exportAle(rows(), { fps: { num: 24, denom: 1 } });
		const t = parse(text);
		expect(t.data).toHaveLength(1);
		expect(t.cell(0, 'Name')).toBe('A001C003');
		expect(t.cell(0, 'Tracks')).toBe('V');
		expect(t.cell(0, 'Start')).toBe('14:39:39:09');
		expect(t.cell(0, 'End')).toBe('14:39:59:11');
		expect(t.cell(0, 'Duration')).toBe('00:00:20:02');
		expect(t.cell(0, 'Tape')).toBe('A001C003');
		expect(t.cell(0, 'Scene')).toBe('42');
		expect(t.cell(0, 'Take')).toBe('1');
		expect(t.cell(0, 'Camera')).toBe('A');
		expect(t.cell(0, 'Camroll')).toBe('A001');
		expect(t.cell(0, 'Shoot Date')).toBe('20261110');
		expect(t.cell(0, 'FPS')).toBe('24');
		expect(t.cell(0, 'Sensor Fps')).toBe('23.976');
		expect(t.cell(0, 'Circled Take')).toBe('Yes');
		expect(t.cell(0, 'Lens')).toBe('S4/i 32mm');
		expect(t.cell(0, 'Lens_sn')).toBe('CK32-001');
		expect(t.cell(0, 'Focal Length')).toBe('32');
		expect(t.cell(0, 'Focal Length End')).toBe('32');
		expect(t.cell(0, 'T-Stop')).toBe('2.8');
		expect(t.cell(0, 'Focus Distance')).toBe('3.048');
		expect(t.cell(0, 'Focus Distance End')).toBe('1.918');
		expect(t.cell(0, 'Lens Height')).toBe('1.2');
		expect(t.cell(0, 'Tilt')).toBe('10');
		expect(t.cell(0, 'Tilt End')).toBe('-5');
		expect(t.cell(0, 'Shutter_angle')).toBe('180');
		expect(t.cell(0, 'ASA')).toBe('800');
		expect(t.cell(0, 'Whitepoint')).toBe('5600');
		expect(t.cell(0, 'Comments')).toBe('Best performance');
		expect(t.cell(0, 'VFX Shots')).toBe('NT_042_010, NT_042_020');
	});

	it('skips takes without timecode and names them', () => {
		const out = exportAle(rows(), { fps: { num: 24, denom: 1 } });
		expect(out.skipped).toHaveLength(7);
		expect(out.skipped).toContain(t42A1B.id);
		expect(out.warnings).toContainEqual({ kind: 'noTimecode', takeIds: out.skipped });
	});

	it('keeps takes without timecode on request, with a made-up name and empty Start and End', () => {
		const t = parse(exportAle(rows(), { fps: { num: 24, denom: 1 }, withoutTimecode: 'keep' }).text);
		expect(t.data).toHaveLength(8);
		const b1 = flatten(input()).findIndex((r) => r.take.id === t42A1B.id);
		expect(t.cell(b1, 'Name')).toBe('42A-1-B');
		expect(t.cell(b1, 'Start')).toBe('');
		expect(t.cell(b1, 'Duration')).toBe('');
		expect(t.cell(b1, 'Focal Length')).toBe('85');
		expect(t.cell(b1, 'Focal Length End')).toBe('150');
	});

	it('takes the commonest frame rate when none is given, and warns when there is none', () => {
		expect(lines(exportAle(rows(), {}).text)[3]).toBe('FPS\t24');
		const none = exportAle([], {});
		expect(lines(none.text)[3]).toBe('FPS\t24');
		expect(none.warnings).toContainEqual({ kind: 'noFps' });
	});

	it('writes drop frame timecode with a semicolon at 29.97', () => {
		const data = rows().filter((r) => r.take.id === t42A1A.id);
		data[0] = { ...data[0], take: { ...data[0].take, timecodeStart: '00:00:59:28', timecodeEnd: '00:01:00:02' } };
		const out = exportAle(data, { fps: { num: 30000, denom: 1001 }, dropFrame: true });
		const t = parse(out.text);
		expect(lines(out.text)[3]).toBe('FPS\t29.97');
		expect(t.cell(0, 'Start')).toBe('00:00:59;28');
		expect(t.cell(0, 'End')).toBe('00:01:00;03');
		expect(t.cell(0, 'Duration')).toBe('00:00:00;03');
	});

	it('ignores drop frame at a rate that has none, and says so', () => {
		const out = exportAle(rows(), { fps: { num: 24, denom: 1 }, dropFrame: true });
		expect(parse(out.text).cell(0, 'Start')).toBe('14:39:39:09');
		expect(out.warnings).toContainEqual({ kind: 'noDropFrame' });
	});

	it('flags a timecode that does not read at the rate, and leaves the row out', () => {
		const data = rows().filter((r) => r.take.id === t42A1A.id);
		data[0] = { ...data[0], take: { ...data[0].take, timecodeStart: '00:00:00:27' } };
		const out = exportAle(data, { fps: { num: 25, denom: 1 } });
		expect(out.skipped).toEqual([t42A1A.id]);
		expect(out.warnings).toContainEqual({ kind: 'badTimecode', takeIds: [t42A1A.id] });
	});

	it('writes lengths in feet on request', () => {
		const t = parse(exportAle(rows(), { fps: { num: 24, denom: 1 }, lengths: 'imperial' }).text);
		expect(t.cell(0, 'Focus Distance')).toBe('10');
		expect(t.cell(0, 'Focus Distance End')).toBe('6.2917');
	});

	it('takes a custom video format', () => {
		expect(lines(exportAle([], { fps: { num: 25, denom: 1 }, videoFormat: 'CUSTOM' }).text)[2]).toBe('VIDEO_FORMAT\tCUSTOM');
	});

	it('never lets a tab or line break inside a value split a row', () => {
		const data = rows().filter((r) => r.take.id === t42A1A.id);
		data[0] = { ...data[0], take: { ...data[0].take, notes: 'a\tb\r\nc' } };
		expect(parse(exportAle(data, { fps: { num: 24, denom: 1 } }).text).cell(0, 'Comments')).toBe('a b c');
	});
});
