import { useId, useState } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './ChartFrame.module.css';

export interface ChartTable {
  /** Column headings; the first describes the row label. */
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}

export interface ChartFrameProps extends Omit<ComponentPropsWithoutRef<'figure'>, 'title'> {
  title: string;
  /** One paragraph stating the key values, read by screen readers. */
  summary: string;
  table: ChartTable;
  /**
   * `inline` is for sparklines and other charts inside a row: the title, summary and
   * table stay in the page for assistive tech but are visually hidden.
   */
  variant?: 'block' | 'inline';
  children: ReactNode;
}

/** Every chart renders inside this: visible title, hidden text summary, "Show table" toggle. */
export function ChartFrame({
  title,
  summary,
  table,
  variant = 'block',
  className,
  children,
  ...rest
}: ChartFrameProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const inline = variant === 'inline';
  const cls = [styles.frame, inline ? styles.inline : '', className].filter(Boolean).join(' ');
  return (
    <figure {...rest} className={cls} aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}>
      {inline ? (
        <span id={`${id}-t`} className="sr-only">
          {title}
        </span>
      ) : (
        <div className={styles.head}>
          <figcaption id={`${id}-t`} className={styles.title}>
            {title}
          </figcaption>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={`${id}-table`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide table' : 'Show table'}
          </button>
        </div>
      )}
      <p id={`${id}-s`} className="sr-only">
        {summary}
      </p>
      <div className={styles.body}>{children}</div>
      {(open || inline) && (
        <div id={`${id}-table`} className={inline ? 'sr-only' : styles.tableWrap}>
          <table className={styles.table}>
            <caption>{title}</caption>
            <thead>
              <tr>
                {table.columns.map((c, i) => (
                  <th key={i} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={ci}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
