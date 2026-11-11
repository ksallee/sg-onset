<script lang="ts">
	// The colour specimen (#14): every token with its contrast figures, and the kit's parts drawn
	// with them, in light, dark and red night, normal or increased contrast. The controls set the
	// data attributes on this page's own wrapper, so it works before the app shell sets them on
	// <html>. `?mode=dark|night&contrast=more` opens a given scheme. The kit parts read the
	// tokens themselves (docs/design/colour.md). A prototype page: its strings are not in the message catalogue.
	import { page } from '$app/state';
	import { Camera, CircleCheck, CloudUpload, Ellipsis, Film, Flag, Image, Settings, TriangleAlert, Undo2 } from '@lucide/svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Chip from '$lib/components/ios/Chip.svelte';
	import Keypad from '$lib/components/ios/Keypad.svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Rail from '$lib/components/ios/Rail.svelte';
	import RailButton from '$lib/components/ios/RailButton.svelte';
	import RecordButton from '$lib/components/ios/RecordButton.svelte';
	import Row from '$lib/components/ios/Row.svelte';
	import Section from '$lib/components/ios/Section.svelte';
	import Segmented from '$lib/components/ios/Segmented.svelte';
	import Sheet from '$lib/components/ios/Sheet.svelte';
	import Tile from '$lib/components/ios/Tile.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import Workspace from '$lib/components/ios/Workspace.svelte';
	import { report } from '$lib/theme/check';
	import { TOKENS, valueOf, type Group, type Scheme } from '$lib/theme/palette';

	type ModeChoice = 'light' | 'dark' | 'night';
	const q = page.url.searchParams;
	// With no `?mode`, the app's: the attributes on <html>.
	const rootMode = (): ModeChoice => (typeof document === 'undefined' ? 'light' : document.documentElement.dataset.night === 'true' ? 'night' : document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
	let mode = $state<ModeChoice>(q.get('mode') === 'dark' ? 'dark' : q.get('mode') === 'night' ? 'night' : q.get('mode') === 'light' ? 'light' : rootMode());
	let contrast = $state<'normal' | 'more'>(q.get('contrast') === 'more' ? 'more' : 'normal');
	const scheme = $derived<Scheme>(contrast === 'more' ? `${mode}-more` : mode);
	const results = $derived(report(scheme));

	let rolling = $state(false);
	let gloves = $state(false);
	let lensFromBody = $state(true);
	let take = $state('4');
	let camera = $state('a');
	let sheetOpen = $state(q.get('sheet') === '1');
	let showPairs = $state(q.get('pairs') === '1');

	const MODES = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'night', label: 'Red night' }
	];
	const CONTRASTS = [
		{ value: 'normal', label: 'Normal' },
		{ value: 'more', label: 'Increased' }
	];
	const CAMERAS = [
		{ value: 'a', label: 'A' },
		{ value: 'b', label: 'B' },
		{ value: 'c', label: 'C' },
		{ value: 'u2', label: '2nd unit' }
	];
	const keypadLabels = { keypad: 'Keypad', point: 'Point', back: 'Delete' };

	type Status = 'circled' | 'ng' | 'unsynced' | 'synced' | 'conflict' | 'rolling';
	const STATUS: Record<Status, { token: string; word: string }> = {
		circled: { token: 'good', word: 'Circled' },
		ng: { token: 'no-good', word: 'NG' },
		unsynced: { token: 'unsynced', word: 'Unsynced' },
		synced: { token: 'synced', word: 'Synced' },
		conflict: { token: 'conflict', word: 'Conflict' },
		rolling: { token: 'rolling', word: 'Running' }
	};
	const takes: { n: string; time: string; cam: string; lens: string; focal: string; stop: string; status: Status[] }[] = [
		{ n: '1', time: '09:41:12', cam: 'A', lens: 'Signature Prime', focal: '35', stop: 'T2.8', status: ['ng', 'synced'] },
		{ n: '2', time: '09:44:03', cam: 'A', lens: 'Signature Prime', focal: '35', stop: 'T2.8', status: ['circled', 'synced'] },
		{ n: '3', time: '09:47:51', cam: 'A', lens: 'Signature Prime', focal: '50', stop: 'T2', status: ['conflict'] },
		{ n: '4', time: '09:52:20', cam: 'A', lens: 'Signature Prime', focal: '50', stop: 'T2', status: ['circled', 'unsynced'] }
	];

	const GROUPS: { group: Group; title: string }[] = [
		{ group: 'background', title: 'Backgrounds' },
		{ group: 'label', title: 'Labels' },
		{ group: 'tint', title: 'Tint' },
		{ group: 'status', title: 'Status' },
		{ group: 'separator', title: 'Separators' },
		{ group: 'fill', title: 'Fills' },
		{ group: 'focus', title: 'Focus' },
		{ group: 'material', title: 'Materials' },
		{ group: 'elevation', title: 'Elevation' },
		{ group: 'keypad', title: 'Keypad' },
		{ group: 'rail', title: 'Rail' }
	];

	/** The worst pairing a token is the foreground of, in this scheme. */
	function worst(name: string) {
		const mine = results.filter((r) => r.fg === name);
		if (!mine.length) return undefined;
		return mine.reduce((a, b) => (b.wcag < a.wcag ? b : a));
	}
	const fmt = (n: number) => (n >= 10 ? n.toFixed(1) : n.toFixed(2));
	const failing = $derived(results.filter((r) => !r.pass).length);
</script>

<svelte:head><title>Colour · SG OnSet</title></svelte:head>

<div
	class="spec"
	data-theme={mode === 'light' ? 'light' : 'dark'}
	data-night={mode === 'night' ? 'true' : undefined}
	data-contrast={contrast}
>
	<header class="top material-bar">
		<div class="title">
			<h1>Colour</h1>
			<p>{results.length} pairings measured · {failing === 0 ? 'all meet their targets' : `${failing} below target`}</p>
		</div>
		<div class="controls">
			<div class="seg-mode"><Segmented options={MODES} value={mode} onchange={(v) => (mode = v as ModeChoice)} label="Appearance" /></div>
			<div class="seg-contrast"><Segmented options={CONTRASTS} value={contrast} onchange={(v) => (contrast = v as 'normal' | 'more')} label="Contrast" /></div>
		</div>
	</header>

	<!-- The take screen, at iPad scale, with the kit's Workspace. -->
	<section class="block">
		<h2 class="section-header">Take screen</h2>
		<div class="frame device">
			<Workspace hand="right" target={gloves ? 104 : 78} gap={16}>
				{#snippet list(at)}
					<div class="takes" data-at={at}>
						<div class="takes-head">
							<span class="slate num">12A</span>
							<span class="day">Day 14 · Stage 3</span>
						</div>
						{#each takes as t (t.n)}
							<button type="button" class="take-row" class:current={t.n === take} onclick={() => (take = t.n)}>
								<span class="take-n num" class:circled={t.status.includes('circled')} class:ng={t.status.includes('ng')}>{t.n}</span>
								<span class="take-meta">
									<span class="num" class:struck={t.status.includes('ng')}>{t.time}{#if t.status.includes('ng')}<span class="ng-tag">NG</span>{/if}</span>
									<span class="sub">{t.focal} mm · {t.stop}</span>
								</span>
								{#if t.status.includes('unsynced')}<CloudUpload class="size-[18px] mark-unsynced" strokeWidth={2.2} aria-label="Unsynced" />{/if}
								{#if t.status.includes('conflict')}<TriangleAlert class="size-[18px] mark-conflict" strokeWidth={2.2} aria-label="Conflict" />{/if}
							</button>
						{/each}
						<button type="button" class="take-row" class:current={take === '5'} onclick={() => (take = '5')}>
							<span class="take-n num">5</span>
							<span class="take-meta">
								<span class="num" class:roll={rolling}>{rolling ? '00:00:48' : 'Next'}</span>
								<span class="sub">{rolling ? 'Running' : 'Copy of take 4'}</span>
							</span>
						</button>
					</div>
				{/snippet}
				{#snippet main()}
					<NavBar title="Slate 12A · Take {take}">
						{#snippet trailing()}<Button variant="plain">Edit</Button>{/snippet}
					</NavBar>
					<div class="main-body">
						<div class="phase" class:rolling>
							{#if rolling}<span class="sq"></span> Running · <span class="num">00:00:48</span>{:else}<span class="dot"></span> Ready · take {take}{/if}
						</div>
						<Section header="Camera">
							<div class="seg-row"><Segmented options={CAMERAS} value={camera} onchange={(v) => (camera = v)} label="Camera" /></div>
							<Row title="Lens" detail="Signature Prime 50" chevron onclick={() => {}}>
								{#snippet leading()}<Tile icon={Camera} color="var(--tint)" />{/snippet}
							</Row>
							<Row title="Focal length" subtitle="From the lens: a prime" detail="50 mm" />
							<Row title="T-stop">
								{#snippet trailing()}<span class="num changed-val">T2 <span class="changed-dot" aria-label="Changed since take 3"></span></span>{/snippet}
							</Row>
							<Row title="Focal length from the lens">
								{#snippet trailing()}<Toggle checked={lensFromBody} onchange={(v) => (lensFromBody = v)} label="Focal length from the lens" />{/snippet}
							</Row>
						</Section>
						<Section header="Take" footer="Undo, not confirm: every change can be taken back.">
							<Row title="Circled" checked={true} onclick={() => {}} />
							<Row title="Button size: Large" subtitle="Bigger capture buttons">
								{#snippet trailing()}<Toggle checked={gloves} onchange={(v) => (gloves = v)} label="Button size: Large" />{/snippet}
							</Row>
							<Row title="Delete take" destructive onclick={() => {}} />
						</Section>
						<div class="buttons">
							<Button variant="filled" size="large">Save take</Button>
							<Button variant="tinted" size="large">Add note</Button>
							<Button variant="gray" size="large">Skip</Button>
							<Button variant="plain" size="large">Cancel</Button>
						</div>
					</div>
				{/snippet}
				{#snippet dock()}
					<div class="dock">
						<div class="field">
							<span class="field-label">Focus distance</span>
							<span class="field-value num">2.4<span class="caret"></span> <small>m</small></span>
						</div>
						<div class="chips">
							<Chip onclick={() => {}}>1.8</Chip>
							<Chip on onclick={() => {}}>2.4</Chip>
							<Chip onclick={() => {}}>3</Chip>
							<Chip onclick={() => {}}>5</Chip>
						</div>
						<Keypad onkey={() => {}} labels={keypadLabels} />
						<div class="dock-foot">
							<Button variant="gray" size="large" full>Previous</Button>
							<Button variant="filled" size="large" full>Next</Button>
						</div>
					</div>
				{/snippet}
				{#snippet rail(edge)}
					<Rail {edge} label="Capture" {rolling}>
						{#snippet top()}<RailButton label="Settings" onclick={() => {}}><Settings class="size-6" /></RailButton>{/snippet}
						{#snippet capture()}
							<RecordButton {rolling} label={rolling ? 'End' : 'Start'} caption={rolling ? 'End' : 'Start'} detail={rolling ? '00:00:48' : 'Take 5'} onclick={() => (rolling = !rolling)} />
							<RailButton label="Photo" capture badge={3} onclick={() => {}}><Image class="size-8" /></RailButton>
						{/snippet}
						{#snippet more()}
							<RailButton label="Flag" pressed onclick={() => {}}><Flag class="size-6" /></RailButton>
							<RailButton label="Undo" onclick={() => {}}><Undo2 class="size-6" /></RailButton>
						{/snippet}
					</Rail>
					<Sheet bind:open={sheetOpen} detents={[0.5, 'large']} title="Lens" done>
						<Section>
							<Row title="Signature Prime 35" checked={false} onclick={() => {}} />
							<Row title="Signature Prime 50" checked={true} onclick={() => {}} />
							<Row title="Signature Zoom 45–135" subtitle="Type the focal length per take" checked={false} onclick={() => {}} />
						</Section>
					</Sheet>
				{/snippet}
			</Workspace>
		</div>
	</section>

	<div class="pair">
		<!-- Start and End: ready and running, side by side. -->
		<section class="block">
			<h2 class="section-header">Start and End</h2>
			<div class="frame rails">
				{#each [false, true] as r (r)}
					<div class="rail-demo">
						<Rail edge="right" label="Capture" rolling={r}>
							{#snippet capture()}
								<RecordButton rolling={r} label={r ? 'End' : 'Start'} caption={r ? 'End' : 'Start'} detail={r ? '01:12' : 'Take 5'} onclick={() => {}} />
								<RailButton label="Photo" capture onclick={() => {}}><Image class="size-8" /></RailButton>
							{/snippet}
							{#snippet more()}
								<RailButton label="More" onclick={() => {}}><Ellipsis class="size-6" /></RailButton>
							{/snippet}
						</Rail>
						<span class="rail-cap">{r ? 'Running' : 'Ready'}</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- Takes as a table, with every status. -->
		<section class="block grow">
			<h2 class="section-header">Takes</h2>
			<div class="frame table-frame">
				<table class="takes-table">
					<thead>
						<tr><th>Take</th><th>Time</th><th>Cam</th><th>Lens</th><th class="r">mm</th><th>T-stop</th><th>Status</th></tr>
					</thead>
					<tbody>
						{#each takes as t (t.n)}
							<tr class:selected={t.n === take}>
								<td><span class="take-n num" class:circled={t.status.includes('circled')} class:ng={t.status.includes('ng')}>{t.n}</span></td>
								<td class="num">{t.time}</td>
								<td>{t.cam}</td>
								<td class="dim">{t.lens}</td>
								<td class="num r">{t.focal}</td>
								<td class="num">{t.stop}</td>
								<td class="chips-cell">
									{#each t.status as s (s)}
										<span class="status" style:--c="var(--{STATUS[s].token})">
											{#if s === 'synced'}<CircleCheck class="size-3.5" strokeWidth={2.5} />{:else if s === 'unsynced'}<CloudUpload class="size-3.5" strokeWidth={2.5} />{:else if s === 'conflict'}<TriangleAlert class="size-3.5" strokeWidth={2.5} />{/if}
											{STATUS[s].word}
										</span>
									{/each}
								</td>
							</tr>
						{/each}
						<tr>
							<td><span class="take-n num">5</span></td>
							<td class="num roll">00:01:12</td>
							<td>A</td>
							<td class="dim">Signature Prime</td>
							<td class="num r">50</td>
							<td class="num">T2</td>
							<td class="chips-cell"><span class="status" style:--c="var(--rolling)"><span class="sq small"></span>Running</span></td>
						</tr>
					</tbody>
				</table>
				<div class="sync-bar">
					<span class="status" style:--c="var(--unsynced)"><CloudUpload class="size-3.5" strokeWidth={2.5} />3 unsynced</span>
					<span class="status" style:--c="var(--synced)"><CircleCheck class="size-3.5" strokeWidth={2.5} />Synced 09:50</span>
					<span class="status" style:--c="var(--conflict)"><TriangleAlert class="size-3.5" strokeWidth={2.5} />1 conflict</span>
					<span class="status" style:--c="var(--warning)"><Film class="size-3.5" strokeWidth={2.5} />Storage 8% left</span>
					<span class="spacer"></span>
					<Button variant="tinted" size="small" onclick={() => (sheetOpen = !sheetOpen)}>{sheetOpen ? 'Hide sheet' : 'Show sheet'}</Button>
				</div>
			</div>
		</section>
	</div>

	<!-- Every token. -->
	<section class="block">
		<h2 class="section-header">Tokens · {scheme}</h2>
		{#each GROUPS as g (g.group)}
			<div class="group">
				<h3>{g.title}</h3>
				<div class="swatches">
					{#each TOKENS.filter((t) => t.group === g.group) as t (t.name)}
						{@const w = worst(t.name)}
						{@const v = valueOf(t, scheme)}
						<div class="swatch">
							{#if t.group === 'elevation'}
								<div class="chip-shadow" style:box-shadow={v}></div>
							{:else if t.raw}
								<div class="chip-raw num">{v}</div>
							{:else}
								<div class="chip-colour" class:alpha={v.includes('/')}><span style:background="var(--{t.name})"></span></div>
							{/if}
							<div class="meta">
								<code>--{t.name}</code>
								<span class="use">{t.use}</span>
								{#if w}
									<span class="fig num" class:fail={!w.pass}>
										{fmt(w.wcag)}:1 · Lc {Math.abs(w.apca).toFixed(0)} <span class="on">on {w.on}</span>
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</section>

	<section class="block">
		<button type="button" class="pairs-toggle section-header" onclick={() => (showPairs = !showPairs)}>{showPairs ? 'Hide' : 'Show'} all {results.length} pairings</button>
		{#if showPairs}
			<table class="pairs">
				<thead><tr><th>Text</th><th>On</th><th class="r">WCAG</th><th class="r">APCA Lc</th><th class="r">Target</th><th></th></tr></thead>
				<tbody>
					{#each results as r (r.fg + r.on)}
						<tr class:fail={!r.pass}>
							<td><code>--{r.fg}</code></td>
							<td><code>{r.on}</code></td>
							<td class="num r">{fmt(r.wcag)}</td>
							<td class="num r">{r.apca.toFixed(1)}</td>
							<td class="num r">{r.min.wcag}:1 · {r.min.apca}</td>
							<td>{r.pass ? '✓' : '✕'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>

<style>
	.spec {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--label);
		padding-bottom: 48px;
		font-size: 15px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: calc(10px + var(--safe-top)) 24px 10px;
		border-bottom: var(--hairline) solid var(--separator);
	}
	.title h1 {
		font-size: 22px;
		line-height: 28px;
		font-weight: 700;
		letter-spacing: -0.26px;
	}
	.title p {
		font-size: 13px;
		color: var(--label-2);
	}
	.controls {
		display: flex;
		gap: 12px;
		margin-left: auto;
	}
	.seg-mode {
		width: 300px;
	}
	.seg-contrast {
		width: 200px;
	}
	.block {
		padding: 20px 24px 0;
	}
	.block > .section-header {
		margin: 0 4px 8px;
	}
	.frame {
		border-radius: 18px;
		overflow: hidden;
		box-shadow: var(--shadow-2);
		background: var(--bg);
	}
	.device {
		/* The Workspace fills it; a fixed sheet is held inside by the transform. */
		--app-height: 640px;
		--safe-top: 0px;
		--safe-bottom: 0px;
		transform: translateZ(0);
	}

	/* The list column. */
	.takes {
		display: flex;
		flex-direction: column;
		padding: 12px 10px;
		gap: 2px;
	}
	.takes[data-at='top'] {
		flex-direction: row;
		overflow-x: auto;
		padding: 8px 12px;
		gap: 6px;
	}
	.takes[data-at='top'] .takes-head {
		display: none;
	}
	.takes-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 4px 8px 10px;
	}
	.slate {
		font-family: var(--font-rounded);
		font-size: 28px;
		font-weight: 700;
	}
	.day {
		font-size: 13px;
		color: var(--label-2);
	}
	.take-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 6px 10px;
		border-radius: 12px;
		text-align: left;
		color: var(--label);
		flex: none;
	}
	.take-row:active {
		background: var(--press);
	}
	.take-row.current {
		background: var(--selection);
	}
	.take-meta {
		display: flex;
		flex-direction: column;
		flex: 1;
		font-size: 15px;
		font-weight: 600;
	}
	.sub {
		font-size: 13px;
		font-weight: 400;
		color: var(--label-2);
	}
	.take-n {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		font-family: var(--font-rounded);
		font-size: 17px;
		font-weight: 700;
	}
	.take-n.circled {
		box-shadow: inset 0 0 0 2px var(--good);
		color: var(--good);
	}
	.take-n.ng {
		color: var(--no-good);
		font-weight: 500;
	}
	.ng-tag {
		margin-left: 6px;
		font-size: 12px;
		font-weight: 700;
		color: var(--no-good);
	}
	.struck {
		text-decoration: line-through 1.5px;
		text-decoration-color: var(--no-good);
		color: var(--no-good);
	}
	.takes :global(.mark-unsynced) {
		color: var(--unsynced);
	}
	.takes :global(.mark-conflict) {
		color: var(--conflict);
	}
	.roll {
		color: var(--rolling);
		font-weight: 700;
	}

	.main-body {
		padding: 0 0 24px;
	}
	.phase {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 4px 20px 0;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--fill-3);
		font-weight: 600;
	}
	.phase.rolling {
		background: var(--record);
		color: var(--on-record);
	}
	/* Night: no bright slab. An outline, the square and the word. */
	[data-night='true'] .phase.rolling {
		background: transparent;
		color: var(--rolling);
		box-shadow: inset 0 0 0 2px var(--record);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 2px var(--label-2);
	}
	.sq {
		width: 11px;
		height: 11px;
		border-radius: 2px;
		background: currentColor;
	}
	.sq.small {
		width: 8px;
		height: 8px;
	}
	.seg-row {
		padding: 10px 16px;
		border-bottom: var(--hairline) solid var(--separator);
	}
	.changed-val {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: var(--label-2);
	}
	.changed-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--changed);
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding: 20px 20px 0;
	}

	.dock {
		display: flex;
		flex-direction: column;
		gap: 12px;
		height: 100%;
		padding: 16px;
		background: var(--bg);
		border-left: var(--hairline) solid var(--separator);
	}
	.field {
		display: flex;
		flex-direction: column;
		padding: 10px 14px;
		border-radius: 14px;
		background: var(--cell);
		box-shadow: inset 0 0 0 2.5px var(--tint);
	}
	.field-label {
		font-size: 13px;
		color: var(--label-2);
	}
	.field-value {
		font-family: var(--font-rounded);
		font-size: 34px;
		line-height: 40px;
		font-weight: 600;
	}
	.field-value small {
		font-size: 17px;
		color: var(--label-2);
	}
	.caret {
		display: inline-block;
		width: 3px;
		height: 30px;
		margin-left: 2px;
		vertical-align: -4px;
		border-radius: 2px;
		background: var(--tint);
	}
	.chips {
		display: flex;
		gap: 8px;
	}
	.dock-foot {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: auto;
	}

	.pair {
		display: flex;
		gap: 0;
		align-items: stretch;
	}
	.pair .block {
		padding-right: 0;
	}
	.pair .block.grow {
		flex: 1;
		min-width: 0;
		padding-right: 24px;
	}
	.rails {
		display: flex;
		width: max-content;
		height: 400px;
		--target: 78px;
		--gap: 16px;
	}
	.rail-demo {
		position: relative;
		height: 100%;
	}
	.rail-cap {
		position: absolute;
		left: 0;
		right: 0;
		top: 14px;
		text-align: center;
		font-size: 12px;
		font-weight: 600;
		color: var(--label-3);
	}
	.table-frame {
		background: var(--cell);
	}
	.takes-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	.takes-table th {
		padding: 10px 12px;
		text-align: left;
		font-size: 12px;
		font-weight: 600;
		color: var(--label-2);
		background: var(--fill-4);
		border-bottom: var(--hairline) solid var(--separator);
	}
	.takes-table td {
		padding: 6px 12px;
		height: 52px;
		border-bottom: var(--hairline) solid var(--separator);
		white-space: nowrap;
	}
	.takes-table tr.selected td {
		background: var(--selection);
	}
	.r {
		text-align: right !important;
	}
	.dim {
		color: var(--label-2);
	}
	.chips-cell {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.status {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		padding: 0 9px;
		border-radius: 13px;
		color: var(--c);
		background: color-mix(in srgb, var(--c) var(--status-fill), transparent);
		box-shadow: inset 0 0 0 var(--status-ring) var(--c);
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
	}
	.sync-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 12px;
	}
	.spacer {
		flex: 1;
	}

	.group {
		margin: 0 0 20px;
	}
	.group h3 {
		margin: 0 4px 8px;
		font-size: 17px;
		font-weight: 600;
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 8px;
	}
	.swatch {
		display: flex;
		gap: 12px;
		padding: 10px;
		border-radius: 14px;
		background: var(--cell);
	}
	.chip-colour,
	.chip-shadow,
	.chip-raw {
		flex: none;
		width: 52px;
		height: 52px;
		border-radius: 12px;
	}
	.chip-colour {
		overflow: hidden;
		box-shadow: inset 0 0 0 var(--hairline) var(--separator);
	}
	.chip-colour.alpha {
		background: conic-gradient(var(--fill-3) 25%, transparent 0 50%, var(--fill-3) 0 75%, transparent 0) 0 0 / 12px 12px;
	}
	.chip-colour span {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: inherit;
		box-shadow: inset 0 0 0 1px var(--separator);
	}
	.chip-shadow {
		background: var(--cell-elevated);
	}
	.chip-raw {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--fill-4);
		font-size: 13px;
		font-weight: 600;
		color: var(--label-2);
	}
	.meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}
	code {
		font-family: ui-monospace, 'SF Mono', monospace;
		font-size: 13px;
		font-weight: 600;
	}
	.use {
		font-size: 12px;
		line-height: 15px;
		color: var(--label-2);
	}
	.fig {
		margin-top: 2px;
		font-size: 12px;
		font-weight: 600;
		color: var(--label);
	}
	.fig .on {
		font-weight: 400;
		color: var(--label-3);
	}
	.fig.fail {
		color: var(--destructive);
	}
	.pairs-toggle {
		margin: 0 4px 8px;
		color: var(--tint);
	}
	.pairs {
		width: 100%;
		border-collapse: collapse;
		background: var(--cell);
		border-radius: 14px;
		overflow: hidden;
		font-size: 13px;
	}
	.pairs th,
	.pairs td {
		padding: 6px 12px;
		text-align: left;
		border-bottom: var(--hairline) solid var(--separator);
	}
	.pairs th {
		color: var(--label-2);
		font-weight: 600;
	}
	.pairs tr.fail td {
		color: var(--destructive);
	}

	/* Portrait: stack the rail demo over the table, shrink the controls. */
	@media (max-width: 1000px) {
		.pair {
			flex-direction: column;
		}
		.pair .block {
			padding-right: 24px;
		}
		.rails {
			height: 360px;
		}
		.seg-mode {
			width: 260px;
		}
		.seg-contrast {
			width: 180px;
		}
	}

	/* The kit's sheet is phone-sized; on the iPad a form sheet sits in the middle. */
	.spec :global(.ios-sheet-layer) {
		left: 0;
		right: 0;
	}
	.spec :global(.ios-sheet-layer .panel.panel) {
		left: calc(50% - 280px);
		right: calc(50% - 280px);
	}
</style>
