// What a gear import reports: one string per key the model's `gearImport.ts` returns, read
// through `importIssueText` (modelText.ts). The rest of the import screen's strings go here too.
// Owned by gear and CSV import; `model.test.ts` fails when a key has no string.

export const importMessages = {
	'import.noHeader': 'No header row with a model column was found. Nothing was imported.',
	'import.missingModel': 'Row {row}: no model. The row was left out.',
	'import.badValue': 'Row {row}, {column}: “{value}” could not be read. The value was left out.',
	'import.incompleteSize': 'Row {row}, {column}: a size needs a width and a height. The value was left out.',
	'import.noFocalLength': 'Row {row}: no focal length. Add it in the app.'
} as const;
