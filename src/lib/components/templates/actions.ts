// Template actions shared by the list and the editor: new, duplicate, delete. Each is one undo.
// A deleted template's entries keep their values and are unlinked in the same undo.

import type { App } from '$lib/app/app.svelte';
import { t } from '$lib/i18n/messages';
import type { TemplateRecord, TemplateScope } from '$lib/model/template';
import { unlinkPatch } from '$lib/templates/divergence';
import { copyName } from '$lib/templates/list';

type Linked = { id: string; templateId?: string };

export async function newTemplate(app: App, projectId: string, scope: TemplateScope, names: string[]): Promise<TemplateRecord> {
	const name = copyName(scope === 'slate' ? t('templates.name.slate') : t('templates.name.take'), names, true);
	const tp: TemplateRecord = { id: app.newId(), projectId, scope, name, values: {} };
	await app.edit.create('template', tp, { label: { key: 'templates.created', params: { name } } });
	return tp;
}

export async function duplicateTemplate(app: App, tp: TemplateRecord, names: string[]): Promise<TemplateRecord> {
	const copy: TemplateRecord = { ...structuredClone(tp), id: app.newId(), name: copyName(tp.name, names) };
	await app.edit.create('template', copy, { label: { key: 'templates.duplicated', params: { name: copy.name } } });
	return copy;
}

export async function deleteTemplate(app: App, tp: TemplateRecord, linked: readonly Linked[]): Promise<void> {
	const mine = linked.filter((r) => r.templateId === tp.id);
	await app.edit.group({ key: 'templates.deleted', params: { name: tp.name } }, async () => {
		if (mine.length) await app.edit.apply(tp.scope, mine.flatMap(unlinkPatch));
		await app.edit.remove('template', tp.id);
	});
}
