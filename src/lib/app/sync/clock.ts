// The app's clock, to the second. FPT keeps a date-time to the second (corpus
// findings/field_types/date_time.md): a time with milliseconds reads back as another value, and
// the next edit of it shows a conflict. Every time the app stamps comes from `app.now()`, which
// uses this. Pure.

export function toSecond(ms: number): number {
	return Math.floor(ms / 1000) * 1000;
}
