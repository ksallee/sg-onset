<script lang="ts">
	// The dock at rest, beside the rail: the take's timing (what Start and End stamped), then the
	// marks and the note under the thumb. In a phone-width window: the timing on one band; the
	// marks sit with the take there.
	import { formatTime } from '$lib/app/format';
	import { t } from '$lib/i18n/messages';
	import type { Form } from '$lib/ios/handedness';
	import { elapsedMs, formatElapsed } from '$lib/take/record';
	import type { Shoot } from '$lib/take/shoot.svelte';
	import MarkBar from './MarkBar.svelte';

	let { shoot, form, onnote }: { shoot: Shoot; form: Form; onnote: () => void } = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	/** The wall time to the second, as stored. */
	const clock = (ms: number | null) => {
		if (ms === null) return '–';
		const d = new Date(ms);
		return `${formatTime(d.toISOString())}:${pad(d.getSeconds())}`;
	};
	const length = $derived(shoot.phase === 'idle' ? '–:––' : formatElapsed(elapsedMs({ start: shoot.times.start, end: shoot.times.end }, shoot.now)));
</script>

<div class="tray" data-form={form}>
	<section class="timing" class:rolling={shoot.phase === 'rolling'} aria-label={t('timing.title')}>
		<h2>{t('timing.title')}</h2>
		<p class="length num">{length}</p>
		<dl>
			<div><dt>{t('timing.start')}</dt><dd class="num">{clock(shoot.times.start)}</dd></div>
			<div><dt>{t('timing.end')}</dt><dd class="num">{clock(shoot.times.end)}</dd></div>
		</dl>
	</section>

	{#if form !== 'compact'}
		<div class="marks"><MarkBar {shoot} {onnote} /></div>
	{/if}
</div>

<style>
	.tray {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px 12px;
		overflow-y: auto;
		overscroll-behavior-y: contain;
	}
	h2,
	dt {
		font-size: 13px;
		line-height: 18px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--label-2);
	}
	.timing {
		flex: none;
		padding: 12px 14px;
		border-radius: 18px;
		background: var(--cell);
	}
	.timing.rolling {
		box-shadow: inset 0 0 0 2.5px var(--record);
	}
	.length {
		font-family: var(--font-rounded);
		font-size: 48px;
		line-height: 54px;
		font-weight: 700;
		letter-spacing: -1px;
	}
	.rolling .length {
		color: var(--record);
	}
	dl {
		display: flex;
		gap: 20px;
		margin-top: 2px;
	}
	dt {
		font-size: 12px;
		line-height: 16px;
	}
	dd {
		font-size: 17px;
		line-height: 22px;
		font-weight: 600;
	}
	/* The marks at the thumb's height: their middle at 45 % of the dock, under the timing. */
	.marks {
		flex: none;
		margin-top: max(0px, calc(45cqh - 60px - 150px));
	}

	/* A phone-width window: one band. */
	.tray[data-form='compact'] {
		flex: none;
		padding: 8px 16px;
		overflow: hidden;
	}
	[data-form='compact'] .timing {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 48px;
		padding: 0 14px;
		border-radius: 14px;
	}
	[data-form='compact'] h2 {
		display: none;
	}
	[data-form='compact'] .length {
		font-size: 28px;
		line-height: 34px;
		letter-spacing: -0.5px;
	}
	[data-form='compact'] dl {
		flex: 1;
		justify-content: flex-end;
		margin: 0;
	}
	[data-form='compact'] dl div {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	[data-form='compact'] dd {
		font-size: 15px;
	}
	[data-form='compact'] dt {
		white-space: nowrap;
	}
	@media (max-width: 500px) {
		[data-form='compact'] dl {
			gap: 12px;
		}
		[data-form='compact'] dl div {
			flex-direction: column;
			gap: 0;
		}
	}
</style>
