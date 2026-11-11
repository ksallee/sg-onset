<script lang="ts">
	// Sign in to Flow PT: the site, then approval on the site itself, in a new tab. Every step
	// of the flow shows: asking the site, waiting for the approval (with the page to open again
	// and a way to cancel), approved, and each way it can fail, said in full. The steps are
	// lib/settings/signInFlow.ts, the work signInDriver.svelte.ts, the calls $lib/auth/sign-in,
	// the copy the `auth` area of the catalogue. Once approved the person returns to where they
	// were: the `next` of the link, else the page they came from.
	import { onDestroy } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CircleCheck, WifiOff } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { activeNav } from '$lib/app/nav';
	import { settings } from '$lib/app/settings.svelte';
	import { auth, completeSignIn, signOut } from '$lib/auth/session.svelte';
	import { failureText } from '$lib/i18n/authText';
	import { t } from '$lib/i18n/messages';
	import { readStandalone } from '$lib/pwa/platform';
	import { device } from '$lib/settings/device.svelte';
	import { SignInDriver } from '$lib/settings/signInDriver.svelte';
	import { returnPath } from '$lib/settings/signInFlow';
	import { readSite } from '$lib/settings/siteInput';
	import SideColumns from '$lib/settings/ui/SideColumns.svelte';

	/** How long the approved state shows before the person is taken back. */
	const RETURN_MS = 1400;

	// Where to go back to.
	let from = $state<string | null>(null);
	afterNavigate((nav) => {
		if (nav.from) from = nav.from.url.pathname + nav.from.url.search;
	});
	const next = $derived(returnPath(page.url.searchParams.get('next'), from));
	const backLabel = $derived.by(() => {
		const nav = activeNav(next.split(/[?#]/)[0]);
		return nav ? t(nav.labelKey) : t('common.back');
	});

	// The site: the one signed in to last, else the one typed last.
	let site = $state(auth.site ? new URL(auth.site).host : (device.value.lastSite ?? ''));
	const read = $derived(readSite(site));
	const resolved = $derived(read.kind === 'ok' && read.host !== site.trim().toLowerCase() ? read.host : '');

	let timer: ReturnType<typeof setTimeout> | undefined;
	const flow = new SignInDriver({
		fetch: (...args) => fetch(...args),
		standalone: readStandalone(),
		openTab: () => window.open('', '_blank'),
		tabText: t('auth.asking'),
		onSite: (host) => {
			site = host;
			device.update({ lastSite: host });
		},
		onApproved: (approved) => {
			completeSignIn(approved);
			timer = setTimeout(done, RETURN_MS);
		}
	});
	const step = $derived(flow.state);
	const problem = $derived(step.step === 'form' && step.problem ? failureText(step.problem.code, step.problem.reason) : '');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void flow.submit(site);
	}
	function done() {
		clearTimeout(timer);
		void goto(next, { replaceState: true });
	}
	onDestroy(() => {
		clearTimeout(timer);
		flow.cancel();
	});
</script>

<svelte:head><title>{t('auth.title')} · {t('app.name')}</title></svelte:head>

<Page width="columns">
	<NavBar title={t('auth.title')} large back={{ href: next, label: backLabel }} />

	<SideColumns hand={settings.value.hand}>
		{#snippet main()}
			{#if step.step === 'approved'}
				<div class="state" role="status">
					<span class="mark good" aria-hidden="true"><CircleCheck class="size-[30px]" strokeWidth={2} /></span>
					<h2>{t('auth.approved')}</h2>
					<p class="who">{step.user}</p>
					<p class="where">{new URL(step.site).host}</p>
					<p>{t('auth.approved.detail')}</p>
				</div>
				<div class="actions">
					<Button variant="filled" size="large" full onclick={done}>{t('auth.done')}</Button>
				</div>
			{:else if step.step === 'waiting'}
				{@const host = new URL(step.pending.site).host}
				<div class="state" role="status">
					{#if step.offline}
						<span class="mark" aria-hidden="true"><WifiOff class="size-[28px]" strokeWidth={2} /></span>
					{:else}
						<span class="mark pulse" aria-hidden="true"><span></span></span>
					{/if}
					<h2>{t('auth.waiting')}</h2>
					<p class="where">{host}</p>
					<p>{step.offline ? t('auth.waiting.offline') : step.tab === 'blocked' ? t('auth.waiting.blocked') : step.tab === 'link' ? t('auth.waiting.link') : t('auth.waiting.footer')}</p>
				</div>
				<div class="actions">
					<!-- A real link, opened by the tap itself: no popup blocker stops it. -->
					<a class="open" class:quiet={step.tab === 'opened'} href={step.pending.url} target="_blank" rel="noopener noreferrer" onclick={() => flow.reopened()}>
						{step.tab === 'opened' ? t('auth.open.again') : t('auth.open')}
					</a>
					<Button variant="plain" size="large" full onclick={() => flow.cancel()}>{t('auth.cancel')}</Button>
				</div>
			{:else if auth.status === 'signed-in'}
				<Section header={t('auth.signedIn.header')} footer={t('auth.signedIn.footer')}>
					<Row title={t('auth.user')} detail={auth.user ?? ''} />
					<Row title={t('auth.site')} detail={auth.site ? new URL(auth.site).host : ''} />
				</Section>
				<Section footer={t('auth.signOut.footer')}>
					<Row title={t('auth.signOut')} destructive onclick={signOut} />
				</Section>
			{:else}
				<form onsubmit={submit} novalidate>
					<Section header={t('auth.site.header')}>
						<div class="field" class:invalid={!!problem} role="listitem">
							<input
								type="text"
								inputmode="url"
								autocomplete="url"
								autocapitalize="none"
								autocorrect="off"
								spellcheck="false"
								enterkeyhint="go"
								placeholder={t('auth.site.placeholder')}
								aria-label={t('auth.site.label')}
								aria-invalid={problem ? true : undefined}
								aria-describedby="site-says"
								bind:value={site}
								oninput={() => flow.edited()}
								readonly={step.step === 'asking'}
							/>
						</div>
					</Section>
					<div class="says" id="site-says">
						{#if problem}
							<p class="problem" role="alert">{problem}</p>
						{:else if resolved}
							<p class="resolved">{t('auth.site.resolved', { host: resolved })}</p>
						{:else if auth.status === 'expired'}
							<p>{t('auth.expired')}</p>
						{:else}
							<p>{t('auth.site.footer')}</p>
						{/if}
					</div>
					<div class="actions">
						<Button variant="filled" size="large" full type="submit" disabled={step.step === 'asking'}>
							{step.step === 'asking' ? t('auth.asking') : t('auth.continue')}
						</Button>
						{#if step.step === 'asking'}
							<Button variant="plain" size="large" full onclick={() => flow.cancel()}>{t('auth.cancel')}</Button>
						{/if}
					</div>
					<p class="next">{t('auth.next')}</p>
					<p class="next">{t('auth.optional')}</p>
				</form>
			{/if}
		{/snippet}

		{#snippet after()}
			<div class="about">
				<p class="lead">{t('auth.lead')}</p>
				<h2 class="section-header">{t('auth.how')}</h2>
				<ol>
					<li>{t('auth.how.1')}</li>
					<li>{t('auth.how.2')}</li>
					<li>{t('auth.how.3')}</li>
				</ol>
				<p>{t('auth.password')}</p>
				<p>{t('auth.signedOut.footer')}</p>
			</div>
		{/snippet}
	</SideColumns>
</Page>

<style>
	.field {
		display: flex;
		padding: 0 16px;
		background: var(--group-bg, var(--cell));
	}
	.field input {
		flex: 1;
		min-width: 0;
		min-height: max(50px, var(--touch, 44px));
		background: transparent;
		color: var(--label);
		font-size: 17px;
		letter-spacing: -0.43px;
		outline: none;
	}
	.field input::placeholder {
		color: var(--label-3);
	}
	.field input:read-only {
		color: var(--label-2);
	}
	.says {
		margin: -26px calc(var(--page-margin, 16px) + 16px) 22px;
		min-height: 36px;
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
	}
	.says p {
		overflow-wrap: anywhere;
	}
	.problem {
		color: var(--destructive);
	}
	.resolved {
		color: var(--label);
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 16px;
	}
	.next {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		margin-bottom: 32px;
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
		text-align: center;
	}

	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin: 0 var(--page-margin, 16px) 20px;
		padding: 28px 20px 24px;
		border-radius: 24px;
		background: var(--group-bg, var(--cell));
		text-align: center;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.state h2 {
		margin-top: 10px;
		font-size: 22px;
		line-height: 28px;
		font-weight: 700;
		letter-spacing: -0.26px;
		color: var(--label);
	}
	.state .who,
	.state .where {
		max-width: 100%;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		overflow-wrap: anywhere;
	}
	.state .who + .where {
		color: var(--label-2);
	}
	.state p:last-child {
		margin-top: 8px;
		max-width: 36ch;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--fill-3);
		color: var(--label-2);
	}
	.mark.good {
		color: var(--tint);
	}
	.mark.pulse span {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--tint);
		animation: wait 1.6s ease-in-out infinite;
	}
	@keyframes wait {
		50% {
			transform: scale(0.6);
			opacity: 0.45;
		}
	}
	.open {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50px;
		padding: 6px 20px;
		border-radius: 999px;
		background: var(--tint);
		color: var(--on-tint);
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.43px;
		text-align: center;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: manipulation;
		transition: opacity var(--dur-press);
	}
	.open.quiet {
		background: var(--fill-2);
		color: var(--tint);
	}
	.open:active {
		opacity: 0.55;
		transition: none;
	}
	.open:focus-visible {
		outline: 2px solid var(--tint);
		outline-offset: 2px;
	}

	.about {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 0 calc(var(--page-margin, 16px) + 16px) 32px;
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	.about .lead {
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.about h2 {
		margin-top: 10px;
	}
	.about ol {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding-left: 1.4em;
		list-style: decimal;
		color: var(--label);
	}
</style>
