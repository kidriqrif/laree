/**
 * Ids for records made on this device. Random UUIDs, so a record made offline keeps its id when it
 * syncs, and an id made this week never matches one made in another week. Seed ids stay readable.
 */
export function newId(): string {
  return crypto.randomUUID()
}
