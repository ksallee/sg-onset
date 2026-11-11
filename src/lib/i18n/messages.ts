// Every string the app shows comes from here. English only for now (`en.ts`); a second language
// is a second file with the same keys, picked here.
import { en } from './en';

export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

/** Puts `params` into the `{name}` places of a message. Pure. */
export function fill(template: string, params: Params): string {
	return template.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all));
}

export function t(key: MessageKey, params?: Params): string {
	return params ? fill(en[key], params) : en[key];
}
