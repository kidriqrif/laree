import { bestPowerCurve, bestRunCurve } from './curves.ts';
import type { LoadThresholds } from './load.ts';
import { timeInZones } from './zones.ts';
import type { Sport, StreamDigest } from '../types.ts';

/** The per-second readings a digest is worked out from. Arrays may hold NaN where a reading is missing. */
export interface DigestStream {
  powerW?: ArrayLike<number> | undefined;
  hrBpm?: ArrayLike<number> | undefined;
  /** Metres per second. */
  speedMps?: ArrayLike<number> | undefined;
  /** Cumulative metres, one more reading than there are seconds. */
  distanceM?: ArrayLike<number> | undefined;
}

const list = (a: ArrayLike<number>): number[] => Array.from(a);

/** The readings, when at least one of them is a real number. A channel of gaps only is no signal. */
function usable(a: ArrayLike<number> | undefined): number[] | null {
  if (!a) return null;
  const xs = list(a);
  return xs.some((v) => Number.isFinite(v)) ? xs : null;
}

/** Seconds in zones 1 to 5 by the best signal the sport has, or null with no usable signal or threshold. */
function fiveZones(sport: Sport, stream: DigestStream, th: LoadThresholds): number[] | null {
  // A signal is chosen only when it has a reading: a power or speed channel of gaps only falls
  // back to heart rate, and with no usable signal at all there are no zones.
  const power = sport === 'bike' && th.ftp ? usable(stream.powerW) : null;
  const speed = sport === 'run' || sport === 'swim' ? usable(stream.speedMps) : null;
  const hr = th.lthr ? usable(stream.hrBpm) : null;
  let secs: number[] | null = null;
  if (power && th.ftp) secs = timeInZones('power', power, th.ftp);
  else if (sport === 'run' && speed && th.thresholdPaceSPerKm) secs = timeInZones('runPace', speed, 1000 / th.thresholdPaceSPerKm);
  else if (sport === 'swim' && speed && th.cssSPer100m) secs = timeInZones('swim', speed, 100 / th.cssSPer100m);
  else if (hr && th.lthr) secs = timeInZones('heartRate', hr, th.lthr);
  if (!secs) return null;
  const five = secs.slice(0, 5);
  while (five.length < 5) five.push(0);
  five[4] = (five[4] ?? 0) + secs.slice(5).reduce((x, y) => x + y, 0);
  return five;
}

/**
 * What the analytics charts need from one activity's detailed stream: time in zones and best efforts.
 * Small enough to store with an imported activity, whose stream itself is not kept.
 */
export function streamDigest(sport: Sport, stream: DigestStream, th: LoadThresholds): StreamDigest {
  // Best efforts from a power channel with no reading would all be zero, so there are none.
  const power = sport === 'bike' ? usable(stream.powerW) : null;
  return {
    zones: fiveZones(sport, stream, th),
    power: power ? bestPowerCurve(power) : null,
    run:
      sport === 'run' && stream.distanceM
        ? Object.fromEntries(
            Object.entries(bestRunCurve(list(stream.distanceM))).map(([k, v]) => [k, v ? v.timeS : null]),
          )
        : null,
  };
}
