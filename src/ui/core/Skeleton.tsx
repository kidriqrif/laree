import { forwardRef } from 'react'
import type { CSSProperties, HTMLAttributes } from 'react'
import styles from './Skeleton.module.css'

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** CSS width, for example "60%" or "8rem". Defaults to full width. */
  width?: CSSProperties['inlineSize']
  /** CSS height. Defaults to one line of text. */
  height?: CSSProperties['blockSize']
  /** Round shape for avatars and discs. */
  circle?: boolean
}

/**
 * Placeholder block. It is hidden from assistive tech: put aria-busy on the region that is loading.
 * Pulses softly; the pulse stops under reduced motion.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { width, height, circle = false, className, style, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      aria-hidden="true"
      className={[styles.skeleton, circle ? styles.circle : '', className].filter(Boolean).join(' ')}
      style={{ ...style, ...(width !== undefined ? { inlineSize: width } : null), ...(height !== undefined ? { blockSize: height } : null) }}
    />
  )
})
