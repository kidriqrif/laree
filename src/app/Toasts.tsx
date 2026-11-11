import { lazy, Suspense } from 'react'

// Loaded after first paint, so the toast code stays out of the entry chunk. The queue lives in the
// same module as the region, so a toast shown before the region arrives still appears.
const Region = lazy(async () => ({ default: (await import('../ui/overlay/Toast.tsx')).ToastRegion }))

/**
 * The one place toasts appear. Each shell mounts it once with its register, so the region sits
 * above the athlete bar or at the coach's bottom left. Pages call showToast and never mount a
 * region of their own.
 */
export function Toasts({ register }: { register: 'athlete' | 'coach' }) {
  return (
    <Suspense fallback={null}>
      <Region register={register} />
    </Suspense>
  )
}
