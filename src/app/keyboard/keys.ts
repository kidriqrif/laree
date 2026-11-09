/** Pure helpers for the hotkey layer: key strings, text-field detection and display. */

/** The longest wait between the two keys of a sequence such as "g c". */
export const SEQUENCE_WINDOW_MS = 1000

/** "g c" -> ["g", "c"]. A literal space key is written "Space". */
export function parseKeys(keys: string): string[] {
  return keys
    .trim()
    .split(/\s+/)
    .map((k) => (k === 'Space' ? ' ' : k))
}

/** Plain-text label for help: "g then c", "?" or "n". */
export function describeKeys(keys: string): string {
  return parseKeys(keys)
    .map((k) => (k === ' ' ? 'Space' : k))
    .join(' then ')
}

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** True when a key press belongs to the thing being typed into, not to a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (FIELD_TAGS.has(target.tagName)) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  if (target.closest('[contenteditable=""],[contenteditable="true"]')) return true
  const role = target.getAttribute('role')
  if (
    (role === 'combobox' || role === 'textbox' || role === 'searchbox') &&
    target.getAttribute('aria-expanded') !== 'false'
  ) {
    return true
  }
  return false
}

/** True while any modal dialog is open: then only the dialog's own keys work. */
export function isDialogOpen(doc: Document): boolean {
  // Toasts are non-modal alertdialogs inside a region; they must not block shortcuts.
  for (const el of doc.querySelectorAll('[role="dialog"],[role="alertdialog"]')) {
    if (el.getAttribute('aria-modal') === 'false') continue
    if (el.closest('[role="region"]')) continue
    return true
  }
  return false
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Process'])

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}
