import { Skeleton } from '../../../ui/core/index.ts'
import styles from './TodayPage.module.css'

/** Quiet placeholder in the shape of Today: the bib, its button, the check-in strip and the lap. */
export function TodaySkeleton() {
  return (
    <div className={styles.body} aria-busy="true" data-testid="today-skeleton">
      <output className="sr-only">Loading today&rsquo;s session.</output>
      <Skeleton className={styles.skeletonBib} />
      <Skeleton height="var(--target-min)" />
      <Skeleton height="var(--space-16)" className={styles.skeletonCard} />
      <Skeleton className={`${styles.skeletonCard} ${styles.skeletonLap}`} />
    </div>
  )
}
