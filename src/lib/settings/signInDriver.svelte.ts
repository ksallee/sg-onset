// Sign-in as the screen drives it, over signInFlow.ts: read the site, open the approval tab
// from the tap, ask the site, wait for the approval, and keep waiting through a lost network
// while the request lives. The calls are $lib/auth/sign-in; nothing here knows the wire.
import { requestSignIn, SignInError, waitForApproval, type ApprovedSignIn, type PendingSignIn, type SignInDeps } from '$lib/auth/sign-in';
import { approvalUrlOk, flow, START, tabPlan, type FlowEvent, type FlowState, type TabState } from './signInFlow';
import { readSite } from './siteInput';

/** A pending request lives about five minutes on the site (see $lib/auth/sign-in). */
const REQUEST_MS = 300_000;
/** How long to wait before asking again after a poll found no network. */
const RETRY_MS = 3000;

export interface SignInIo {
	fetch: typeof fetch;
	/** Running from the Home Screen: no tab is opened ahead of the answer. */
	standalone: boolean;
	/** Opens an empty tab, from the tap. Null when the browser blocked it. */
	openTab: () => Window | null;
	/** What the empty tab says while the site is asked. */
	tabText: string;
	/** The site passed the check: remember it. */
	onSite: (host: string) => void;
	onApproved: (approved: ApprovedSignIn) => void;
	now?: () => number;
}

const pause = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
	});

export class SignInDriver {
	state = $state.raw<FlowState>(START);
	#controller: AbortController | null = null;

	constructor(private io: SignInIo) {}

	#send(event: FlowEvent): boolean {
		const next = flow(this.state, event);
		if (next === this.state) return false;
		this.state = next;
		return true;
	}

	/** The site field changed: an old reason no longer applies. */
	edited(): void {
		this.#send({ type: 'edit' });
	}

	/** Continue. Call from the tap or the Return key itself: the approval tab opens from it. */
	async submit(input: string): Promise<void> {
		if (this.state.step !== 'form') return;
		const site = readSite(input);
		if (site.kind !== 'ok') {
			this.state = { step: 'form', problem: { code: 'bad-site', reason: site.kind === 'empty' ? 'empty' : site.reason } };
			return;
		}
		if (!this.#send({ type: 'submit', host: site.host })) return;
		this.io.onSite(site.host);

		let tab: Window | null = null;
		let tabState: TabState = 'link';
		if (tabPlan({ standalone: this.io.standalone }) === 'preopen') {
			tab = this.io.openTab();
			tabState = tab ? 'opened' : 'blocked';
			try {
				if (tab) {
					tab.document.title = this.io.tabText;
					tab.document.body.textContent = this.io.tabText;
				}
			} catch {
				// The tab is its own: it says nothing.
			}
		}

		const controller = new AbortController();
		this.#controller = controller;
		// Any answer at all means the network is there.
		const fetchOnline: typeof fetch = async (...args) => {
			const res = await this.io.fetch(...args);
			this.#send({ type: 'online' });
			return res;
		};
		const deps: SignInDeps = { fetch: fetchOnline, signal: controller.signal };

		let pending: PendingSignIn;
		try {
			pending = await requestSignIn(site.origin, deps);
			if (!approvalUrlOk(pending)) throw new SignInError('refused');
		} catch (error) {
			tab?.close();
			this.#fail(error);
			return;
		}
		if (tab) {
			try {
				tab.opener = null;
				tab.location.replace(pending.url);
			} catch {
				tab.close();
				tabState = 'blocked';
			}
		}
		if (!this.#send({ type: 'requested', pending, tab: tabState })) return;

		const now = this.io.now ?? Date.now;
		const deadline = now() + REQUEST_MS;
		for (;;) {
			try {
				const approved = await waitForApproval(pending, { ...deps, timeoutMs: Math.max(0, deadline - now()) });
				this.io.onApproved(approved);
				this.#send({ type: 'approved', user: approved.user, site: approved.site });
				return;
			} catch (error) {
				const offline = error instanceof SignInError && error.code === 'offline';
				if (!offline || controller.signal.aborted || now() >= deadline) {
					this.#fail(offline ? new SignInError('timeout') : error);
					return;
				}
				// No network just now. The request is alive on the site: say so and ask again.
				this.#send({ type: 'failed', code: 'offline' });
				await pause(RETRY_MS, controller.signal);
				if (controller.signal.aborted) return;
			}
		}
	}

	#fail(error: unknown): void {
		if (error instanceof SignInError) this.#send({ type: 'failed', code: error.code, reason: error.reason });
		else this.#send({ type: 'failed', code: 'refused' });
	}

	/** The person opened the approval page from the link. */
	reopened(): void {
		this.#send({ type: 'reopened' });
	}

	cancel(): void {
		this.#controller?.abort();
		this.#controller = null;
		this.#send({ type: 'cancel' });
	}
}
