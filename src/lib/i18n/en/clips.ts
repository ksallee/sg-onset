// The import of the DIT's clips (#109): an ALE or CSV fills clip name, camera roll and timecode on
// the day's takes. Reached from the Slates list. Words follow docs/vocabulary.md.

export const clips = {
	'clips.open': 'Import Clips',
	'clips.open.sub': 'ALE or CSV from the DIT',

	'clips.title': 'Import Clips',
	'clips.source': 'File',
	'clips.source.footer': 'The day’s ALE or CSV from Silverstack, Pomfort or a camera report app. It is read on this device.',
	'clips.choose': 'Choose an ALE or CSV File',
	'clips.chooseAgain': 'Choose Another File',
	'clips.file.ale': 'ALE · {n} rows',
	'clips.file.csv': 'CSV · {n} rows',
	'clips.readError': 'That file could not be read.',
	'clips.noTable': 'No columns found in this file.',

	'clips.columns': 'Columns',
	'clips.columns.footer': 'Known by name. Pick the column for any the file names its own way.',
	'clips.columns.none': 'Not in the file',
	'clips.column.duration': 'Duration',
	'clips.column.fps': 'Timecode rate',

	'clips.issue.noNameColumn': 'Pick the column with the clip name.',
	'clips.issue.noRate': 'The file names no timecode rate. Read at {rate} fps.',
	'clips.issue.noName': 'Row {row}: no clip name. The row was left out.',
	'clips.issue.badTimecode': 'Row {row}, {column}: “{value}” is not timecode. The value was left out.',

	'clips.earlier': 'Earlier imports of this day',
	'clips.earlier.footer': 'A new import updates what these filled, where nobody changed it since.',
	'clips.earlier.row': '{time} · {file}',
	'clips.earlier.noFile': 'No file name',
	'clips.earlier.takes.one': '{n} take',
	'clips.earlier.takes.other': '{n} takes',

	'clips.summary': 'Before anything is saved',
	'clips.summary.empty': 'Choose a file. Each clip and its take show here before anything is saved.',
	'clips.summary.noTakes': 'This day has no takes yet. Every clip is left over.',
	'clips.summary.clips': 'Clips in the file',
	'clips.summary.time': 'Matched by time of day',
	'clips.summary.order': 'Matched by roll and order',
	'clips.summary.picked': 'Picked by hand',
	'clips.summary.left': 'Left over',
	'clips.summary.fill': 'Fields to fill',
	'clips.summary.update': 'Fields to update',
	'clips.summary.kept': 'Typed values kept',
	'clips.summary.footer': 'Fills empty fields. Updates what an earlier import filled and nobody changed since. Never changes what a person typed.',

	'clips.matches': 'Matches',
	'clips.matches.footer': 'Tap a clip to put it on another take.',
	'clips.left': 'Left over',
	'clips.left.footer': 'Clips with no take. Tap one to pick its take.',

	'clips.row.take': 'Slate {slate}, take {take}',
	'clips.row.takeCam': 'Slate {slate}, take {take} · {camera}',
	'clips.how.time': 'By time of day',
	'clips.how.order': 'By roll and order',
	'clips.how.picked': 'Picked',
	'clips.row.fills': 'Fills: {fields}',
	'clips.row.update': '{field}: {from} to {to}',
	'clips.row.kept': '{field} kept: {from}. The file has {to}.',
	'clips.row.nothing': 'Nothing new',
	'clips.row.timecode': '{start} to {end}',
	'clips.row.noTimecode': 'No timecode',

	'clips.pick.none': 'No take',
	'clips.pick.none.footer': 'The clip stays out of the import.',
	'clips.pick.slate': 'Slate {slate}',
	'clips.pick.take': 'Take {take}',
	'clips.pick.takeCam': 'Take {take} · {camera}',
	'clips.pick.has': 'Matched to {clip}',
	'clips.pick.notStarted': 'Never started',

	'clips.commit.one': 'Fill {n} Take',
	'clips.commit.other': 'Fill {n} Takes',
	'clips.commit.none': 'Nothing to Fill',
	'clips.done.one': 'Clips imported on {n} take',
	'clips.done.other': 'Clips imported on {n} takes'
} as const;
