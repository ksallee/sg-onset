// The page of "Send set data to artists" (#106) as the screen drives it: read what Flow PT holds,
// show it, and on Send run the action. The calls are lib/fpt (sendSetData.ts); the words text.ts;
// what a failure means flow.ts. Nothing here writes before `send()`, which only a tap calls.
//
// The site's schema is read fresh into memory each time: the page needs nothing kept on the device,
// and a schema kept from before an admin enabled Set Shot would hide it.

import { createApi, type FptOptions } from '$lib/fpt/api';
import { memoryKeyValue } from '$lib/fpt/cache';
import { entityName } from '$lib/fpt/naming';
import { namingOf, type Resolution } from '$lib/fpt/schema';
import { sendKind } from '$lib/fpt/sendPlan';
import { previewSend, sendSetData, type SendPreview, type SendResult } from '$lib/fpt/sendSetData';
import { loadResolution } from '$lib/fpt/setup';
import { failureOf, type SendFailure } from './flow';
import type { SendRequest } from './request';
import type { PageProblem } from './text';

export type SendState =
	/** Not read yet: waits for a session on the site. */
	| { step: 'idle' }
	| { step: 'reading' }
	| { step: 'problem'; problem: PageProblem; setShot: string }
	| { step: 'failed'; failure: SendFailure; preview?: SendPreview }
	| { step: 'preview'; preview: SendPreview }
	| { step: 'sending'; preview: SendPreview }
	| { step: 'done'; preview: SendPreview; result: SendResult };

export interface SendIo {
	bearer: FptOptions['bearer'];
	fetch?: typeof fetch;
	online?: () => boolean;
}

export class SendDriver {
	state = $state.raw<SendState>({ step: 'idle' });
	#res: Resolution | undefined;

	constructor(
		private request: SendRequest,
		private io: SendIo
	) {}

	#options(): FptOptions {
		return { site: this.request.site, bearer: this.io.bearer, schemaCache: memoryKeyValue(), ...(this.io.fetch ? { fetch: this.io.fetch } : {}), ...(this.io.online ? { online: this.io.online } : {}) };
	}

	#online(): boolean {
		return this.io.online ? this.io.online() : typeof navigator === 'undefined' || navigator.onLine !== false;
	}

	/** Reads the site's schema and the rows selected. Writes nothing. */
	async read(): Promise<void> {
		if (this.state.step !== 'idle') return;
		this.state = { step: 'reading' };
		const options = this.#options();
		const api = createApi(options);
		try {
			this.#res = await loadResolution(api, options);
		} catch (error) {
			this.state = { step: 'failed', failure: failureOf(error, { online: this.#online(), step: 'schema' }) };
			return;
		}
		const kind = sendKind(this.request.entityType, this.#res);
		if (!kind) {
			const problem = this.request.entityType !== 'Shot' && !this.#res.entities.setShot ? 'noSetShot' : 'type';
			// The Set Shot entity under the name the site was set up with (#111).
			this.state = { step: 'problem', problem, setShot: entityName(namingOf(this.#res), 'setShot') };
			return;
		}
		try {
			this.state = { step: 'preview', preview: await previewSend(api, this.#res, this.request.projectId, { kind, ids: this.request.ids }) };
		} catch (error) {
			this.state = { step: 'failed', failure: failureOf(error, { online: this.#online(), step: 'read' }) };
		}
	}

	/** Runs the action. Call from the Send tap only. */
	async send(): Promise<void> {
		if (this.state.step !== 'preview' || !this.#res) return;
		const { preview } = this.state;
		this.state = { step: 'sending', preview };
		const api = createApi(this.#options());
		try {
			const result = await sendSetData(api, this.#res, this.request.projectId, { kind: preview.kind, ids: this.request.ids });
			this.state = { step: 'done', preview, result };
		} catch (error) {
			this.state = { step: 'failed', failure: failureOf(error, { online: this.#online(), step: 'read' }), preview };
		}
	}

	/** Start again: after a failure, or a new sign-in. */
	reset(): void {
		if (this.state.step === 'reading' || this.state.step === 'sending') return;
		this.state = { step: 'idle' };
	}
}
