/** Library edits that the store has no action for: duplicate and delete a template. Pure data moves. */
import { useLaree } from '../../../data/store.ts'
import type { WorkoutTemplate } from '../../../domain/types.ts'

/** A fresh id for a template the coach makes: custom-1, custom-2 and so on. */
export function nextTemplateId(templates: readonly WorkoutTemplate[]): string {
  let max = 0
  for (const t of templates) {
    const m = /^custom-(\d+)$/.exec(t.id)
    if (m?.[1]) max = Math.max(max, Number(m[1]))
  }
  return `custom-${max + 1}`
}

/** Copies a template under a new id and name. Returns the new id. */
export function duplicateTemplate(id: string): string | undefined {
  const { data, saveTemplate } = useLaree.getState()
  const source = data.templates.find((t) => t.id === id)
  if (!source) return undefined
  const copyId = nextTemplateId(data.templates)
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

/** Puts a deleted template back (Undo). */
export function restoreTemplate(template: WorkoutTemplate): void {
  useLaree.getState().saveTemplate(template)
}
