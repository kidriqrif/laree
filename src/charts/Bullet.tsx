import { ChartFrame } from './ChartFrame.tsx';
import { fmtNumber } from './format.ts';
import { at, linear } from './scales.ts';
import { useSize } from './useSize.ts';
import styles from './Bullet.module.css';

export interface BulletBand {
  /** Upper edge of the band, in the same unit as actual. */
  to: number;
  label: string;
}

export interface BulletProps {
  title: string;
  actual: number;
  target: number;
  /** Qualitative bands, ascending. Defaults to Under (below 80% of target), On plan (80 to 120%), Over. */
  bands?: readonly BulletBand[];
  formatValue?: (n: number) => string;
  width?: number;
  height?: number;
  className?: string;
}

const clean = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/** Compliance percentage, rounded away from 100 (metrics.md section 7.3). */
function pctAwayFrom100(actual: number, target: number): number {
  const p = (actual / target) * 100;
  return p > 100 ? Math.ceil(p - 1e-9) : Math.floor(p + 1e-9);
}

/** Actual against target over qualitative bands. */
export function Bullet({
  title,
  actual: rawActual,
  target: rawTarget,
  bands,
  formatValue = (n) => fmtNumber(n),
  width,
  height = 20,
  className,
}: BulletProps) {
  const [ref, measured] = useSize<HTMLDivElement>(240);
  const w = Math.max(60, width ?? measured);
  const h = Math.max(12, height);
  const actual = clean(rawActual);
  const target = clean(rawTarget);

  const shownBands: readonly BulletBand[] =
    bands && bands.length > 0
      ? bands.map((b) => ({ ...b, to: clean(b.to) }))
      : target > 0
        ? [
            { to: target * 0.8, label: 'Under' },
            { to: target * 1.2, label: 'On plan' },
            { to: Math.max(target * 1.5, actual * 1.05), label: 'Over' },
          ]
        : [];
  const max = Math.max(1, actual, target, ...shownBands.map((b) => b.to));
  const x = linear([0, max], [0, w]);
  const state = shownBands.find((b) => actual <= b.to) ?? shownBands[shownBands.length - 1];
  const pct = target > 0 ? pctAwayFrom100(actual, target) : null;

  const edges = shownBands.map((b) => at(x, b.to));
  const rects = shownBands.map((b, i) => {
    const x0 = Math.max(0, ...edges.slice(0, i));
    const x1 = Math.max(x0, edges[i] ?? x0);
    return { ...b, x0, width: x1 - x0, i };
  });

  const bandText = shownBands.length > 0 ? ` Bands: ${shownBands.map((b) => `${b.label} up to ${formatValue(b.to)}`).join(', ')}.` : '';
  const summary =
    target > 0
      ? `${title}: ${formatValue(actual)} against a target of ${formatValue(target)}` +
        `${pct != null ? `, ${fmtNumber(pct)}% of target` : ''}${state ? `, ${state.label}` : ''}.${bandText}`
      : `${title}: ${formatValue(actual)}. No target set.`;

  const barH = Math.round(h * 0.36);
  return (
    <ChartFrame
      title={title}
      summary={summary}
      table={{
        columns: ['Measure', 'Value'],
        rows: [
          ['Actual', formatValue(actual)],
          ['Target', target > 0 ? formatValue(target) : 'None'],
          ...(pct != null ? [['Share of target', `${fmtNumber(pct)}%`]] : []),
          ...(state ? [['Band', state.label]] : []),
        ],
      }}
      className={className}
    >
      <div ref={ref} className={styles.wrap}>
        <svg className={styles.svg} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
          {rects.map((r) => (
            <rect
              key={r.i}
              className={`${styles.band} ${styles[`band${Math.min(r.i, 2)}` as 'band0']}`}
              x={r.x0}
              y={0}
              width={r.width}
              height={h}
            >
              <title>{`${r.label}: up to ${formatValue(r.to)}`}</title>
            </rect>
          ))}
          <rect className={styles.actual} x={0} y={(h - barH) / 2} width={at(x, actual)} height={barH}>
            <title>{`Actual ${formatValue(actual)}`}</title>
          </rect>
          {target > 0 && (
            <>
              <line className={styles.targetHalo} x1={at(x, target)} x2={at(x, target)} y1={2} y2={h - 2} />
              <line className={styles.target} x1={at(x, target)} x2={at(x, target)} y1={2} y2={h - 2}>
                <title>{`Target ${formatValue(target)}`}</title>
              </line>
            </>
          )}
        </svg>
        <p className={styles.read}>
          <span>
            Actual <strong>{formatValue(actual)}</strong>
          </span>
          <span>
            Target <strong>{target > 0 ? formatValue(target) : 'none'}</strong>
          </span>
          {state && target > 0 && <span className={styles.state}>{state.label}</span>}
        </p>
      </div>
    </ChartFrame>
  );
}
