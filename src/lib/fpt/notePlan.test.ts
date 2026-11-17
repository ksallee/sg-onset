import { describe, expect, it } from 'vitest';
import { tk } from '$lib/i18n/messages';
import { keptNotesOf, noteFilter, noteWrite, shotNoteKey, shotTasksOf, type KeptNote } from './notePlan';
import { noteRecordsOf, shotCapture } from './shotNote';
import { RESOLUTION } from './testkit';

const P = 55;
const FIELDS = { key: 'sg_onset_key', captured: 'sg_onset_captured' };
const link = (type: string, id: number) => ({ type, id, name: 'x' });
const ref = (type: string, id: number) => ({ type, id });

/** Shot 7: slate 42A, takes 1 and 2, take 2 a clean plate, one photo. */
function capture(takes = ['1', '2']) {
	return shotCapture(
		{ id: 7, code: 'SMP_042_0010' },
		noteRecordsOf(RESOLUTION, {
			setShots: [{ id: 300, relationships: { sg_shots: { data: [link('Shot', 7)] } } }],
			slates: [{ id: 11, attributes: { code: '42A' }, relationships: { sg_set_shots: { data: [link('CustomEntity22', 300)] } } }],
			takes: takes.map((take, i) => ({
				id: 100 + i,
				attributes: { code: take, sg_take_type: take === '2' ? 'cleanPlate' : null },
				relationships: { sg_slate: { data: link('Slate', 11) }, sg_photos: { data: i === 0 ? [link('Attachment', 500)] : [] } }
			})),
			references: [],
			files: [{ id: 500, attributes: { filename: 'onset_aaaa_b.jpg' } }]
		})
	);
}

const people = { tasks: [ref('Task', 40), ref('Task', 41)], to: [ref('Group', 5), ref('HumanUser', 20)] };

describe('shotNoteKey', () => {
	// One Note per Shot, keyed in a unique text field (findings/146). The project is in it, as for a
	// Set Shot: whether `unique` spans projects is unmeasured.
	it('is the project and the Shot', () => {
		expect(shotNoteKey(P, 7)).toBe('55:shot:7');
	});
});

describe('noteFilter', () => {
	it('looks the Notes up by key, in the project only', () => {
		expect(noteFilter(P, 'sg_onset_key', [7, 8])).toEqual({
			logical_operator: 'and',
			conditions: [
				['project', 'is', { type: 'Project', id: P }],
				['sg_onset_key', 'in', ['55:shot:7', '55:shot:8']]
			]
		});
	});
});

describe('keptNotesOf', () => {
	it('reads each Note with its key, what it lists, who it is to and its Tasks', () => {
		const rows = [
			{
				type: 'Note',
				id: 900,
				attributes: { sg_onset_key: ' 55:SHOT:7 ', sg_onset_captured: 'take:11:1 photo:500' },
				relationships: { addressings_to: { data: [link('HumanUser', 20), link('Group', 5)] }, tasks: { data: [link('Task', 40)] } }
			},
			{ type: 'Note', id: 901, attributes: { sg_onset_key: null }, relationships: {} }
		];
		expect(keptNotesOf(rows, FIELDS)).toEqual([{ id: 900, key: '55:shot:7', captured: ['take:11:1', 'photo:500'], to: [ref('Group', 5), ref('HumanUser', 20)], tasks: [ref('Task', 40)] }]);
	});
});

describe('shotTasksOf', () => {
	// A Group assignee is stored as the Group (findings/150), and a Group can be addressed: its
	// members follow the Note (findings/147). It stays a Group.
	it('gives each Shot its Tasks and the people and Groups assigned to them, each once', () => {
		const rows = [
			{ type: 'Task', id: 41, relationships: { entity: { data: link('Shot', 7) }, task_assignees: { data: [link('HumanUser', 20), link('Group', 5)] } } },
			{ type: 'Task', id: 40, relationships: { entity: { data: link('Shot', 7) }, task_assignees: { data: [link('HumanUser', 20)] } } },
			{ type: 'Task', id: 42, relationships: { entity: { data: link('Shot', 8) }, task_assignees: { data: [] } } },
			{ type: 'Task', id: 43, relationships: { entity: { data: link('Asset', 7) }, task_assignees: { data: [link('HumanUser', 21)] } } }
		];
		const tasks = shotTasksOf(rows);
		expect(tasks.get(7)).toEqual(people);
		expect(tasks.get(8)).toEqual({ tasks: [ref('Task', 42)], to: [] });
		expect(tasks.has(9)).toBe(false);
	});
});

describe('noteWrite', () => {
	const base = { projectId: P, fields: FIELDS, label: tk, people };

	it('makes the Note when the Shot has none: about the Shot, on its Tasks, to their people, with its key and what it lists', () => {
		const now = capture();
		const write = noteWrite({ ...base, capture: now });
		expect(write).toEqual({
			kind: 'create',
			data: {
				project: { type: 'Project', id: P },
				subject: 'Set data for SMP_042_0010',
				content: expect.stringContaining('Slate 42A: takes 1, 2'),
				note_links: [{ type: 'Shot', id: 7 }],
				tasks: people.tasks,
				addressings_to: people.to,
				sg_onset_key: '55:shot:7',
				sg_onset_captured: now.items.join(' ')
			}
		});
	});

	it('writes nothing while nothing was captured for the Shot', () => {
		expect(noteWrite({ ...base, capture: capture([]) })).toEqual({ kind: 'none' });
	});

	// Kevin, 2026-11-17: a sync with nothing new for a Shot writes nothing, new people or not.
	it('writes nothing when the Note lists it all already', () => {
		const now = capture();
		const kept: KeptNote = { id: 900, key: '55:shot:7', captured: now.items, to: [], tasks: [] };
		expect(noteWrite({ ...base, capture: now, kept })).toEqual({ kind: 'none' });
	});

	// Kevin, 2026-11-17: more material rewrites the Note in place, a short reply says what was added,
	// and the people newly assigned are added. Nobody is removed.
	it('rewrites the Note when more was captured, adds the people and Tasks it lacks, and replies with what was added', () => {
		const before = capture(['1']);
		const kept: KeptNote = { id: 900, key: '55:shot:7', captured: before.items, to: [ref('HumanUser', 20), ref('HumanUser', 99)], tasks: [ref('Task', 40)] };
		const now = capture();
		expect(noteWrite({ ...base, capture: now, kept })).toEqual({
			kind: 'update',
			id: 900,
			data: {
				subject: 'Set data for SMP_042_0010',
				content: expect.stringContaining('Slate 42A: takes 1, 2'),
				sg_onset_captured: now.items.join(' '),
				addressings_to: { multi_entity_update_mode: 'add', value: [ref('Group', 5)] },
				tasks: { multi_entity_update_mode: 'add', value: [ref('Task', 41)] }
			},
			reply: { entity: { type: 'Note', id: 900 }, content: ['Added since the last update:', 'Clean plate: 42A take 2', 'Slate 42A: take 2'].join('\n') }
		});
	});

	it('leaves the people and Tasks alone when none are new', () => {
		const kept: KeptNote = { id: 900, key: '55:shot:7', captured: capture(['1']).items, to: people.to, tasks: people.tasks };
		const write = noteWrite({ ...base, capture: capture(), kept });
		expect(write.kind === 'update' && Object.keys(write.data).sort()).toEqual(['content', 'sg_onset_captured', 'subject']);
	});
});
