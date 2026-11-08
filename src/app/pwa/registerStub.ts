/** Test stand-in for virtual:pwa-register/react (aliased in vite.config.ts under vitest). */
import type { Dispatch, SetStateAction } from 'react'

type Setter = Dispatch<SetStateAction<boolean>>
const noop: Setter = () => {}

export function useRegisterSW() {
  return {
    needRefresh: [false, noop] as [boolean, Setter],
    offlineReady: [false, noop] as [boolean, Setter],
    updateServiceWorker: async (_reload?: boolean) => {},
  }
}
