// The reference log: what was captured for a slate on other devices, the kinds, and the project's
// own kinds in Settings. Words follow docs/vocabulary.md.

export const references = {
	'references.kind.hdri360': 'HDRI 360',
	'references.kind.video360': '360 video',
	'references.kind.hdrReference': 'HDR reference',
	'references.kind.witnessCamera': 'Witness camera',
	'references.kind.lidarScan': 'Lidar scan',
	'references.kind.texturedModel': 'Textured model',
	'references.kind.photogrammetry': 'Photogrammetry',
	'references.kind.splat': 'Splat',
	'references.kind.other': 'Other',

	'references.header': 'References',
	'references.footer': 'Captured on other devices. The files stay on them. Tap a kind to add one.',
	'references.none': 'None yet.',
	'references.loggedOn': 'Logged on {slate}',
	'references.add': 'Add a reference',
	'references.add.kind': 'Add {kind}',
	'references.new.add': 'Add',
	'references.new.placeholder': 'HDRI_0412',
	'references.new.footer': 'The name of the file or folder on the device.',
	'references.new.carried': 'Also from the last one: {detail}.',
	'references.delete': 'Delete Reference',
	'references.delete.footer': 'Only the entry here is deleted. Undo brings it back.',

	'references.kinds': 'Reference kinds',
	'references.kinds.title': 'Reference Kinds',
	'references.kinds.builtIn': 'Built in',
	'references.kinds.project': 'This project',
	'references.kinds.project.footer': 'Kinds this project adds, for this device. A reference keeps its kind when the kind is deleted.',
	'references.kinds.new': 'New kind',
	'references.kinds.new.placeholder': 'Drone survey',
	'references.kinds.add': 'Add',
	'references.kinds.empty': 'Give the kind a name.',
	'references.kinds.taken': 'That kind is already there.',
	'references.kinds.delete': 'Delete'
} as const;
