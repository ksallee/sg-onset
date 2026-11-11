// Writes src/lib/theme/tokens.css (and compat.css, the old kit classes, temporary) from
// src/lib/theme/palette.ts: `node scripts/theme-tokens.mjs`.
// src/lib/theme/palette.test.ts fails while they differ.
import { writeFileSync } from 'node:fs';
import { renderCompatCss, renderCss } from '../src/lib/theme/css.ts';

writeFileSync(new URL('../src/lib/theme/tokens.css', import.meta.url), renderCss());
writeFileSync(new URL('../src/lib/theme/compat.css', import.meta.url), renderCompatCss());
console.log('Wrote src/lib/theme/tokens.css and compat.css');
