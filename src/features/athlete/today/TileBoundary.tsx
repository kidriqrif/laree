import { Component } from 'react'
import type { ReactNode } from 'react'
import styles from './TodayPage.module.css'

interface Props {
  /** One plain sentence: what could not be shown and where to find it instead. */
  message: string
  children: ReactNode
}

/** A tile that fails shows a notice in its own place; the rest of Today keeps working. */
export class TileBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <output className={styles.tileError}>{this.props.message}</output>
      )
    }
    return this.props.children
  }
}
