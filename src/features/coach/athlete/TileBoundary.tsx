import { Component } from 'react'
import type { ReactNode } from 'react'
import styles from './AthletePage.module.css'

interface Props {
  label: string
  children: ReactNode
}

/** A chart or table that fails shows an error tile in its own place and leaves the page standing. */
export class TileBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <p className={styles.errorTile} role="alert">
          {this.props.label} could not be drawn. Reload the page to try again.
        </p>
      )
    }
    return this.props.children
  }
}
