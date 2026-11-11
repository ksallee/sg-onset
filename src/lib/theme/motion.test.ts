import { describe, expect, it } from 'vitest';
import { springLinear } from '$lib/ios/spring';
import { CSS_SPRINGS, DURATIONS, EASINGS, SPRINGS, springCss } from './motion';

// Node's fs without its types, as palette.test.ts reads tokens.css.
const fs: { readFileSync(path: URL, encoding: 'utf8'): string } = await import(/* @vite-ignore */ `node:${'fs'}`);
const css = fs.readFileSync(new URL('./motion.css', import.meta.url), 'utf8');
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('motion.css and motion.ts say the same', () => {
	it.each(CSS_SPRINGS)('the %s spring is the linear() of its preset, with its duration', (name) => {
		const { easing, duration } = springLinear(SPRINGS[name]);
		expect(css).toContain(`--spring-${name}: ${easing};`);
		expect(css).toContain(`--dur-${name}: ${duration}ms;`);
		expect(springCss(name)).toEqual({ easing, duration });
	});
	it.each(Object.entries(EASINGS))('the %s easing', (name, value) => {
		expect(css).toContain(`--ease-${kebab(name)}: ${value};`);
	});
	it.each(Object.entries(DURATIONS))('the %s duration', (name, ms) => {
		expect(css).toContain(`--dur-${kebab(name)}: ${ms}ms;`);
	});
});

describe('the presets', () => {
	it('never bounce: content does not overshoot', () => {
		for (const spring of Object.values(SPRINGS)) expect(spring.damping).toBe(1);
	});
	it('a control settles within 300 ms, a page within half a second', () => {
		expect(springCss('snappy').duration).toBeLessThanOrEqual(300);
		expect(springCss('page').duration).toBeLessThanOrEqual(500);
	});
});
