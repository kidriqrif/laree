import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChartFrame } from './ChartFrame.tsx';
import styles from './Heatmap.module.css';

/**
 * Step 0 to 4. On the heat scale it is intensity, lowest to highest, drawn on the zone ramp.
 * On the status scale it names a compliance state: 0 on plan, 1 short or under, 2 over,
 * 3 well over, 4 missed.
 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  level: HeatLevel;
  /** The value as text, always shown in the cell, e.g. "7.5" or "42". */
  text: string;
  /** A short mark shown beside the value when it is outside the usual range, e.g. an arrow. */
  glyph?: string;
  /** Spoken name for the cell; defaults to "<row>, <column>: <text>". Name the band when there is a glyph. */
  label?: string;
}

export interface HeatRow {
  key: string;
  label: string;
  /** One entry per column; null or missing means no data (drawn hollow). */
  cells: readonly (HeatCell | null | undefined)[];
}

export interface HeatColumn {
  key: string;
  label: string;
}

export interface HeatLegendItem {
  level: HeatLevel;
  label: string;
}

export interface HeatmapProps {
  title: string;
  columns: readonly HeatColumn[];
  rows: readonly HeatRow[];
  /** Legend entries; defaults to Lowest to Highest. */
  legend?: readonly HeatLegendItem[];
  /** Name of what the cells measure, for summaries, e.g. "Sleep". */
  measure?: string;
  /** Called when a cell is clicked or Enter or Space is pressed on it. */
  onCellActivate?: (rowKey: string, columnKey: string) => void;
  /** "heat" (default) fills cells from the zone ramp; "status" uses the compliance status palette. */
  scale?: 'heat' | 'status';
  className?: string;
}

const DEFAULT_LEGEND: readonly HeatLegendItem[] = [
  { level: 0, label: 'Lowest' },
  { level: 1, label: 'Low' },
  { level: 2, label: 'Middle' },
  { level: 3, label: 'High' },
  { level: 4, label: 'Highest' },
];

function focusCell(r: number, c: number, root: HTMLElement) {
  root.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function cellLevel(c: HeatCell): HeatLevel {
  const l = Number.isFinite(c.level) ? Math.round(c.level) : 0;
  return clamp(l, 0, 4) as HeatLevel;
}

/** Rows by columns of cells; each cell shows its value as well as its colour. */
export function Heatmap({
  title,
  columns,
  rows,
  legend = DEFAULT_LEGEND,
  measure,
  onCellActivate,
  scale = 'heat',
  className,
}: HeatmapProps) {
  const nr = rows.length;
  const nc = columns.length;
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const r0 = clamp(pos[0], 0, Math.max(0, nr - 1));
  const c0 = clamp(pos[1], 0, Math.max(0, nc - 1));

  const filled = rows.reduce(
    (a, row) => a + columns.filter((_, ci) => row.cells[ci] != null).length,
    0,
  );
  const name = measure ?? title;
  const summary =
    nr === 0 || nc === 0
      ? `${name}: no data.`
      : `${name}: ${nr} ${nr === 1 ? 'row' : 'rows'} by ${nc} ${nc === 1 ? 'column' : 'columns'}, ` +
        `${filled} of ${nr * nc} cells have a value. ` +
        rows
          .map((row) => {
            const last = [...columns.keys()].toReversed().find((ci) => row.cells[ci] != null);
            const cell = last === undefined ? null : row.cells[last];
            return `${row.label}: ${cell && last !== undefined ? `${cell.text} on ${columns[last]?.label ?? ''}` : 'no data'}`;
          })
          .join('; ')
          .concat('.');

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (nr === 0 || nc === 0) return;
    let r = r0;
    let c = c0;
    const k = e.key;
    if (k === 'ArrowRight') c = clamp(c + 1, 0, nc - 1);
    else if (k === 'ArrowLeft') c = clamp(c - 1, 0, nc - 1);
    else if (k === 'ArrowDown') r = clamp(r + 1, 0, nr - 1);
    else if (k === 'ArrowUp') r = clamp(r - 1, 0, nr - 1);
    else if (k === 'Home') {
      c = 0;
      if (e.ctrlKey) r = 0;
    } else if (k === 'End') {
      c = nc - 1;
      if (e.ctrlKey) r = nr - 1;
    } else if (k === 'Enter' || k === ' ') {
      const row = rows[r0];
      const col = columns[c0];
      if (row && col && onCellActivate) {
        onCellActivate(row.key, col.key);
        e.preventDefault();
      }
      return;
    } else return;
    e.preventDefault();
    setPos([r, c]);
    focusCell(r, c, e.currentTarget);
  };

  return (
    <ChartFrame
      title={title}
      summary={summary}
      className={className}
      table={{
        columns: ['', ...columns.map((c) => c.label)],
        rows: rows.map((row) => [
          row.label,
          ...columns.map((_, ci) => {
            const cell = row.cells[ci];
            return cell ? `${cell.text}${cell.glyph ? ` ${cell.glyph}` : ''}` : 'No data';
          }),
        ]),
      }}
    >
      <div className={styles.wrap} data-scale={scale}>
        {nr === 0 || nc === 0 ? (
          <p className={styles.empty}>No data yet.</p>
        ) : (
          <div className={styles.scroll}>
            <table
              className={styles.grid}
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- keyboard grid pattern
              role="grid"
              aria-label={title}
              aria-rowcount={nr + 1}
              aria-colcount={nc + 1}
              onKeyDown={onKey}
            >
              <thead>
                <tr>
                  <th className={styles.corner} scope="col">
                    <span className="sr-only">Row</span>
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={styles.colHead}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row.key}>
                    <th scope="row" className={styles.rowHead}>
                      {row.label}
                    </th>
                    {columns.map((col, ci) => {
                      const cell = row.cells[ci];
                      const active = ri === r0 && ci === c0;
                      const common = {
                        'data-r': ri,
                        'data-c': ci,
                        tabIndex: active ? 0 : -1,
                        onFocus: () => setPos([ri, ci]),
                        onClick: () => {
                          setPos([ri, ci]);
                          onCellActivate?.(row.key, col.key);
                        },
                      };
                      if (!cell) {
                        return (
                          <td
                            key={col.key}
                            {...common}
                            className={`${styles.cell} ${styles.hollow}`}
                            aria-label={`${row.label}, ${col.label}: no data`}
                          />
                        );
                      }
                      const level = cellLevel(cell);
                      return (
                        <td
                          key={col.key}
                          {...common}
                          className={styles.cell}
                          data-level={level}
                          aria-label={
                            cell.label ??
                            `${row.label}, ${col.label}: ${cell.text}${cell.glyph ? ' (outside usual range)' : ''}`
                          }
                        >
                          <span className={styles.value}>{cell.text}</span>
                          {cell.glyph && (
                            <span className={styles.glyph} aria-hidden="true">
                              {cell.glyph}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className={styles.legend} aria-label="Legend">
          {legend.map((l) => (
            <li key={l.level}>
              <span className={styles.chip} data-level={l.level} aria-hidden="true" />
              {l.label}
            </li>
          ))}
          <li>
            <span className={`${styles.chip} ${styles.hollow}`} aria-hidden="true" />
            No data
          </li>
        </ul>
      </div>
    </ChartFrame>
  );
}
