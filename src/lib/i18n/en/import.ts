// What a gear import reports: one string per key the model's `gearImport.ts` returns, read
// through `importIssueText` (modelText.ts). The rest of the import screen's strings go here too.
// Owned by gear and CSV import; `model.test.ts` fails when a key has no string.

export const importMessages = {
	'import.noHeader': 'No header row with a model column was found. Nothing was imported.',
	'import.missingModel': 'Row {row}: no model. The row was left out.',
	'import.badValue': 'Row {row}, {column}: “{value}” could not be read. The value was left out.',
	'import.incompleteSize': 'Row {row}, {column}: a size needs a width and a height. The value was left out.',
	'import.noFocalLength': 'Row {row}: no focal length. Add it in the app.',

	'import.title': 'Import from CSV',
	'import.kind': 'What the file lists',
	'import.source': 'File',
	'import.choose': 'Choose a CSV File',
	'import.chosen': '{name}',
	'import.paste': 'Or paste the text',
	'import.paste.placeholder': 'Make,Model,Serial number…',
	'import.paste.footer': 'Comma, semicolon or tab between columns. The first row with a model column is the header.',
	'import.sample': 'Download a Sample CSV',
	'import.sample.footer': 'The columns this import reads, with made-up rows.',
	'import.clear': 'Clear',
	'import.readError': 'That file could not be read.',

	'import.summary': 'Before anything is saved',
	'import.summary.empty': 'Choose a file or paste its text. The rows show here before anything is saved.',
	'import.summary.rows': 'Rows read',
	'import.summary.ready': 'Ready',
	'import.summary.warning': 'With a value left out',
	'import.summary.dropped': 'Left out',
	'import.summary.duplicate': 'Already in this project',
	'import.duplicates': 'Duplicates',
	'import.duplicates.skip': 'Skip',
	'import.duplicates.add': 'Add anyway',
	'import.duplicates.footer': 'Same model and serial number as gear already here, or as an earlier row. With no serial number, the same model.',

	'import.columns': 'Columns',
	'import.columns.read': '{header} → {field}',
	'import.columns.ignored': 'Not read: {headers}',
	'import.columns.headerRow': 'Header on row {row}.',

	'import.rows': 'Rows',
	'import.row': 'Row {row}',
	'import.row.ready': 'Ready',
	'import.row.duplicate': 'Already in this project',
	'import.row.duplicateWithin': 'Same as row {row}',
	'import.row.skipped': 'Skipped',

	'import.commit.camera.one': 'Import {n} Camera',
	'import.commit.camera.other': 'Import {n} Cameras',
	'import.commit.lens.one': 'Import {n} Lens',
	'import.commit.lens.other': 'Import {n} Lenses',
	'import.row.left': 'Left out',
	'import.commit.none': 'Nothing to Import',
	'import.done': '{what} imported'
} as const;
