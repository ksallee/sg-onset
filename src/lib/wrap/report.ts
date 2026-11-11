// The printed day report: HTML from `dayReport`, one page set per day, and the print CSS that
// goes with it. Black on white whatever the app's appearance: it is paper. The same text is the
// print view in the app and the day report file in the wrap package. Everything typed is escaped.
// Pure: the clock and the units come in.

import { dayName } from '$lib/app/context';
import { formatDate, formatTime } from '$lib/app/format';
import type { DayReport, DayReportSlate } from '$lib/export/dayReport';
import type { FlatTake } from '$lib/export/selection';
import { t, tk } from '$lib/i18n/messages';
import { fieldShortLabel, optionLabel } from '$lib/i18n/modelText';
import { findField } from '$lib/model/catalogue';
import { formatLength, type Length, type UnitSystem } from '$lib/model/length';
import { formatRational } from '$lib/model/rational';

export type Paper = 'a4' | 'letter';

/** Letter where it is the custom, A4 elsewhere. */
const LETTER = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'CR', 'PR', 'SV', 'DO', 'NI', 'PA']);

export function defaultPaper(locale: string): Paper {
	const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase();
	return region && LETTER.has(region) ? 'letter' : 'a4';
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const e = (v: string | number | undefined) => escapeHtml(v === undefined ? '' : String(v));

export type ReportOptions = { units: UnitSystem; printedAt: Date };

/** A short label of a take field, as the take table shows it. */
const short = (key: string) => {
	const f = findField('take', key);
	return f ? fieldShortLabel(f.def) : key;
};

/** Start and end, the end only when it differs: "10' → 6' 4"". */
function range(start: string, end: string): string {
	if (start === '' && end === '') return '';
	if (end === '' || end === start) return start;
	return `${start} → ${end}`;
}

const signed = (n: number | undefined) => (n === undefined ? '' : `${n > 0 ? '+' : ''}${n}°`);
const length = (l: Length | undefined, units: UnitSystem) => (l ? formatLength(l, units) : '');

/** The take table's columns: header and cell. */
function columns(units: UnitSystem): { head: string; cls?: string; cell: (r: FlatTake) => string }[] {
	return [
		{ head: short('cameraSetupId'), cls: 'c', cell: (r) => r.cameraLetter },
		{ head: short('startedAt'), cls: 'n', cell: (r) => formatTime(r.take.startedAt) },
		{ head: short('endedAt'), cls: 'n', cell: (r) => formatTime(r.take.endedAt) },
		{ head: short('focalLength'), cls: 'n', cell: (r) => (r.focalLength ? range(`${r.focalLength.start}`, `${r.focalLength.end}`) : '') },
		{ head: short('tStop'), cls: 'n', cell: (r) => (r.take.tStop === undefined ? '' : `T${r.take.tStop}`) },
		{ head: short('focusDistance'), cls: 'n', cell: (r) => range(length(r.take.focusDistance, units), length(r.take.focusDistanceEnd, units)) },
		{ head: short('lensHeight'), cls: 'n', cell: (r) => range(length(r.take.lensHeight, units), length(r.take.lensHeightEnd, units)) },
		{ head: short('tilt'), cls: 'n', cell: (r) => range(signed(r.take.tilt), signed(r.take.tiltEnd)) },
		{ head: short('isoSpeed'), cls: 'n', cell: (r) => (r.take.isoSpeed === undefined ? '' : String(r.take.isoSpeed)) },
		{ head: short('whiteBalance'), cls: 'n', cell: (r) => (r.take.whiteBalance === undefined ? '' : `${r.take.whiteBalance}K`) },
		{ head: short('shutterAngle'), cls: 'n', cell: (r) => (r.take.shutterAngle === undefined ? '' : `${r.take.shutterAngle}°`) },
		{ head: short('captureFrameRate'), cls: 'n', cell: (r) => (r.take.captureFrameRate ? formatRational(r.take.captureFrameRate) : '') },
		{ head: short('cameraRoll'), cell: (r) => r.take.cameraRoll ?? '' },
		{ head: short('clipName'), cell: (r) => r.take.clipName ?? '' },
		{ head: short('timecodeStart'), cls: 'n', cell: (r) => r.take.timecodeStart ?? '' }
	];
}

function option(scope: 'slate', key: string, value: string | undefined): string {
	if (!value) return '';
	const f = findField(scope, key);
	return f ? optionLabel(f.def, value) : value;
}

/** A slate this short is kept on one page; a longer one breaks between takes. */
const KEEP_TOGETHER = 14;

type Column = ReturnType<typeof columns>[number];

function slateBlock(block: DayReportSlate, cols: readonly Column[]): string {
	const s = block.slate;
	const about = [
		s.sceneNumber ? t('wrap.report.scene', { scene: s.sceneNumber }) : '',
		option('slate', 'interiorExterior', s.interiorExterior),
		option('slate', 'scriptTime', s.scriptTime),
		s.vfxShots?.length ? t('wrap.report.vfx', { shots: s.vfxShots.join(', ') }) : ''
	].filter(Boolean);
	const l = block.lightingSetup;
	const lighting = l
		? [l.label ?? '', l.hdri ? `${t('wrap.report.hdri')}${l.hdriFilename ? ` ${l.hdriFilename}` : ''}` : '', l.referenceBalls ? t('wrap.report.balls') : '', l.colourChart ? t('wrap.report.chart') : ''].filter(Boolean).join(', ')
		: '';
	const media = [s.cleanPlate ? t('wrap.report.cleanPlate') : '', s.witnessCamera ? t('wrap.report.witness') : '', s.lidar ? t('wrap.report.lidar') : ''].filter(Boolean).join(', ');
	const facts = [lighting ? `<span><b>${e(t('wrap.report.lighting'))}</b> ${e(lighting)}</span>` : '', media ? `<span><b>${e(t('wrap.report.setMedia'))}</b> ${e(media)}</span>` : ''].filter(Boolean).join('');
	const cams = block.setups
		.map((c) => {
			const body = [c.camera?.cameraMake, c.camera?.cameraModel].filter(Boolean).join(' ');
			const lenses = c.lenses.map((x) => x.lensModel ?? [x.lensMake, x.focalLength ? `${x.focalLength} mm` : ''].filter(Boolean).join(' ')).join(', ');
			return `<span><b>${e(c.cameraLetter)}</b> ${e([body, lenses].filter(Boolean).join(' · '))}</span>`;
		})
		.join('');
	const head = `<tr><th class="t">${e(t('wrap.report.take'))}</th>${cols.map((c) => `<th${c.cls ? ` class="${c.cls}"` : ''}>${e(c.head)}</th>`).join('')}<th class="m">${e(t('wrap.report.mark'))}</th><th class="notes">${e(t('wrap.report.notes'))}</th></tr>`;
	const rows = block.takes
		.map((r) => {
			const circled = !!r.take.circleTake;
			const ng = !!r.take.noGood;
			const cls = [circled ? 'circled' : '', ng ? 'ng' : ''].filter(Boolean).join(' ');
			const mark = [circled ? t('wrap.report.circled') : '', ng ? t('wrap.report.ng') : ''].filter(Boolean).map((m) => `<span>${e(m)}</span>`).join(' ');
			return `<tr${cls ? ` class="${cls}"` : ''}><td class="t"><span class="take">${e(r.take.take)}</span></td>${cols.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ''}>${e(c.cell(r))}</td>`).join('')}<td class="m">${mark}</td><td class="notes">${e(r.take.notes)}</td></tr>`;
		})
		.join('');
	const table = block.takes.length ? `<table><thead>${head}</thead><tbody>${rows}</tbody></table>` : `<p class="empty">${e(t('wrap.report.noTakes'))}</p>`;
	return `<section class="slate${block.takes.length <= KEEP_TOGETHER ? ' keep' : ''}" data-slate="${e(s.slateUID)}"><div class="slate-head"><h2>${e(t('wrap.report.slate', { slate: s.slateUID ?? '' }))}</h2><span class="about">${e(about.join(' · '))}</span></div>${s.description ? `<p class="desc">${e(s.description)}</p>` : ''}${facts ? `<p class="facts">${facts}</p>` : ''}${cams ? `<p class="cams">${cams}</p>` : ''}${s.notes ? `<p class="snotes">${e(s.notes)}</p>` : ''}${table}</section>`;
}

function todoBlock(report: DayReport): string {
	if (!report.warnings.length) return '';
	const items = report.warnings
		.map((w) => {
			const take = w.cameraLetter ? t('wrap.todo.takeCam', { slate: w.slate, take: w.take, camera: w.cameraLetter }) : t('wrap.todo.take', { slate: w.slate, take: w.take });
			return `<li><b>${e(take)}</b> ${e(tk(`wrap.todo.${w.kind}`))}</li>`;
		})
		.join('');
	return `<section class="todo" data-section="todo"><h2>${e(t('wrap.report.todo'))}</h2><ul>${items}</ul></section>`;
}

function dayBlock(report: DayReport, options: ReportOptions, next: boolean): string {
	const h = report.header;
	const day = dayName({ shootDay: h.shootDay });
	const meta: [string, string | undefined][] = [
		[t('wrap.report.day'), t(day.key, day.params)],
		[t('wrap.report.date'), formatDate(h.shootDate)],
		[t('wrap.report.unit'), h.unit],
		[t('wrap.report.location'), h.location],
		[t('wrap.report.wrangler'), h.wrangler]
	];
	const totals = t('wrap.report.totals', { ...report.totals });
	// A column no take of the day fills is left out: the table stays legible.
	const rows = report.slates.flatMap((s) => s.takes);
	const cols = columns(options.units).filter((c) => rows.some((r) => c.cell(r) !== ''));
	const printed = t('wrap.report.printed', { date: formatDate(`${options.printedAt.getFullYear()}-${String(options.printedAt.getMonth() + 1).padStart(2, '0')}-${String(options.printedAt.getDate()).padStart(2, '0')}`), time: formatTime(options.printedAt.toISOString()) });
	const body = report.slates.length && report.totals.takes ? report.slates.map((b) => slateBlock(b, cols)).join('') : `<p class="empty" data-empty>${e(t('wrap.report.noTakesDay'))}</p>`;
	return `<article class="day${next ? ' next' : ''}"><header class="head"><div class="kind">${e(t('wrap.report.kind'))}</div><h1>${e(h.project)}</h1><dl>${meta
		.filter(([, v]) => v)
		.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`)
		.join('')}</dl><p class="totals">${e(totals)}</p></header>${body}${todoBlock(report)}<footer class="printed">${e(printed)}</footer></article>`;
}

/** The reports of the days, each starting on a new page. Goes inside an element of class `wrap-report`. */
export function reportBody(reports: readonly DayReport[], options: ReportOptions): string {
	return reports.map((r, i) => dayBlock(r, options, i > 0)).join('');
}

/** The report's CSS, scoped to `.wrap-report`, and the page size. */
export function reportCss(paper: Paper): string {
	return `@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 12mm 11mm 13mm; }
.wrap-report { color: #000; background: #fff; font: 8.5pt/1.32 -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif; font-variant-numeric: tabular-nums; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wrap-report * { box-sizing: border-box; }
.wrap-report .day.next { break-before: page; }
.wrap-report .head { border-bottom: 1.5pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; break-after: avoid; }
.wrap-report .kind { font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #444; }
.wrap-report h1 { font-size: 17pt; line-height: 1.15; margin: 1pt 0 5pt; font-weight: 700; }
.wrap-report dl { display: flex; flex-wrap: wrap; gap: 2pt 16pt; margin: 0; }
.wrap-report dl div { display: flex; gap: 4pt; align-items: baseline; }
.wrap-report dt { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
.wrap-report dd { margin: 0; font-weight: 600; }
.wrap-report .totals { margin: 5pt 0 0; color: #222; }
.wrap-report .slate { margin: 0 0 10pt; }
.wrap-report .slate.keep { break-inside: avoid; }
.wrap-report .slate-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2pt 8pt; border-bottom: 0.75pt solid #000; padding-bottom: 1.5pt; break-after: avoid; }
.wrap-report h2 { font-size: 11pt; margin: 0; font-weight: 700; }
.wrap-report .about { color: #333; }
.wrap-report .desc, .wrap-report .facts, .wrap-report .cams, .wrap-report .snotes { margin: 2.5pt 0 0; break-after: avoid; }
.wrap-report .desc { font-style: italic; }
.wrap-report .facts, .wrap-report .cams { display: flex; flex-wrap: wrap; gap: 1pt 12pt; color: #222; }
.wrap-report .facts b, .wrap-report .cams b { font-weight: 700; margin-right: 2pt; }
.wrap-report table { width: 100%; border-collapse: collapse; margin-top: 4pt; }
.wrap-report thead { display: table-header-group; }
.wrap-report tr { break-inside: avoid; }
.wrap-report th { font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; text-align: left; color: #333; border-bottom: 0.75pt solid #000; padding: 1.5pt 3pt; white-space: nowrap; }
.wrap-report td { padding: 2pt 3pt; border-bottom: 0.4pt solid #bbb; vertical-align: baseline; }
.wrap-report td.n, .wrap-report th.n { white-space: nowrap; }
.wrap-report td.c, .wrap-report th.c { text-align: center; font-weight: 600; }
.wrap-report td.t, .wrap-report th.t { width: 2.6em; text-align: center; }
.wrap-report .take { display: inline-block; min-width: 1.9em; padding: 0 2pt; font-weight: 700; border: 0.9pt solid transparent; border-radius: 999px; }
.wrap-report tr.circled .take { border-color: #000; }
.wrap-report tr.ng td { color: #666; }
.wrap-report tr.ng .take { text-decoration: line-through; }
.wrap-report td.m { white-space: nowrap; font-weight: 600; font-size: 7.5pt; }
.wrap-report td.notes { width: 22%; }
.wrap-report .empty { color: #444; font-style: italic; margin: 4pt 0; }
.wrap-report .todo { margin-top: 12pt; border-top: 0.75pt solid #000; padding-top: 4pt; break-inside: avoid; }
.wrap-report .todo ul { margin: 3pt 0 0; padding-left: 12pt; columns: 2; column-gap: 18pt; }
.wrap-report .todo li { break-inside: avoid; }
.wrap-report .printed { margin-top: 10pt; font-size: 7pt; color: #555; }`;
}

/** A page that stands alone: the day report file of the package. */
export function reportDocument(body: string, options: { title: string; paper: Paper }): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
html, body { margin: 0; background: #fff; }
@media screen { body { padding: 24px; } .wrap-report { max-width: 1000px; margin: 0 auto; } }
${reportCss(options.paper)}
</style>
</head>
<body><main class="wrap-report">${body}</main></body>
</html>
`;
}
