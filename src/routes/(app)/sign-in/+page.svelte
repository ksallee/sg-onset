<script lang="ts">
	// Sign in to Flow PT: the site, then approval on the site itself. The flow is in
	// $lib/auth/sign-in.ts, the state in $lib/auth/session.svelte.ts, the copy in the `auth`
	// area of the catalogue. It sits in the shell, under Settings: a form column in the content pane
	// on an iPad, the phone column under 700 px (Page).
	import { onDestroy } from 'svelte';
	import Page from '$lib/components/ios/Page.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import { auth, completeSignIn, signOut } from '$lib/auth/session.svelte';
	import { requestSignIn, SignInError, waitForApproval, type PendingSignIn } from '$lib/auth/sign-in';
	import { failureText } from '$lib/i18n/authText';
	import { t } from '$lib/i18n/messages';

	let site = $state(auth.site ? new URL(auth.site).host : '');
	let busy = $state(false);
	let pending = $state<PendingSignIn | null>(null);
	let problem = $state('');
	let controller: AbortController | null = null;

	async function start(event?: SubmitEvent) {
		event?.preventDefault();
		controller?.abort();
		controller = new AbortController();
		const deps = { fetch, signal: controller.signal };
		problem = '';
		busy = true;
		try {
			pending = await requestSignIn(site, deps);
			completeSignIn(await waitForApproval(pending, deps));
		} catch (error) {
			problem = error instanceof SignInError ? failureText(error.code, error.reason) : failureText('refused');
		} finally {
			busy = false;
			pending = null;
		}
	}

	function cancel() {
		controller?.abort();
	}

	onDestroy(cancel);
</script>

<svelte:head><title>{t('auth.title')} · {t('app.name')}</title></svelte:head>

<Page width="form">
	<NavBar title={t('auth.title')} large back={{ href: '/settings', label: t('nav.settings') }} />

	{#if auth.status === 'signed-in'}
		<Section header={t('auth.signedIn.header')} footer={t('auth.signedIn.footer')}>
			<Row title={t('auth.site')} detail={auth.site ? new URL(auth.site).host : ''} />
			<Row title={t('auth.user')} detail={auth.user ?? ''} />
		</Section>
		<Section>
			<Row title={t('auth.signOut')} destructive onclick={signOut} />
		</Section>
	{:else if pending}
		<Section header={t('auth.waiting.header')} footer={t('auth.waiting.footer')}>
			<Row title={t('auth.waiting')} subtitle={new URL(pending.site).host} />
		</Section>
		<div class="actions">
			<!-- Opened from the tap itself, so no popup blocker stops it. -->
			<Button variant="filled" size="large" full onclick={() => pending && window.open(pending.url, '_blank', 'noopener')}>{t('auth.open')}</Button>
			<Button variant="plain" full onclick={cancel}>{t('auth.cancel')}</Button>
		</div>
	{:else}
		<form onsubmit={start} novalidate>
			<Section header={t('auth.site.header')} footer={auth.status === 'expired' ? t('auth.expired') : t('auth.site.footer')}>
				<Row title={siteField} />
			</Section>
			{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
			<div class="actions">
				<Button variant="filled" size="large" full type="submit" disabled={busy || site.trim() === ''}>
					{busy ? t('auth.asking') : t('auth.continue')}
				</Button>
			</div>
			{#if auth.status === 'signed-out'}<p class="note">{t('auth.signedOut.footer')}</p>{/if}
		</form>
	{/if}
</Page>

{#snippet siteField()}
	<input
		class="site"
		type="url"
		inputmode="url"
		autocomplete="url"
		autocapitalize="none"
		autocorrect="off"
		spellcheck="false"
		enterkeyhint="go"
		placeholder={t('auth.site.placeholder')}
		aria-label={t('auth.site.label')}
		bind:value={site}
		disabled={busy}
	/>
{/snippet}

<style>
	.site {
		width: 100%;
		min-height: 44px;
		padding-right: 16px;
		background: transparent;
		color: var(--label);
		font-size: 17px;
		letter-spacing: -0.43px;
		outline: none;
	}
	.site::placeholder {
		color: var(--label-3);
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0 var(--page-margin, 16px);
		margin-bottom: 24px;
	}
	.problem {
		margin: -20px calc(var(--page-margin, 16px) + 16px) 20px;
		font-size: 13px;
		line-height: 18px;
		color: var(--destructive);
	}
	.note {
		padding: 0 calc(var(--page-margin, 16px) + 16px);
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
</style>
