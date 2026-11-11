// What is wrong with a value: one string per key the model's `validate.ts` and `fieldText.ts`
// return. Owned by the shell; `model.test.ts` fails when a key has no string. Read them through
// `issueText` (modelText.ts), which fills `{unit}` and `{type}`.

export const validation = {
	'validation.required': 'This is needed.',
	'validation.type': 'That is not {type}.',
	'validation.integer': 'Whole numbers only.',
	'validation.above': 'Must be more than {above}{unit}.',
	'validation.min': 'Must be {min}{unit} or more.',
	'validation.max': 'Must be {max}{unit} or less.',
	'validation.infinity': 'This cannot be infinity.',
	'validation.unit': 'That unit is not known.',
	'validation.rational': 'Type a number, or two whole numbers as 24000/1001.',
	'validation.option': 'Pick one of: {options}.',
	'validation.date': 'That is not a date.',
	'validation.timestamp': 'That is not a time.',
	'validation.timecode': 'A timecode reads HH:MM:SS:FF.',
	'validation.endBeforeStart': 'The end is before the start.',
	'validation.focalRange': 'The long end must be longer than the short end.',

	'validation.typeName.string': 'text',
	'validation.typeName.date': 'a date',
	'validation.typeName.timestamp': 'a time',
	'validation.typeName.timecode': 'a timecode',
	'validation.typeName.ref': 'a record',
	'validation.typeName.enum': 'one of the choices',
	'validation.typeName.integer': 'a whole number',
	'validation.typeName.number': 'a number',
	'validation.typeName.boolean': 'yes or no',
	'validation.typeName.length': 'a length',
	'validation.typeName.rational': 'a rate or a ratio',
	'validation.typeName.dimensions': 'a width and a height',
	'validation.typeName.stringList': 'a list'
} as const;
