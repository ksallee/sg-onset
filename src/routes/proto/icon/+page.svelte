<script lang="ts">
	// The icon specimen (#38, #53): the concepts explored, the one chosen and the two runners-up, at
	// every size, on light and dark wallpapers, in a Home Screen row and in the iOS 26 icon styles;
	// then the files scripts/icons.mjs writes. The chosen mark is read from static/brand/icon.svg,
	// the one source. `?mode=light|dark` sets the page's scheme. A prototype page: its strings are
	// not in the message catalogue.
	import { page } from '$app/state';
	import source from '../../../../static/brand/icon.svg?raw';

	const q = page.url.searchParams.get('mode');
	const mode = q === 'dark' || q === 'light' ? q : null;

	/** The inside of `<g id="mark">` in the source SVG. */
	const chosenMark = source.match(/<g id="mark">([\s\S]*?)<\/g>\s*<\/svg>/)?.[1] ?? '';

	// An iris: six blades, each one side of the hexagon run on to the rim.
	function iris(): string {
		const c = 512;
		const r = 132;
		const rim = 286;
		let d = '';
		for (let i = 0; i < 6; i++) {
			const a = (Math.PI / 3) * i - Math.PI / 2;
			const b = a + Math.PI / 3;
			const [x1, y1] = [c + r * Math.cos(a), c + r * Math.sin(a)];
			const [x2, y2] = [c + r * Math.cos(b), c + r * Math.sin(b)];
			const len = Math.hypot(x2 - x1, y2 - y1);
			const [dx, dy] = [(x2 - x1) / len, (y2 - y1) / len];
			// Where the line from (x1,y1) along (dx,dy) meets the rim circle.
			const px = x1 - c;
			const py = y1 - c;
			const bq = px * dx + py * dy;
			const t = -bq + Math.sqrt(bq * bq - (px * px + py * py - rim * rim));
			d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${(x1 + dx * t).toFixed(1)} ${(y1 + dy * t).toFixed(1)}`;
		}
		return `<circle cx="512" cy="512" r="300" fill="none" class="ink-stroke" stroke-width="44"/><path d="${d}" fill="none" class="ink-stroke" stroke-width="30" stroke-linecap="round"/>`;
	}

	type Concept = { id: string; name: string; from: string; mark: string; verdict: 'chosen' | 'runner-up' | 'set aside'; why: string };

	const CONCEPTS: Concept[] = [
		{
			id: 'marker',
			name: 'Tracking marker',
			from: 'The marker VFX tapes to the set',
			mark: chosenMark,
			verdict: 'chosen',
			why: 'Kevin’s pick, in gold. It is the thing this crew tapes to the set, and the sharpest drawing of the eight at 16 px. Two golds and no gaps keep it one object.'
		},
		{
			id: 'tally',
			name: 'Take marks',
			from: 'The take count, kept by hand',
			mark: `<mask id="sgo-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><rect x="98" y="438" width="828" height="148" rx="48" transform="rotate(-23.4 512 512)" fill="#000"/></mask><g class="ink" mask="url(#sgo-gap)"><rect x="252" y="268" width="88" height="488" rx="18"/><rect x="396" y="268" width="88" height="488" rx="18"/><rect x="540" y="268" width="88" height="488" rx="18"/><rect x="684" y="268" width="88" height="488" rx="18"/></g><rect class="accent" x="128" y="468" width="768" height="88" rx="18" transform="rotate(-23.4 512 512)"/>`,
			verdict: 'runner-up',
			why: 'The first icon: four takes and the strike that closes the group. It says counting takes. Kevin preferred the marker when he saw both on the Home Screen, so it stepped down.'
		},
		{
			id: 'mark',
			name: 'Floor mark',
			from: 'The tape T an actor stands on',
			mark: `<rect class="accent" x="232" y="288" width="560" height="132" rx="12"/><rect class="accent" x="446" y="444" width="132" height="304" rx="12"/>`,
			verdict: 'runner-up',
			why: 'Bold and of the set. At small sizes it is the letter T, and no word in the name starts with T.'
		},
		{
			id: 'sticks',
			name: 'Sticks',
			from: 'The clapper on a slate',
			mark: `<g transform="translate(0 44)"><rect class="ink" x="212" y="560" width="600" height="116" rx="20"/><g transform="rotate(-15 236 536)"><rect class="ink" x="212" y="420" width="600" height="116" rx="20"/><path class="accent" d="M352 420h84l-52 116h-84zM520 420h84l-52 116h-84zM688 420h84l-52 116h-84z"/></g></g>`,
			verdict: 'set aside',
			why: 'Everyone reads it, and every film app has one. The stripes turn to noise under 60 px, and a clapperboard is already another editor’s icon.'
		},
		{
			id: 'disc',
			name: 'Start disc',
			from: 'The button that starts a take',
			mark: `<circle cx="512" cy="512" r="288" fill="none" class="ink-stroke" stroke-width="40"/><circle class="rec" cx="512" cy="512" r="204"/>`,
			verdict: 'set aside',
			why: 'It is every camera app’s record button. Red is kept for the one control that starts a take, so it cannot also be the brand.'
		},
		{
			id: 'iris',
			name: 'Iris',
			from: 'The lens the notes describe',
			mark: iris(),
			verdict: 'set aside',
			why: 'A camera, not a notebook. It promises pictures, and SG OnSet takes none. The blades close up under 60 px.'
		},
		{
			id: 'sheet',
			name: 'Slate sheet',
			from: 'A slate as rows of fields',
			mark: `<rect class="ink" x="232" y="262" width="560" height="108" rx="22"/><rect class="ink dim" x="232" y="402" width="172" height="152" rx="22"/><rect class="ink dim" x="426" y="402" width="172" height="152" rx="22"/><rect class="ink dim" x="620" y="402" width="172" height="152" rx="22"/><rect class="ink dim" x="232" y="586" width="366" height="152" rx="22"/><rect class="accent" x="620" y="586" width="172" height="152" rx="22"/>`,
			verdict: 'set aside',
			why: 'Honest about the data, but it is a calendar or a calculator at a glance. Nothing in it says film.'
		},
		{
			id: 'letters',
			name: 'Letters',
			from: 'The name',
			mark: `<text class="ink" x="512" y="612" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif" font-size="400" font-weight="800" letter-spacing="-18">SG</text><rect class="accent" x="246" y="676" width="532" height="44" rx="22"/>`,
			verdict: 'set aside',
			why: 'SG is the family name, shared with the other SG tools. It would say which shelf the app is on and nothing about what it does.'
		}
	];

	// The tracking marker, as four paths. `a` to `b` is the square, `g` the gap between quarters,
	// `r` the outer corner radius; `cls` is the class of each quarter (top left, top right, bottom
	// right, bottom left), or null to leave the field showing.
	function marker(a: number, b: number, g: number, r: number, cls: (string | null)[], extra = ''): string {
		const [lo, hi] = [512 - g / 2, 512 + g / 2];
		const d = [
			`M${a + r} ${a}H${lo}V${lo}H${a}V${a + r}A${r} ${r} 0 0 1 ${a + r} ${a}Z`,
			`M${hi} ${a}H${b - r}A${r} ${r} 0 0 1 ${b} ${a + r}V${lo}H${hi}Z`,
			`M${hi} ${hi}H${b}V${b - r}A${r} ${r} 0 0 1 ${b - r} ${b}H${hi}Z`,
			`M${a} ${hi}H${lo}V${b}H${a + r}A${r} ${r} 0 0 1 ${a} ${b - r}Z`
		];
		return d.map((q, i) => (cls[i] ? `<path class="${cls[i]}" d="${q}"/>` : '')).join('') + extra;
	}

	const variant = (id: string, name: string, why: string, mark: string, verdict: Concept['verdict'] = 'set aside'): Concept => ({ id, name, from: '', mark, verdict, why });
	const VARIANTS: Concept[] = [
		variant('v-seen', 'As first seen', 'The tint mock Kevin picked from. Gaps and four soft panes: a window logo.', marker(264, 760, 24, 56, ['seen', 'seen dim', 'seen-2', 'seen dim'])),
		variant('v-pair', 'Pair', 'Two gold quarters, two left out. It turns into steps: the square is gone.', marker(240, 784, 0, 60, ['gold', null, 'gold', null])),
		variant(
			'v-frame',
			'Framed pair',
			'A frame brings the square back. The frame is a hair at 32 px and gone at 16.',
			marker(240, 784, 0, 60, ['gold', null, 'gold', null], `<rect class="deep-stroke" x="250" y="250" width="524" height="524" rx="50" fill="none" stroke-width="20"/>`)
		),
		variant('v-one', 'One gold', 'Off-white, charcoal and one gold quarter. Three colours fight, and the gold is a quarter of it.', marker(240, 784, 0, 60, ['ink', 'coal', 'gold', 'coal'])),
		variant('v-gap', 'Bronze, with gaps', 'Gold and bronze, split by a cross. The bronze reads brown and the cross reads as a window.', marker(240, 784, 20, 60, ['gold', 'bronze', 'gold', 'bronze'])),
		variant('v-chosen', 'Gold and deep gold', 'One square, no gaps. The deep quarters are gold in shadow: there at 16 px, and still gold.', chosenMark, 'chosen')
	];

	const chosen = CONCEPTS[0];
	const shortlist = CONCEPTS.slice(0, 3);
	const SIZES = [180, 120, 60, 32, 16];
	const VARIANT_SIZES = [180, 60, 32, 16];
	const STYLES = [
		{ id: 'default', label: 'Default' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'tinted', label: 'Tinted' },
		{ id: 'clear', label: 'Clear' }
	];

	// Stand-ins for the icons an iPad comes with, drawn plainly: the company the icon keeps.
	const NEIGHBOURS = [
		{ label: 'Files', bg: 'linear-gradient(#49b4ff,#1a74f2)', glyph: `<path fill="#fff" d="M232 372c0-29 23-52 52-52h150c17 0 33 8 43 22l27 38h236c29 0 52 23 52 52v260c0 29-23 52-52 52H284c-29 0-52-23-52-52z"/>` },
		{ label: 'Notes', bg: 'linear-gradient(#fff,#f3f3f3)', glyph: `<rect width="1024" height="300" fill="#fdd22e"/><path stroke="#c9c9ce" stroke-width="20" d="M150 470h724M150 620h724M150 770h724"/>` },
		{ label: 'Camera', bg: 'linear-gradient(#e2e3e8,#aeb0b8)', glyph: `<path fill="#26272b" d="M392 318h240l46 70h94c33 0 60 27 60 60v250c0 33-27 60-60 60H252c-33 0-60-27-60-60V448c0-33 27-60 60-60h94z"/><circle cx="512" cy="570" r="118" fill="none" stroke="#e2e3e8" stroke-width="36"/>` },
		{ label: 'Messages', bg: 'linear-gradient(#62f47c,#0bbd2c)', glyph: `<path fill="#fff" d="M512 250c176 0 318 112 318 250S688 750 512 750c-36 0-70-5-102-13-40 30-96 44-150 44 30-28 48-62 52-98-72-46-118-112-118-183 0-138 142-250 318-250z"/>` },
		{ label: 'Calendar', bg: '#fff', glyph: `<text x="512" y="330" text-anchor="middle" font-family="system-ui,sans-serif" font-size="150" font-weight="600" fill="#ff3b30">WED</text><text x="512" y="800" text-anchor="middle" font-family="system-ui,sans-serif" font-size="500" font-weight="300" fill="#111">11</text>` },
		{ label: 'Voice Memos', bg: 'linear-gradient(#232326,#000)', glyph: `<path stroke="#ff453a" stroke-width="34" stroke-linecap="round" d="M212 512v0M296 440v144M380 372v280M464 300v424M548 392v240M632 452v120M716 340v344M800 480v64"/>` },
		{ label: 'Mail', bg: 'linear-gradient(#3fc0ff,#1a6ef0)', glyph: `<rect x="190" y="310" width="644" height="420" rx="56" fill="#fff"/><path fill="none" stroke="#2f8ef5" stroke-width="34" stroke-linejoin="round" d="M212 348l300 232 300-232"/>` },
		{ label: 'Clock', bg: 'linear-gradient(#232326,#000)', glyph: `<circle cx="512" cy="512" r="370" fill="#fff"/><path stroke="#111" stroke-width="30" stroke-linecap="round" d="M512 512V270M512 512l150 86"/><path stroke="#ff9500" stroke-width="14" stroke-linecap="round" d="M512 560L420 250"/>` },
		{ label: 'Settings', bg: 'linear-gradient(#d4d5da,#8e9097)', glyph: `<circle cx="512" cy="512" r="290" fill="none" stroke="#2c2d31" stroke-width="84" stroke-dasharray="76 76"/><circle cx="512" cy="512" r="218" fill="none" stroke="#2c2d31" stroke-width="64"/><circle cx="512" cy="512" r="70" fill="#2c2d31"/>` }
	];
	const ROW_A = [NEIGHBOURS[0], NEIGHBOURS[1], NEIGHBOURS[2]];
	const ROW_B = [NEIGHBOURS[3], NEIGHBOURS[4], NEIGHBOURS[5]];
	const DOCK = [NEIGHBOURS[6], NEIGHBOURS[7], NEIGHBOURS[8]];

	const SPLASH = [
		{ src: '/splash/ipad-1024x1366-portrait-light.png', label: '13-inch, portrait, light' },
		{ src: '/splash/ipad-1024x1366-portrait-dark.png', label: '13-inch, portrait, dark' },
		{ src: '/splash/ipad-820x1180-landscape-light.png', label: '11-inch, landscape, light' },
		{ src: '/splash/ipad-820x1180-landscape-dark.png', label: '11-inch, landscape, dark' }
	];
</script>

{#snippet tile(c: Concept, size: number, style = 'default')}
	<span class="tile st-{style}" style:width="{size}px" style:height="{size}px">
		<svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden="true">{@html c.mark}</svg>
	</span>
{/snippet}

{#snippet app(c: Concept, style = 'default')}
	<span class="app">
		{@render tile(c, 64, style)}
		<span class="app-name">SG OnSet</span>
	</span>
{/snippet}

{#snippet neighbour(n: { label: string; bg: string; glyph: string })}
	<span class="app">
		<span class="tile" style:width="64px" style:height="64px" style:background={n.bg}>
			<svg viewBox="0 0 1024 1024" width="64" height="64" aria-hidden="true">{@html n.glyph}</svg>
		</span>
		<span class="app-name">{n.label}</span>
	</span>
{/snippet}

{#snippet home(c: Concept, wall: 'day' | 'dusk', style = 'default')}
	<div class="home wall-{wall}">
		<div class="grid">
			{#each ROW_A as n (n.label)}{@render neighbour(n)}{/each}
			{@render app(c, style)}
			{#each ROW_B as n (n.label)}{@render neighbour(n)}{/each}
		</div>
		<div class="dock">
			{#each DOCK as n (n.label)}{@render neighbour(n)}{/each}
			{@render app(c, style)}
		</div>
	</div>
{/snippet}

<svelte:head><title>SG OnSet icon</title></svelte:head>

<main class="sheet" data-mode={mode}>
	<header class="top">
		<h1>The SG OnSet icon</h1>
		<p>
			Eight ideas from the set, judged small before large. One chosen, two kept beside it. Everything on this page below
			“The files” is what <code>scripts/icons.mjs</code> writes from <code>static/brand/icon.svg</code>.
		</p>
	</header>

	<section class="hero" aria-labelledby="h-chosen">
		<div class="hero-icon">{@render tile(chosen, 320)}</div>
		<div class="hero-text">
			<h2 id="h-chosen">Tracking marker</h2>
			<p>
				The quartered square VFX tapes to a set so a shot can be tracked. Two quarters in gold, two in deep gold, meeting
				at one point. The gold is the icon’s own colour. The app’s blue stays in the app.
			</p>
			<div class="sizes">
				<div class="size-row wall-day">
					{#each SIZES as s (s)}<span class="size">{@render tile(chosen, s)}<small>{s}</small></span>{/each}
				</div>
				<div class="size-row wall-dusk">
					{#each SIZES as s (s)}<span class="size">{@render tile(chosen, s)}<small>{s}</small></span>{/each}
				</div>
			</div>
		</div>
	</section>

	<section aria-labelledby="h-home">
		<h2 id="h-home">On the Home Screen</h2>
		<p class="lede">The chosen icon among the icons an iPad comes with, on a pale and on a dark wallpaper.</p>
		<div class="homes">
			{@render home(chosen, 'day')}
			{@render home(chosen, 'dusk')}
		</div>
	</section>

	<section aria-labelledby="h-styles">
		<h2 id="h-styles">The iOS 26 icon styles</h2>
		<p class="lede">
			A Home Screen web app gives iPadOS one image, so the system makes the dark, tinted and clear versions itself. A light
			glyph on a dark field survives that. These are the three finalists drawn the way the system would. The tint here is
			blue, to show the marker in a colour that is not its own.
		</p>
		<div class="styles">
			{#each shortlist as c (c.id)}
				<div class="style-set">
					<h3>{c.name}</h3>
					<div class="style-row wall-day">
						{#each STYLES as s (s.id)}<span class="size">{@render tile(c, 76, s.id)}<small>{s.label}</small></span>{/each}
					</div>
					<div class="style-row wall-dusk">
						{#each STYLES as s (s.id)}<span class="size">{@render tile(c, 76, s.id)}<small>{s.label}</small></span>{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section aria-labelledby="h-gold" id="gold">
		<h2 id="h-gold">The gold, six ways</h2>
		<p class="lede">
			Kevin picked the marker from its tint mock. These are the six drawings tried from there, each at 180, 60, 32 and 16
			px on both wallpapers. The last one is the icon.
		</p>
		<div class="variants">
			{#each VARIANTS as v (v.id)}
				<div class="variant" data-verdict={v.verdict}>
					<h3>{v.name} {#if v.verdict === 'chosen'}<span class="verdict">chosen</span>{/if}</h3>
					<p>{v.why}</p>
					<div class="variant-row wall-day">
						{#each VARIANT_SIZES as s (s)}{@render tile(v, s)}{/each}
					</div>
					<div class="variant-row wall-dusk">
						{#each VARIANT_SIZES as s (s)}{@render tile(v, s)}{/each}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<section aria-labelledby="h-runners">
		<h2 id="h-runners">The two runners-up, in the same row</h2>
		<div class="homes">
			{@render home(CONCEPTS[1], 'day')}
			{@render home(CONCEPTS[1], 'dusk')}
			{@render home(CONCEPTS[2], 'day')}
			{@render home(CONCEPTS[2], 'dusk')}
		</div>
	</section>

	<section aria-labelledby="h-all">
		<h2 id="h-all">Every concept</h2>
		<ul class="concepts">
			{#each CONCEPTS as c (c.id)}
				<li class="concept" data-verdict={c.verdict}>
					<div class="concept-big">{@render tile(c, 180)}</div>
					<div class="concept-body">
						<h3>{c.name} <span class="verdict">{c.verdict}</span></h3>
						<p class="from">{c.from}</p>
						<p>{c.why}</p>
						<div class="concept-sizes">
							<span class="chip wall-day">{@render tile(c, 60)}{@render tile(c, 32)}{@render tile(c, 16)}</span>
							<span class="chip wall-dusk">{@render tile(c, 60)}{@render tile(c, 32)}{@render tile(c, 16)}</span>
							<span class="chip wall-dusk">{@render tile(c, 60, 'tinted')}{@render tile(c, 60, 'clear')}</span>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="h-grid">
		<h2 id="h-grid">Construction</h2>
		<div class="build">
			<div class="build-fig">
				{@render tile(chosen, 400)}
				<svg class="guides" viewBox="0 0 1024 1024" width="400" height="400" aria-hidden="true">
					<path d="M0 512h1024M512 0v1024" />
					<rect x="240" y="240" width="544" height="544" />
					<circle cx="512" cy="512" r="410" />
					<path class="unit" d="M240 200h272M240 184v32M512 184v32" />
				</svg>
			</div>
			<dl class="spec">
				<div><dt>Canvas</dt><dd>1024 square, full bleed. The system cuts the corners.</dd></div>
				<div><dt>Marker</dt><dd>A square of 544, centred: 53 % of the canvas, 240 to 784. Outer corners of radius 60.</dd></div>
				<div><dt>Quarters</dt><dd>Four of 272, no gap. They meet at the centre (512, 512), the point a tracker locks to.</dd></div>
				<div><dt>Gold</dt><dd>Top left and bottom right. The other two are deep gold.</dd></div>
				<div><dt>Maskable</dt><dd>The marker’s corner is 385 from the centre, inside the safe circle (410). The maskable icon draws it at 84 %.</dd></div>
				<div><dt>Clear space</dt><dd>Half a quarter (136) on every side of the marker, at any size.</dd></div>
				<div><dt>Colours</dt><dd>Field #232427 to #0a0a0b. Gold #eab53b, OKLCH 0.80 0.145 84. Deep gold #59481c, OKLCH 0.41 0.065 88. On a light ground: #cf9b0f and #272114.</dd></div>
			</dl>
		</div>
	</section>

	<section aria-labelledby="h-files">
		<h2 id="h-files">The files</h2>
		<p class="lede">Written by <code>node scripts/icons.mjs</code>. These are the images themselves, not drawings of them.</p>
		<div class="files">
			<figure>
				<img src="/icons/apple-touch-icon.png" width="90" height="90" alt="" class="round" />
				<figcaption>apple-touch-icon, 180 (also 167, 152)</figcaption>
			</figure>
			<figure>
				<img src="/icons/icon-512.png" width="90" height="90" alt="" />
				<figcaption>icon-512 and icon-192, any</figcaption>
			</figure>
			<figure>
				<span class="mask-demo">
					<img src="/icons/icon-maskable-512.png" width="90" height="90" alt="" style:border-radius="50%" />
					<img src="/icons/icon-maskable-512.png" width="90" height="90" alt="" style:border-radius="22%" />
					<span class="safe"><img src="/icons/icon-maskable-512.png" width="90" height="90" alt="" /></span>
				</span>
				<figcaption>maskable 512: as a circle, as a squircle, and the safe zone</figcaption>
			</figure>
			<figure>
				<span class="mono"><img src="/icons/icon-monochrome-512.png" width="90" height="90" alt="" /></span>
				<figcaption>monochrome 512: alpha only</figcaption>
			</figure>
		</div>
		<div class="splashes">
			<figure>
				<span class="tabs">
					<span class="tab"><img src="/favicon.svg" width="16" height="16" alt="" />SG OnSet</span>
					<span class="tab"><img src="/favicon-32.png" width="16" height="16" alt="" />SG OnSet</span>
					<span class="tab big"><img src="/favicon.svg" width="64" height="64" alt="" /><img src="/favicon-32.png" width="64" height="64" alt="" /></span>
				</span>
				<figcaption>favicon.svg (it follows the scheme of the browser) and the 32 px PNG, in a tab and four times up</figcaption>
			</figure>
			{#each SPLASH as s (s.src)}
				<figure class="launch">
					<img src={s.src} alt="" loading="lazy" />
					<figcaption>{s.label}</figcaption>
				</figure>
			{/each}
		</div>
	</section>

	<section aria-labelledby="h-word">
		<h2 id="h-word">Wordmark</h2>
		<p class="lede">The marker, then the name in the system face. For the README and the welcome screen.</p>
		<div class="words">
			<div class="word word-light"><img src="/brand/lockup-light.svg" alt="SG OnSet" height="56" /></div>
			<div class="word word-dark"><img src="/brand/lockup-dark.svg" alt="SG OnSet" height="56" /></div>
			<div class="word word-light"><img src="/brand/mark-light.svg" alt="" height="56" /></div>
			<div class="word word-dark"><img src="/brand/mark-dark.svg" alt="" height="56" /></div>
		</div>
	</section>
</main>

<style>
	.sheet {
		--page: #f4f4f6;
		--panel: #ffffff;
		--text: #0d0e12;
		--text-2: #4a4d57;
		--line: #d9dade;
		--blue: #1043a8;
		position: fixed;
		inset: 0;
		overflow-y: auto;
		padding: 48px max(32px, calc((100vw - 1116px) / 2)) 96px;
		background: var(--page);
		color: var(--text);
		font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(html[data-theme='dark']) .sheet:not([data-mode='light']),
	.sheet[data-mode='dark'] {
		--page: #0a0a0b;
		--panel: #19191b;
		--text: #eff0f2;
		--text-2: #a9acb3;
		--line: #2f3033;
		--blue: #8cb9fe;
	}

	h1 {
		font-size: 44px;
		line-height: 1.05;
		letter-spacing: -0.025em;
		font-weight: 700;
		margin: 0 0 12px;
	}
	h2 {
		font-size: 26px;
		line-height: 1.15;
		letter-spacing: -0.018em;
		font-weight: 650;
		margin: 0 0 8px;
	}
	h3 {
		font-size: 17px;
		line-height: 1.3;
		letter-spacing: -0.01em;
		font-weight: 650;
		margin: 0;
	}
	p {
		margin: 0;
		max-width: 68ch;
		color: var(--text-2);
	}
	code {
		font: 0.9em ui-monospace, 'SF Mono', Menlo, monospace;
		color: var(--text);
	}
	section {
		margin-top: 72px;
	}
	.lede {
		margin-bottom: 24px;
	}
	small {
		font-size: 12px;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* The icon: a field with the system's corner, the mark drawn over it. */
	.tile {
		--field: linear-gradient(#232427, #0a0a0b);
		--ink: #eff0f2;
		--accent: #568ef9;
		--rec: #fb4241;
		--gold: #eab53b;
		--deep: #59481c;
		--deep-alpha: 1;
		position: relative;
		display: inline-block;
		flex: none;
		overflow: hidden;
		border-radius: 22.4%;
		background: var(--field);
		vertical-align: middle;
	}
	.tile svg {
		display: block;
	}
	.tile :global(.ink) {
		fill: var(--ink);
	}
	.tile :global(.accent) {
		fill: var(--accent);
	}
	.tile :global(.rec) {
		fill: var(--rec);
	}
	.tile :global(.ink-stroke) {
		stroke: var(--ink);
	}
	.tile :global(.gold) {
		fill: var(--gold);
	}
	.tile :global(.deep) {
		fill: var(--deep);
		fill-opacity: var(--deep-alpha);
	}
	/* Only the gold variants use these: drawn in the default style alone. */
	.tile :global(.deep-stroke) {
		stroke: #59481c;
	}
	.tile :global(.bronze) {
		fill: #845a0f;
	}
	.tile :global(.coal) {
		fill: #3a3c42;
	}
	.tile :global(.seen) {
		fill: #ffd27a;
	}
	.tile :global(.seen-2) {
		fill: #b08a45;
	}
	.tile :global(.dim) {
		opacity: 0.3;
	}
	.st-dark {
		--field: linear-gradient(#161618, #000);
	}
	.st-tinted {
		--field: linear-gradient(#1e1e20, #0b0b0c);
		--ink: #a9cdff;
		--accent: #5d7fae;
		--rec: #5d7fae;
		--gold: #a9cdff;
		--deep: #2f435c;
	}
	.st-clear {
		--field: linear-gradient(rgb(255 255 255 / 0.26), rgb(255 255 255 / 0.1));
		--ink: rgb(255 255 255 / 0.96);
		--accent: rgb(255 255 255 / 0.62);
		--rec: rgb(255 255 255 / 0.62);
		--gold: rgb(255 255 255 / 0.96);
		--deep: #fff;
		--deep-alpha: 0.3;
		backdrop-filter: blur(10px) saturate(160%);
		-webkit-backdrop-filter: blur(10px) saturate(160%);
		box-shadow:
			inset 0 0.5px 0 0.5px rgb(255 255 255 / 0.5),
			inset 0 0 0 0.5px rgb(255 255 255 / 0.22),
			0 4px 14px rgb(0 0 0 / 0.14);
	}

	.wall-day .st-clear {
		--field: linear-gradient(rgb(96 100 124 / 0.46), rgb(96 100 124 / 0.34));
	}
	.wall-day {
		--wall: radial-gradient(120% 90% at 15% 0%, #f6efe6 0%, transparent 60%), linear-gradient(155deg, #dbe6f6, #e9e1f2 55%, #f3e6e1);
		--wall-text: #17181c;
		--wall-shadow: none;
		background: var(--wall);
	}
	.wall-dusk {
		--wall: radial-gradient(110% 90% at 85% 0%, #23324f 0%, transparent 60%), linear-gradient(155deg, #0b1422, #150f26 60%, #060609);
		--wall-text: #f4f5f7;
		--wall-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
		background: var(--wall);
	}

	.hero {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 56px;
		align-items: center;
		margin-top: 48px;
	}
	.hero-icon .tile {
		box-shadow: 0 30px 60px -24px rgb(0 0 0 / 0.45);
	}
	.hero-text h2 {
		font-size: 32px;
	}
	.sizes {
		display: grid;
		gap: 12px;
		margin-top: 28px;
	}
	.size-row,
	.style-row {
		display: flex;
		align-items: flex-end;
		gap: 28px;
		padding: 20px 24px;
		border-radius: 20px;
		color: var(--wall-text);
	}
	.size {
		display: grid;
		justify-items: center;
		gap: 10px;
	}

	.variants {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 24px 16px;
	}
	.variant {
		display: grid;
		gap: 8px;
		align-content: start;
	}
	.variant p {
		font-size: 14.5px;
		line-height: 1.45;
		min-height: 4.35em;
	}
	.variant[data-verdict='chosen'] .verdict {
		color: var(--blue);
	}
	.variant-row {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		padding: 16px;
		border-radius: 20px;
	}

	.homes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.home {
		border-radius: 24px;
		padding: 28px 28px 20px;
		display: grid;
		gap: 22px;
		color: var(--wall-text);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		justify-items: center;
	}
	.dock {
		justify-self: center;
		display: flex;
		gap: 22px;
		padding: 12px 14px;
		border-radius: 28px;
		background: rgb(255 255 255 / 0.22);
		box-shadow: inset 0 0 0 0.5px rgb(255 255 255 / 0.3);
		backdrop-filter: blur(20px) saturate(160%);
		-webkit-backdrop-filter: blur(20px) saturate(160%);
	}
	.dock .app-name {
		display: none;
	}
	.app {
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 64px;
	}
	.app-name {
		font-size: 11.5px;
		line-height: 1.2;
		font-weight: 500;
		letter-spacing: 0.005em;
		white-space: nowrap;
		text-shadow: var(--wall-shadow);
	}

	.styles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.style-set {
		display: grid;
		gap: 10px;
	}
	.style-row {
		justify-content: space-between;
		gap: 8px;
		padding: 18px 16px;
	}

	.concepts {
		list-style: none;
		margin: 24px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.concept {
		display: grid;
		grid-template-columns: 180px 1fr;
		gap: 24px;
		padding: 24px;
		border-radius: 24px;
		background: var(--panel);
	}
	.concept-body {
		display: grid;
		gap: 6px;
		align-content: start;
	}
	.concept-body p {
		font-size: 14.5px;
		line-height: 1.45;
	}
	.concept-body .from {
		color: var(--text);
	}
	.verdict {
		margin-left: 6px;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--text-2);
	}
	.concept[data-verdict='chosen'] .verdict {
		color: var(--blue);
	}
	.concept-sizes {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 14px;
	}

	.build {
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 56px;
		align-items: center;
		margin-top: 24px;
	}
	.build-fig {
		position: relative;
		width: 400px;
		height: 400px;
	}
	.build-fig .tile {
		border-radius: 0;
	}
	.guides {
		position: absolute;
		inset: 0;
		fill: none;
		stroke: #ff5fa2;
		stroke-width: 2.5;
		stroke-dasharray: 10 8;
	}
	.guides .unit {
		stroke: #ffd27a;
		stroke-dasharray: none;
		stroke-width: 4;
	}
	.spec {
		margin: 0;
		display: grid;
		gap: 0;
	}
	.spec div {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: 16px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}
	.spec div:last-child {
		border-bottom: 1px solid var(--line);
	}
	.spec dt {
		font-weight: 600;
	}
	.spec dd {
		margin: 0;
		color: var(--text-2);
	}

	.files {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.files figure {
		flex: 1 1 auto;
	}
	figure {
		margin: 0;
		display: grid;
		gap: 12px;
		align-content: space-between;
		padding: 20px;
		border-radius: 20px;
		background: var(--panel);
	}
	figcaption {
		font-size: 13px;
		line-height: 1.35;
		color: var(--text-2);
		max-width: 30ch;
	}
	figure img {
		display: block;
	}
	.round {
		border-radius: 22.4%;
	}
	.mask-demo {
		display: flex;
		gap: 12px;
	}
	.safe {
		position: relative;
	}
	.safe::after {
		content: '';
		position: absolute;
		inset: 10%;
		border-radius: 50%;
		border: 1.5px dashed #ff5fa2;
	}
	.mono {
		display: inline-block;
		width: 90px;
		border-radius: 50%;
		background: #3d70d1;
	}
	.tabs {
		display: grid;
		gap: 8px;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px 7px 10px;
		border-radius: 9px;
		font-size: 12.5px;
		font-weight: 500;
	}
	.tab {
		background: #e4e4e9;
		color: #1c1c1e;
	}
	.tab.big {
		gap: 14px;
		padding: 12px;
	}
	.tab.big img {
		image-rendering: pixelated;
	}
	@media (prefers-color-scheme: dark) {
		.tab {
			background: #2b2b2e;
			color: #f2f2f4;
		}
	}
	.splashes {
		display: grid;
		grid-template-columns: repeat(5, auto);
		justify-content: space-between;
		align-items: stretch;
		gap: 16px;
		margin-top: 16px;
	}
	.launch img {
		height: 150px;
		width: auto;
		border-radius: 10px;
		box-shadow: 0 0 0 1px var(--line);
	}

	.words {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.word {
		padding: 40px;
		border-radius: 24px;
	}
	.word img {
		display: block;
		height: 56px;
		width: auto;
	}
	.word-light {
		background: #ecedf2;
	}
	.word-dark {
		background: #0a0a0b;
		box-shadow: inset 0 0 0 1px #2f3033;
	}

	@media (max-width: 900px) {
		.hero,
		.build,
		.homes,
		.styles,
		.variants,
		.concepts,
		.words {
			grid-template-columns: 1fr;
		}
		.concept {
			grid-template-columns: 1fr;
		}
		.splashes {
			grid-template-columns: repeat(2, auto);
			justify-content: start;
		}
	}
</style>
