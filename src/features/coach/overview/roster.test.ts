import { beforeEach, describe, expect, it } from 'vitest'
import { currentDay, selectOpenFlagCount, selectRosterRows } from '../../../data/selectors.ts'
import { useLaree } from '../../../data/store.ts'
import {
  DEFAULT_SORT,
  attentionItems,
  formatSort,
  parseSort,
  rosterEntries,
  sortEntries,
  statusPhrases,
  teamStatus,
} from './roster.ts'
import type { RosterEntry } from './roster.ts'

beforeEach(() => {
  localStorage.clear()
  useLaree.getState().reset()
})

const data = () => useLaree.getState().data

describe('rosterEntries', () => {
  it('builds one entry per athlete from the roster selector', () => {
    const today = currentDay()
    const entries = rosterEntries(data(), today)
    const rows = selectRosterRows(data(), today)
    expect(entries.map((e) => e.id)).toEqual(['amir', 'danial', 'irfan'])
    for (const e of entries) {
      const row = rows.find((r) => r.athleteId === e.id)
      expect(e.error).toBe(false)
      expect(e.fitness).toBe(row?.fitness)
      expect(e.form).toBe(row?.form)
      expect(e.ramp).toBe(row?.ramp)
      expect(e.race?.id).toBe(row?.nextRace?.id)
      expect(e.trend.length).toBe(8)
    }
  })
})

const entry = (id: RosterEntry['id'], index: number, over: Partial<RosterEntry>): RosterEntry => ({
  ...rosterEntries(data(), currentDay())[index]!,
  id,
  index,
  ...over,
})

describe('sorting', () => {
  it('puts empty values last and keeps roster order for ties', () => {
    const list = [
      entry('amir', 0, { fitness: null, checkedInToday: true }),
      entry('danial', 1, { fitness: 40, checkedInToday: true }),
      entry('irfan', 2, { fitness: 40, checkedInToday: true }),
    ]
    expect(sortEntries(list, { column: 'fitness', direction: 'ascending' }).map((e) => e.id)).toEqual([
      'danial',
      'irfan',
      'amir',
    ])
  })

  it('breaks ties with the missing check-in first', () => {
    const list = [
      entry('amir', 0, { fitness: 40, checkedInToday: true }),
      entry('danial', 1, { fitness: 40, checkedInToday: false }),
    ]
    expect(sortEntries(list, { column: 'fitness', direction: 'descending' }).map((e) => e.id)).toEqual(['danial', 'amir'])
  })

  it('ranks two flags above one, whatever their severity', () => {
    const base = Object.values(data().flagsState).flatMap((s) => s.flags)[0]
    expect(base).toBeDefined()
    if (!base) return
    const one = entry('amir', 0, { flags: [{ ...base, severity: 'act' }] })
    const two = entry('danial', 1, { flags: [{ ...base, severity: 'info' }, { ...base, severity: 'info' }] })
    expect(sortEntries([one, two], DEFAULT_SORT).map((e) => e.id)).toEqual(['danial', 'amir'])
  })

  it('reads and writes the saved preference, falling back to flags first', () => {
    expect(parseSort(undefined)).toEqual(DEFAULT_SORT)
    expect(parseSort('nonsense:up')).toEqual(DEFAULT_SORT)
    expect(parseSort('form:descending')).toEqual({ column: 'form', direction: 'descending' })
    expect(parseSort(formatSort({ column: 'ramp', direction: 'ascending' }))).toEqual({ column: 'ramp', direction: 'ascending' })
  })
})

describe('status line', () => {
  it('counts open flags the same way as the selectors', () => {
    expect(teamStatus(data(), currentDay()).openFlags).toBe(selectOpenFlagCount(data()))
  })

  it('writes plain English with singulars and zeros', () => {
    expect(statusPhrases({ openFlags: 1, missingCheckIns: 2, sessionsToday: 0 })).toEqual({
      flags: '1 open flag',
      checkIns: '2 check-ins missing',
      sessions: 'No sessions today',
    })
    expect(statusPhrases({ openFlags: 0, missingCheckIns: 0, sessionsToday: 1 })).toEqual({
      flags: 'No open flags',
      checkIns: 'No check-ins missing',
      sessions: '1 session today',
    })
  })
})

describe('needs attention', () => {
  it('lists every open flag before missed key sessions', () => {
    const today = currentDay()
    const entries = rosterEntries(data(), today)
    const items = attentionItems(data(), entries, today)
    const flags = items.filter((i) => i.kind === 'flag')
    expect(flags.length).toBe(selectOpenFlagCount(data()))
    const kinds = items.map((i) => i.kind)
    expect(kinds).toEqual([...kinds].toSorted((a, b) => Number(a === 'missed') - Number(b === 'missed')))
  })
})
