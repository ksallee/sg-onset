<script lang="ts">
	// The rig of a camera setup, in one tap, as its lens is (#138): the built-in rigs, then the
	// project's own. The current one has the checkmark. A pick saves at once and closes. Takes
	// already shot keep theirs.
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import { isBuiltInRig, rigChoices, rigLabel } from '$lib/gear/rigs';
	import { t, tk } from '$lib/i18n/messages';
	import type { CameraSetup } from '$lib/model/types';

	let {
		open = $bindable(false),
		setup,
		projectRigs,
		onpick
	}: {
		open?: boolean;
		setup: CameraSetup;
		/** The names of the rigs the project added. */
		projectRigs: readonly string[];
		onpick: (rig: string | undefined) => void;
	} = $props();

	const current = $derived(setup.cameraMount);
	const choices = $derived(rigChoices(projectRigs));
	const builtIn = $derived(choices.filter(isBuiltInRig));
	// A rig the project no longer lists stays on the setup that holds it, and is shown.
	const own = $derived([...choices.filter((r) => !isBuiltInRig(r)), ...(current && !choices.includes(current) ? [current] : [])]);

	function pick(rig: string | undefined) {
		onpick(rig);
		open = false;
	}
</script>

<Sheet bind:open title={t('gear.picker.rig', { setup: setup.cameraLabel ?? '' })} detents={['large']} done>
	<div class="picker">
		<Section header={t('gear.rigs.builtIn')}>
			{#each builtIn as r (r)}
				<Row title={rigLabel(r, tk)} checked={r === current} onclick={() => pick(r)} />
			{/each}
		</Section>
		{#if own.length}
			<Section header={t('gear.rigs.project')}>
				{#each own as r (r)}
					<Row title={r} checked={r === current} onclick={() => pick(r)} />
				{/each}
			</Section>
		{/if}
		<Section footer={t('gear.setup.takes')}>
			<Row title={t('gear.setup.none')} checked={current === undefined} onclick={() => pick(undefined)} />
		</Section>
	</div>
</Sheet>

<style>
	.picker {
		padding-bottom: 24px;
	}
</style>
