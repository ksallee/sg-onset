import { describe, expect, it } from 'vitest';
import { DIAGRAM_SHOWN, diagramFilename, diagramPrefix } from './diagrams';

describe('the setup diagram image of a slate', () => {
	it('is named for the slate and the file, so a lookup by slate finds every image of it', () => {
		expect(diagramFilename('s1', 'b1')).toBe('onset_diagram_s1_b1.png');
		expect(diagramFilename('s1', 'b1').startsWith(diagramPrefix('s1'))).toBe(true);
	});
	it('holds no space and no capital, as a photo’s name', () => {
		expect(diagramFilename('Sl 1', 'B1')).toBe('onset_diagram_sl_1_b1.png');
	});
	it('says what it is to a person', () => {
		expect(DIAGRAM_SHOWN).toBe('Setup diagram');
	});
});
