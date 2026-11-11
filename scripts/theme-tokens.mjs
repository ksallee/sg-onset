// Writes src/lib/theme/tokens.css from
// src/lib/theme/palette.ts: `node scripts/theme-tokens.mjs`.
// src/lib/theme/palette.test.ts fails while they differ.
import { writeFileSync } from 'node:fs';
import { renderCss } from '../src/lib/theme/css.ts';

writeFileSync(new URL('../src/lib/theme/tokens.css', import.meta.url), renderCss());
console.log('Wrote src/lib/theme/tokens.css');
