<script lang="ts">
	// Sign in to Flow PT: the site, then approval on the site itself. The flow is in
	// $lib/auth/sign-in.ts, the state in $lib/auth/session.svelte.ts, the copy in
	// $lib/auth/strings.ts.
	import { onDestroy } from 'svelte';
	import Screen from '$lib/components/ios/Screen.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import { auth, completeSignIn, signOut } from '$lib/auth/session.svelte';
	import { requestSignIn, SignInError, waitForApproval, type PendingSignIn } from '$lib/auth/sign-in';
	import { failureText, SIGN_IN as T } from '$lib/auth/strings';

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

<svelte:head><title>{T.title} · sg-onset</title></svelte:head>

<Screen>
	<NavBar title={T.title} large back={{ href: '/', label: T.back }} />

	{#if auth.status === 'signed-in'}
		<Section header={T.signedInHeader} footer={T.signedInFooter}>
			<Row title={T.site} detail={auth.site ? new URL(auth.site).host : ''} />
			<Row title={T.user} detail={auth.user ?? ''} />
		</Section>
		<Section>
			<Row title={T.signOut} destructive onclick={signOut} />
		</Section>
	{:else if pending}
		<Section header={T.waitingHeader} footer={T.waitingFooter}>
			<Row title={T.waiting} subtitle={new URL(pending.site).host} />
		</Section>
		<div class="actions">
			<!-- Opened from the tap itself, so no popup blocker stops it. -->
			<Button variant="filled" size="large" full onclick={() => pending && window.open(pending.url, '_blank', 'noopener')}>{T.open}</Button>
			<Button variant="plain" full onclick={cancel}>{T.cancel}</Button>
		</div>
	{:else}
		<form onsubmit={start} novalidate>
			<Section header={T.siteHeader} footer={auth.status === 'expired' ? T.expired : T.siteFooter}>
				<Row title={siteField} />
			</Section>
			{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
			<div class="actions">
				<Button variant="filled" size="large" full type="submit" disabled={busy || site.trim() === ''}>
					{busy ? T.asking : T.continue}
				</Button>
			</div>
			{#if auth.status === 'signed-out'}<p class="note">{T.signedOutFooter}</p>{/if}
		</form>
	{/if}
</Screen>

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
		placeholder={T.sitePlaceholder}
		aria-label={T.siteLabel}
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
		padding: 0 16px;
		margin-bottom: 24px;
	}
	.problem {
		margin: -20px 32px 20px;
		font-size: 13px;
		line-height: 18px;
		color: var(--destructive);
	}
	.note {
		padding: 0 32px;
		font-size: 13px;
		line-height: 18px;
		color: var(--label-2);
	}
</style>
