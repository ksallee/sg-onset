// What a page can ask of the shell around it: open the project and day picker, open the sync
// detail. `provideShell()` in the shell, `useShell()` in any page under it.
import { getContext, setContext } from 'svelte';

export interface Shell {
	/** Opens the sheet that picks the project and the shoot day. */
	openContext(): void;
	/** Opens the sync detail: counts, what needs a look, the account, the backup. */
	openSync(): void;
}

const KEY = Symbol('sg-onset-shell');

export function provideShell(shell: Shell): Shell {
	setContext(KEY, shell);
	return shell;
}

export function useShell(): Shell {
	const shell = getContext<Shell | undefined>(KEY);
	if (!shell) throw new Error('useShell: no shell in context. It is provided by the app layout.');
	return shell;
}
