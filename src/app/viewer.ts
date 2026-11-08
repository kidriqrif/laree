import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isAthleteId, type AthleteId, type ViewerChoice } from './people.ts'

export const VIEWER_KEY = 'laree:v1:viewer'

export interface ViewerState {
  role: 'coach' | 'athlete'
  /** The athlete being viewed, or the last one used when the role is coach. */
  athleteId: AthleteId
  /** The last athlete the coach looked at: default for the optional-id coach routes. */
  coachAthleteId: AthleteId
  /** True once a role has been picked, so the role picker can offer "Continue as". */
  chosen: boolean
  viewAs: (choice: ViewerChoice) => void
  setCoachAthlete: (id: AthleteId) => void
}

function safeStorage(): Storage {
  try {
    return localStorage
  } catch {
    // Storage blocked: the choice still works for this visit.
    return { length: 0, clear() {}, getItem: () => null, key: () => null, removeItem() {}, setItem() {} }
  }
}

export const useViewer = create<ViewerState>()(
  persist(
    (set) => ({
      role: 'athlete',
      athleteId: 'amir',
      coachAthleteId: 'amir',
      chosen: false,
      viewAs: (choice) =>
        set(choice === 'coach' ? { role: 'coach', chosen: true } : { role: 'athlete', athleteId: choice, chosen: true }),
      setCoachAthlete: (id) => set({ coachAthleteId: id }),
    }),
    {
      name: VIEWER_KEY,
      storage: createJSONStorage(safeStorage),
      partialize: (s) => ({ role: s.role, athleteId: s.athleteId, coachAthleteId: s.coachAthleteId, chosen: s.chosen }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ViewerState>
        return {
          ...current,
          role: p.role === 'coach' ? 'coach' : 'athlete',
          athleteId: isAthleteId(p.athleteId) ? p.athleteId : current.athleteId,
          coachAthleteId: isAthleteId(p.coachAthleteId) ? p.coachAthleteId : current.coachAthleteId,
          chosen: p.chosen === true,
        }
      },
    },
  ),
)

/** The switcher's current option. */
export function viewerChoice(s: Pick<ViewerState, 'role' | 'athleteId'>): ViewerChoice {
  return s.role === 'coach' ? 'coach' : s.athleteId
}

// The last coach route visited lives in memory only (IA section 9.2).
let lastCoachRoute: string | null = null
export function getLastCoachRoute(): string | null {
  return lastCoachRoute
}
export function setLastCoachRoute(route: string | null): void {
  lastCoachRoute = route
}
