import { Component } from 'react'
import type { ReactNode } from 'react'
import styles from './ProgressPage.module.css'

interface Props {
  name: string
  children: ReactNode
}

/** A chart that fails shows an error tile in its own place; the rest of the page renders. */
export class ChartBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <p className={styles.errorTile} role="alert">
        The {this.props.name} chart could not be drawn. The rest of this page is fine.
      </p>
    )
  }
}
