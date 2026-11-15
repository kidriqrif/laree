/** Library edits that the store has no action for: duplicate and delete a template. Pure data moves. */
import { useLaree } from '../../../data/store.ts'
import type { WorkoutTemplate } from '../../../domain/types.ts'
import { newId } from '../../../data/ids.ts'

/** A fresh id for a template the coach makes. */
export function nextTemplateId(): string {
  return newId()
}

/** Copies a template under a new id and name. Returns the new id. */
export function duplicateTemplate(id: string): string | undefined {
  const { data, saveTemplate } = useLaree.getState()
  const source = data.templates.find((t) => t.id === id)
  if (!source) return undefined
  const copyId = nextTemplateId()
  saveTemplate({ ...structuredClone(source), id: copyId, name: `${source.name} (copy)` })
  return copyId
}

/** Removes a template. Returns it so the caller can offer Undo. */
export function deleteTemplate(id: string): WorkoutTemplate | undefined {
  const found = useLaree.getState().data.templates.find((t) => t.id === id)
  if (!found) return undefined
  useLaree.setState((s) => ({ data: { ...s.data, templates: s.data.templates.filter((t) => t.id !== id) } }))
  return found
}

/**
 * Puts a deleted template back (Undo). If a newer workout has taken its id since the delete,
 * the restored one gets a fresh id, so Undo never overwrites that newer workout.
 */
export function restoreTemplate(template: WorkoutTemplate): void {
  const { data, saveTemplate } = useLaree.getState()
  const taken = data.templates.some((t) => t.id === template.id)
  saveTemplate(taken ? { ...template, id: nextTemplateId() } : template)
}
