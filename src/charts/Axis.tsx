import type { SVGProps } from 'react';
import { finite } from './format.ts';
import styles from './Axis.module.css';

export interface AxisTick {
  /** Position in pixels along the axis. */
  pos: number;
  label: string;
}

export interface AxisProps extends Omit<SVGProps<SVGGElement>, 'ref'> {
  orient: 'bottom' | 'left';
  ticks: readonly AxisTick[];
  /** Axis length in pixels. */
  length: number;
  /** Length of grid lines drawn across the plot from each tick (0 for none). */
  grid?: number;
  /** Draw the axis line itself. */
  line?: boolean;
}

const TICK = 4;

/** Hairline axis with mono tabular tick labels. Place it with a transform on the group. */
export function Axis({ orient, ticks, length, grid = 0, line = true, ...rest }: AxisProps) {
  const len = finite(length);
  const bottom = orient === 'bottom';
  return (
    <g {...rest} data-axis={orient}>
      {line && (
        <line className={styles.line} x1={0} y1={0} x2={bottom ? len : 0} y2={bottom ? 0 : len} />
      )}
      {ticks.map((t, i) => {
        const p = finite(t.pos);
        return (
          <g key={i} transform={bottom ? `translate(${p} 0)` : `translate(0 ${p})`}>
            {grid > 0 && (
              <line
                className={styles.grid}
                x1={0}
                y1={0}
                x2={bottom ? 0 : finite(grid)}
                y2={bottom ? -finite(grid) : 0}
              />
            )}
            <line
              className={styles.line}
              x1={0}
              y1={0}
              x2={bottom ? 0 : -TICK}
              y2={bottom ? TICK : 0}
            />
            <text
              className={styles.label}
              x={bottom ? 0 : -TICK - 2}
              y={bottom ? TICK + 12 : 0}
              dy={bottom ? undefined : '0.32em'}
              textAnchor={bottom ? 'middle' : 'end'}
            >
              {t.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
