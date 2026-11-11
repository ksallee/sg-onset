import { describe, expect, it } from 'vitest';
import { storageAdvice, type StorageFacts } from './storageAdvice';

const facts = (over: Partial<StorageFacts>): StorageFacts => ({
	supported: true,
	status: { persisted: false, usage: 12_400_000, quota: 2_000_000_000, free: 1_987_600_000 },
	standalone: false,
	hint: 'browser',
	refused: false,
	...over
});

describe('storageAdvice', () => {
	it('is nothing until the browser has answered', () => {
		expect(storageAdvice(facts({ status: undefined }))).toBeUndefined();
	});

	it('is protected once the browser has said so, whatever else', () => {
		const a = storageAdvice(facts({ status: { persisted: true, usage: 5, quota: 10, free: 5 }, hint: 'ios-share' }))!;
		expect(a).toMatchObject({ level: 'protected', state: 'settings.storage.state.protected', body: 'settings.storage.body.protected', action: 'none' });
	});

	it('in a Safari tab on iPadOS says what may happen and what to do: add it to the Home Screen', () => {
		const a = storageAdvice(facts({ hint: 'ios-share' }))!;
		expect(a).toMatchObject({ level: 'at-risk', state: 'settings.storage.state.atRisk', body: 'settings.storage.body.safariTab', action: 'install' });
	});

	it('in an in-app browser on iOS sends the person to Safari first', () => {
		expect(storageAdvice(facts({ hint: 'ios-open-in-safari' }))).toMatchObject({ level: 'at-risk', body: 'settings.storage.body.inApp', action: 'open-in-safari' });
	});

	it('on the Home Screen is safe from the 7-day cleanup, and can ask for more', () => {
		expect(storageAdvice(facts({ standalone: true, hint: 'none' }))).toMatchObject({
			level: 'installed',
			state: 'settings.storage.state.installed',
			body: 'settings.storage.body.installed',
			action: 'ask'
		});
	});

	it('in another browser offers to ask, and after a no says what is left to do', () => {
		expect(storageAdvice(facts({}))).toMatchObject({ level: 'at-risk', body: 'settings.storage.body.browser', action: 'ask' });
		expect(storageAdvice(facts({ refused: true }))).toMatchObject({ level: 'at-risk', body: 'settings.storage.body.refused', action: 'ask' });
		expect(storageAdvice(facts({ refused: true, standalone: true, hint: 'none' }))).toMatchObject({ level: 'installed', body: 'settings.storage.body.installedRefused' });
	});

	it('with no storage API says it cannot tell, and to back up', () => {
		expect(storageAdvice(facts({ supported: false, status: { persisted: false } }))).toMatchObject({
			level: 'unknown',
			state: 'settings.storage.state.unknown',
			body: 'settings.storage.body.unknown',
			action: 'none',
			used: undefined,
			free: undefined
		});
	});

	it('shows what is used and what is free, or nothing when the estimate is missing', () => {
		expect(storageAdvice(facts({}))).toMatchObject({ used: '12.4 MB', free: '2 GB' });
		expect(storageAdvice(facts({ status: { persisted: false } }))).toMatchObject({ used: undefined, free: undefined });
		expect(storageAdvice(facts({ status: { persisted: false, usage: 3_000 } }))).toMatchObject({ used: '3 KB', free: undefined });
	});

	it('warns when the device is nearly full', () => {
		expect(storageAdvice(facts({ status: { persisted: true, usage: 95, quota: 100, free: 5, usedFraction: 0.95 } }))!.low).toBe(true);
		expect(storageAdvice(facts({}))!.low).toBe(false);
	});
});
