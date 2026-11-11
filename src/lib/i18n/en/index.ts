// The English catalogue: one file per area, merged here. Keys are `area.name`; `{name}` is filled
// by `t` (messages.ts). An area's strings go in that area's file, so two pieces of work never
// edit the same one (docs/areas.md). A key lives in one file only: `messages.test.ts` checks.

import { auth } from './auth';
import { common } from './common';
import { fields } from './fields';
import { gear } from './gear';
import { importMessages } from './import';
import { settings } from './settings';
import { slates } from './slates';
import { sync } from './sync';
import { take } from './take';
import { templates } from './templates';
import { validation } from './validation';
import { wrap } from './wrap';

/** The catalogue by area, as the files hold it. */
export const AREAS = { common, take, slates, gear, templates, settings, auth, fields, validation, import: importMessages, sync, wrap } as const;

export const en = {
	...common,
	...take,
	...slates,
	...gear,
	...templates,
	...settings,
	...auth,
	...fields,
	...validation,
	...importMessages,
	...sync,
	...wrap
} as const;
