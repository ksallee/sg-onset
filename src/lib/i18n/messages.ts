// Every string the app shows comes from here. English only for now (`en/`, one file per area);
// a second language is a second folder with the same keys, picked here.
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

/** Whether the catalogue has `key`: for keys held as data (the model's label and issue keys). */
export function hasMessage(key: string): key is MessageKey {
	return Object.hasOwn(en, key);
}

/** `t` for a key held as data. A key the catalogue lacks comes back as it is, so the gap shows. */
export function tk(key: string, params?: Params): string {
	return hasMessage(key) ? t(key, params) : key;
}
