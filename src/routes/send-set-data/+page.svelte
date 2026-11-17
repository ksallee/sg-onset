<script lang="ts">
	// "Send set data to artists" (#106): the page Flow PT's Action Menu Item opens, through the route
	// at /action/send-set-data, on a desktop after wrap. It needs no project on the device. With the
	// person's own session for the site Flow PT named (sign in here first if not), it reads what
	// Flow PT holds, says what Send will do, and runs only on the tap: a request from another site
	// never writes on its own. The address is lib/send/request.ts, the steps sendDriver.svelte.ts,
	// the words text.ts and the `send` area of the catalogue.
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { CircleCheck, WifiOff } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import { auth, bearer, completeSignIn } from '$lib/auth/session.svelte';
	import { failureText as signInFailure } from '$lib/i18n/authText';
	import { t } from '$lib/i18n/messages';
	import { readStandalone } from '$lib/pwa/platform';
	import { sessionNeed } from '$lib/send/flow';
	import { readPage } from '$lib/send/request';
	import { SendDriver } from '$lib/send/sendDriver.svelte';
	import { countText, failureText, missingText, problemText, shotLine, signInText, summaryText } from '$lib/send/text';
	import { SignInDriver } from '$lib/settings/signInDriver.svelte';

	// Read once: the page acts on the request it was opened with.
	const given = readPage(page.url.searchParams);
	const request = given.kind === 'request' ? given.request : undefined;
	const driver = request ? new SendDriver(request, { bearer }) : undefined;
	const need = $derived(request ? sessionNeed({ status: auth.status, site: auth.site }, request.site) : 'ready');
	const hostOf = (site: string | null) => (site ? new URL(site).host : '');

	$effect(() => {
		if (driver && need === 'ready' && driver.state.step === 'idle') void driver.read();
	});

	const signIn = new SignInDriver({
		fetch: (...args) => fetch(...args),
		standalone: readStandalone(),
		openTab: () => window.open('', '_blank'),
		tabText: t('auth.asking'),
		onSite: () => {},
		onApproved: (approved) => {
			completeSignIn(approved);
			driver?.reset();
		}
	});
	const signInStep = $derived(signIn.state);
	const signInProblem = $derived(signInStep.step === 'form' && signInStep.problem ? signInFailure(signInStep.problem.code, signInStep.problem.reason) : '');
	onDestroy(() => signIn.cancel());

	const state = $derived(driver?.state ?? { step: 'idle' as const });
	const preview = $derived('preview' in state ? state.preview : undefined);
	const result = $derived(state.step === 'done' ? state.result : undefined);
	const again = $derived(!!result && (result.stopped || result.shots.some((r) => r.slatesFailed || r.note === 'failed')));
</script>

<svelte:head><title>{t('send.title')} · {t('app.name')}</title></svelte:head>

<Page width="form">
	<NavBar title={t('send.title')} large />
	<p class="lead">{t('send.lead')}</p>

	{#if given.kind !== 'request'}
		<p class="say problem" role="alert">{problemText(given.kind === 'none' ? 'none' : given.problem)}</p>
	{:else if request && need !== 'ready'}
		{#if signInStep.step === 'waiting'}
			{@const host = new URL(signInStep.pending.site).host}
			<div class="box"><div class="state" role="status">
				{#if signInStep.offline}
					<span class="mark" aria-hidden="true"><WifiOff class="size-[28px]" strokeWidth={2} /></span>
				{:else}
					<span class="mark pulse" aria-hidden="true"><span></span></span>
				{/if}
				<h2>{t('auth.waiting')}</h2>
				<p class="where">{host}</p>
				<p>{signInStep.offline ? t('auth.waiting.offline') : signInStep.tab === 'blocked' ? t('auth.waiting.blocked') : signInStep.tab === 'link' ? t('auth.waiting.link') : t('auth.waiting.footer')}</p>
			</div></div>
			<div class="actions">
				<!-- A real link, opened by the tap itself: no popup blocker stops it. -->
				<a class="open" class:quiet={signInStep.tab === 'opened'} href={signInStep.pending.url} target="_blank" rel="noopener noreferrer" onclick={() => signIn.reopened()}>
					{signInStep.tab === 'opened' ? t('auth.open.again') : t('auth.open')}
				</a>
				<Button variant="plain" size="large" full onclick={() => signIn.cancel()}>{t('auth.cancel')}</Button>
			</div>
		{:else}
			<p class="say">{signInText(need, request.host, hostOf(auth.site))}</p>
			{#if signInProblem}<p class="say problem" role="alert">{signInProblem}</p>{/if}
			<div class="actions">
				<Button variant="filled" size="large" full disabled={signInStep.step === 'asking'} onclick={() => void signIn.submit(request.host)}>
					{signInStep.step === 'asking' ? t('auth.asking') : t('send.signIn.button')}
				</Button>
			</div>
			<p class="note">{t('auth.password')}</p>
		{/if}
	{:else if request}
		{#if preview}
			<Section header={t('send.where')}>
				<Row title={t('send.project')} detail={preview.project} />
				<Row title={t('send.site')} detail={request.host} />
			</Section>
		{/if}

		{#if state.step === 'idle' || state.step === 'reading'}
			<p class="say" role="status">{t('send.reading')}</p>
		{:else if state.step === 'problem'}
			<p class="say problem" role="alert">{problemText(state.problem, request.entityType)}</p>
		{:else if state.step === 'failed'}
			<p class="say problem" role="alert">{failureText(state.failure)}</p>
			{#if state.failure !== 'session' && state.failure !== 'setup'}
				<div class="actions">
					<Button variant="filled" size="large" full onclick={() => driver?.reset()}>{t('send.retry')}</Button>
				</div>
			{/if}
		{:else if preview && (state.step === 'preview' || state.step === 'sending')}
			{#if preview.rows.length}
				<p class="say summary">{summaryText({ kind: preview.kind, count: preview.rows.length, notes: preview.notes })}</p>
				<Section header={countText(preview.kind, preview.rows.length)} footer={preview.missing ? missingText(preview.missing) : undefined}>
					{#each preview.rows as row (row.id)}
						<Row title={row.code} />
					{/each}
				</Section>
				{#if !preview.notes}<p class="say">{t('send.notes.missing')}</p>{/if}
				<div class="actions">
					<Button variant="filled" size="large" full disabled={state.step === 'sending'} onclick={() => void driver?.send()}>
						{state.step === 'sending' ? t('send.sending') : t('send.send')}
					</Button>
				</div>
				<p class="note">{t('send.footer', { user: auth.user ?? '' })}</p>
			{:else}
				<p class="say problem" role="alert">{t('send.nothing')}</p>
			{/if}
		{:else if result}
			<div class="box"><div class="state" role="status">
				<span class="mark good" aria-hidden="true"><CircleCheck class="size-[30px]" strokeWidth={2} /></span>
				<h2>{t('send.done')}</h2>
				{#if result.stopped}<p>{t('send.report.stopped')}</p>{:else if again}<p>{t('send.report.again')}</p>{/if}
			</div></div>
			{#if result.shots.length}
				<Section header={countText('shot', result.shots.length)} footer={preview && !preview.notes ? t('send.notes.missing') : undefined}>
					{#each result.shots as r (r.shot.id)}
						<div class="line" role="listitem">
							<span class="code">{r.shot.code}</span>
							<span class="what">{shotLine(r)}</span>
						</div>
					{/each}
				</Section>
			{/if}
			{#if result.waiting.length}
				<Section header={t('send.waiting.header')}>
					{#each result.waiting as w (w.id)}
						<div class="line" role="listitem">
							<span class="code">{w.code}</span>
							<span class="what">{t('send.report.waiting')}</span>
						</div>
					{/each}
				</Section>
			{/if}
			{#if !result.shots.length && !result.waiting.length}<p class="say">{t('send.report.none')}</p>{/if}
			{#if result.missing}<p class="say">{missingText(result.missing)}</p>{/if}
			<p class="note">{t('send.done.footer')}</p>
		{/if}
	{/if}
</Page>

<style>
	.lead,
	.say,
	.note {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		overflow-wrap: anywhere;
	}
	.lead {
		margin-bottom: 24px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label-2);
	}
	.say {
		margin-bottom: 20px;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
	}
	.say.summary {
		font-weight: 600;
	}
	.problem {
		color: var(--destructive);
	}
	.note {
		margin-bottom: 32px;
		font-size: 13px;
		line-height: 18px;
		letter-spacing: -0.08px;
		color: var(--label-2);
		text-align: center;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 16px;
	}
	.line {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 11px 16px;
		background: var(--group-bg, var(--cell));
	}
	.line + .line {
		box-shadow: inset 0 0.5px 0 var(--separator);
	}
	.code {
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		overflow-wrap: anywhere;
	}
	.what {
		font-size: 15px;
		line-height: 20px;
		letter-spacing: -0.23px;
		color: var(--label-2);
	}
	/* The page holds its children to the column with auto margins: the box keeps them, the state sits inside. */
	.box {
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 20px;
	}
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
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
	.state .where {
		max-width: 100%;
		font-size: 17px;
		line-height: 22px;
		letter-spacing: -0.43px;
		color: var(--label);
		overflow-wrap: anywhere;
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
</style>
