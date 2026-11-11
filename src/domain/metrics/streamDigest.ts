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

/** Seconds in zones 1 to 5 by the best signal the sport has, or null with no usable signal or threshold. */
function fiveZones(sport: Sport, stream: DigestStream, th: LoadThresholds): number[] | null {
  let secs: number[] | null = null;
  if (sport === 'bike' && stream.powerW && th.ftp) secs = timeInZones('power', list(stream.powerW), th.ftp);
  else if (sport === 'run' && stream.speedMps && th.thresholdPaceSPerKm)
    secs = timeInZones('runPace', list(stream.speedMps), 1000 / th.thresholdPaceSPerKm);
  else if (sport === 'swim' && stream.speedMps && th.cssSPer100m)
    secs = timeInZones('swim', list(stream.speedMps), 100 / th.cssSPer100m);
  else if (stream.hrBpm && th.lthr) secs = timeInZones('heartRate', list(stream.hrBpm), th.lthr);
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
  return {
    zones: fiveZones(sport, stream, th),
    power: sport === 'bike' && stream.powerW ? bestPowerCurve(list(stream.powerW)) : null,
    run:
      sport === 'run' && stream.distanceM
        ? Object.fromEntries(
            Object.entries(bestRunCurve(list(stream.distanceM))).map(([k, v]) => [k, v ? v.timeS : null]),
          )
        : null,
  };
}
