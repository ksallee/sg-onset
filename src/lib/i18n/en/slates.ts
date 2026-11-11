// Strings of the slates list and the slate page. Owned by slates, templates and bulk edit.

export const slates = {
	'slates.title': 'Slates',
	'slates.new': 'New Slate',
	'slates.new.title': 'New Slate',
	'slates.new.name': 'Slate',
	'slates.new.placeholder': '42A',
	'slates.new.footer': 'A blank slate on {day}.',
	'slates.new.taken': 'This day already has a slate with that name.',
	'slates.empty': 'No Slates',
	'slates.empty.message': 'A slate holds the takes of one setup. Make the first one for this shoot day.',
	'slates.day.empty': 'No slate on this day.',
	'slates.day.current': 'Shooting',
	'slates.takes.none': 'No takes',
	'slates.takes.one': '1 take',
	'slates.takes.many': '{n} takes',
	'slates.scene': 'Scene {scene}',
	'slates.slate': 'Slate {slate}',
	'slates.missing': 'Slate Not Found',
	'slates.missing.message': 'It may have been deleted on this device.',
	'slates.detail.header': 'Slate',
	'slates.detail.takes': 'Takes',
	'slates.detail.takes.none': 'No take yet.',
	'slates.detail.shoot': 'Shoot This Slate',
	'slates.detail.delete': 'Delete Slate',
	'slates.detail.footer': 'More fields, templates and bulk edit come with the slates work.'
} as const;
