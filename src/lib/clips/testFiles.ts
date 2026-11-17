// ALE and CSV files for the tests, shaped like the ones Silverstack, an ARRI camera and Avid write.
// The column lists are the real ones (research/ontologies/ale); the values are made up. Test only.

export type TestClip = {
	name: string;
	roll?: string;
	camera?: string;
	start?: string;
	/** ALE End: the frame after the last one. */
	end?: string;
	duration?: string;
	fps?: string;
};

export const SILVERSTACK_COLUMNS = [
	'ASA', 'Bin Name', 'CamRoll', 'Camera', 'Camera Asst.', 'Caption', 'Circled Take', 'Codec', 'Color Label', 'Colorspace', 'DOP', 'Description', 'Director', 'Drive', 'Duration', 'End', 'F-Stop', 'FPS', 'File Size', 'File path', 'Filetype', 'Frame count', 'Import Plugin', 'Lens', 'Location', 'Look Name', 'Mark IN', 'Mark OUT', 'Name', 'Producer', 'Production', 'Rating', 'Reel name', 'Resolution', 'Resource count', 'Resource sumary', 'Scene', 'Sensor Fps', 'Shoot Date', 'Shutter', 'Source File', 'Start', 'Take', 'UUID', 'Whitepoint'
];

export const ARRI_COLUMNS = [
	'Name', 'Source File', 'Clip', 'Duration', 'Tracks', 'Start', 'End', 'FPS', 'Original_video', 'Audio_format', 'Audio_sr', 'Audio_bit', 'Frame_width', 'Frame_height', 'Uuid', 'Sup_version', 'Exposure_index', 'Gamma', 'White_balance', 'Cc_shift', 'Look_name', 'Look_burned_in', 'Sensor_fps', 'Shutter_angle', 'Manufacturer', 'Camera_model', 'Camera_sn', 'Camera_id', 'Camera_index', 'Project_fps', 'Storage_sn', 'Production', 'Cinematographer', 'Operator', 'Director', 'Location', 'Company', 'User_info1', 'User_info2', 'Date_camera', 'Time_camera', 'Reel_name', 'Scene', 'Take', 'ASC_SAT', 'ASC_SOP', 'Look_user_lut', 'Lut_file_name', 'Nd_filterdensity', 'Focus_distance_unit', 'Lens_sn', 'Lens_type', 'Image_orientation', 'Image_sharpness', 'Image_detail', 'Image_denoising'
];

/** The first columns of an Avid bin export, Color to Shoot Date. */
export const AVID_COLUMNS = [
	'Color', 'Name', 'Creation Date', 'Duration', 'Auxiliary TC2', 'CFPS', 'Auxiliary TC1', 'Drive', 'IN-OUT', 'Ink Number', 'Film TC', 'Auxiliary Ink', 'End', 'Mark IN', 'KN Mark OUT', 'FPS', 'KN End', 'KN Mark IN', 'KN IN-OUT', 'Mark OUT', 'KN Start', 'Perf', 'KN Dur', 'Tracks', 'Auxiliary TC5', 'Pullin', 'Start', 'Project', 'Pullout', 'Sound TC', 'Offline', 'Tape', 'Video', 'AMA Plug-in', 'Take', 'Scene', 'Lock', 'Camera', 'TapeID', 'Camroll', 'Reel #', 'Audio SR', 'Reel', 'Shoot Date'
];

function ale(heading: string[], columns: string[], rows: Record<string, string>[], eol: string): string {
	const data = rows.map((r) => columns.map((c) => r[c] ?? '').join('\t'));
	return ['Heading', ...heading, '', 'Column', columns.join('\t'), '', 'Data', ...data].join(eol) + eol;
}

/** Silverstack: LF line ends, FPS in the heading and on each row, the roll in CamRoll and Reel name. */
export function silverstackAle(clips: TestClip[], fps = '24'): string {
	const rows = clips.map((c) => ({
		ASA: '800',
		'Bin Name': c.roll ?? '',
		CamRoll: c.roll ?? '',
		Camera: c.camera ?? '',
		'Circled Take': '-',
		Codec: 'ProRes 4444',
		'Color Label': 'No Label',
		Colorspace: 'LogC4',
		Drive: 'SHUTTLE_01',
		Duration: c.duration ?? '',
		End: c.end ?? '',
		'F-Stop': '0',
		FPS: c.fps ?? fps,
		Filetype: 'mov',
		'Import Plugin': 'ARRI Importer',
		Lens: 'Cooke S4/i 32mm',
		Name: c.name,
		Production: 'SAMPLE',
		'Reel name': c.roll ?? '',
		Resolution: '4608x3164',
		'Sensor Fps': c.fps ?? fps,
		'Shoot Date': '20261117',
		Shutter: '172.8',
		'Source File': `${c.name}.mov`,
		Start: c.start ?? '',
		Whitepoint: '4300'
	}));
	return ale(['FIELD_DELIM\tTABS', 'VIDEO_FORMAT\t1080', `FPS\t${fps}`], SILVERSTACK_COLUMNS, rows, '\n');
}

/** An ARRI camera: LF line ends, the roll in Reel_name, the camera letter in Camera_index. */
export function arriAle(clips: TestClip[], fps = '25'): string {
	const rows = clips.map((c) => ({
		Name: c.name,
		'Source File': `${c.name}.mxf`,
		Clip: c.name.slice(4, 8),
		Duration: c.duration ?? '',
		Tracks: 'V',
		Start: c.start ?? '',
		End: c.end ?? '',
		FPS: c.fps ?? fps,
		Original_video: 'ARRIRAW (4.6K 3:2)',
		Frame_width: '4608',
		Frame_height: '3164',
		Exposure_index: '800',
		Gamma: 'LOG-C4',
		White_balance: '4300',
		Sensor_fps: `${c.fps ?? fps}.000`,
		Shutter_angle: '172.8',
		Manufacturer: 'ARRI',
		Camera_model: 'ALEXA 35',
		Camera_sn: '60123',
		Camera_id: 'S8XY',
		Camera_index: c.camera ?? '',
		Project_fps: `${c.fps ?? fps}.000`,
		Date_camera: '20261117',
		Time_camera: '14h02m11s',
		Reel_name: c.roll ?? '',
		Lens_type: 'Cooke S4/i 32mm'
	}));
	return ale(['FIELD_DELIM\tTABS', 'VIDEO_FORMAT\tCUSTOM', 'AUDIO_FORMAT\t48kHz', `FPS\t${fps}`], ARRI_COLUMNS, rows, '\n');
}

/** An Avid bin export: CR line ends, names with the file extension, padded cells. */
export function avidAle(clips: TestClip[], fps = '24'): string {
	const rows = clips.map((c) => ({
		Color: '   ',
		Name: `${c.name}.mov`,
		'Creation Date': '11/17/26 6:43:08 PM',
		Duration: c.duration ?? '',
		CFPS: `${c.fps ?? fps}.00`,
		Drive: 'SHUTTLE_01',
		End: c.end ?? '',
		FPS: `${c.fps ?? fps}.00`,
		Tracks: 'V',
		Start: c.start ?? '',
		Project: 'SAMPLE',
		Video: 'Apple ProRes 4444',
		Camera: c.camera ?? '',
		Camroll: c.roll ?? '',
		'Shoot Date': '20261117'
	}));
	return ale(['FIELD_DELIM\tTABS', 'VIDEO_FORMAT\t1080', 'AUDIO_FORMAT\t48khz', `FPS\t${fps}`], AVID_COLUMNS, rows, '\r');
}
