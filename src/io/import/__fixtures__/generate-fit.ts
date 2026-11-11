// Generates the FIT fixtures with the SDK's Encoder. Run: node src/io/import/__fixtures__/generate-fit.ts
// The generated files are kept in this folder; tests read them, so the repo holds no third-party files.
import { writeFileSync } from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';

export const RIDE_START_MS = Date.parse('2026-10-03T07:00:00Z');

interface Options {
  type?: string;
}

/** A 2-minute ride: power and heart rate, a 20 s pause after the first minute, one lap. */
export function buildRideFit(options: Options = {}): Uint8Array {
  const enc = new Encoder();
  const mesg = (num: number, fields: Record<string, unknown>) => enc.onMesg(num, fields as never);
  const at = (s: number) => new Date(RIDE_START_MS + s * 1000);
  mesg((Profile.MesgNum.FILE_ID as number), {
    type: options.type ?? 'activity',
    manufacturer: 'development',
    product: 1,
    timeCreated: at(0),
  });
  mesg((Profile.MesgNum.EVENT as number), { timestamp: at(0), event: 'timer', eventType: 'start' });
  const offsets: number[] = [];
  for (let s = 0; s < 60; s++) offsets.push(s);
  for (let s = 80; s < 140; s++) offsets.push(s);
  let timer = 0;
  for (const s of offsets) {
    if (s === 80) {
      mesg((Profile.MesgNum.EVENT as number), { timestamp: at(60), event: 'timer', eventType: 'stop' });
      mesg((Profile.MesgNum.EVENT as number), { timestamp: at(80), event: 'timer', eventType: 'start' });
    }
    mesg((Profile.MesgNum.RECORD as number), {
      timestamp: at(s),
      heartRate: 130 + Math.floor(timer / 10),
      power: 200 + (timer % 20),
      cadence: 90,
      distance: 8 * timer,
      speed: 8,
      altitude: 50 + timer * 0.1,
    });
    timer++;
  }
  mesg((Profile.MesgNum.LAP as number), {
    timestamp: at(139),
    startTime: at(0),
    totalElapsedTime: 140,
    totalTimerTime: 120,
    totalDistance: 960,
    avgHeartRate: 135,
    avgPower: 210,
  });
  mesg((Profile.MesgNum.SESSION as number), {
    timestamp: at(139),
    startTime: at(0),
    totalElapsedTime: 140,
    totalTimerTime: 120,
    totalDistance: 960,
    sport: 'cycling',
    subSport: 'generic',
  });
  mesg((Profile.MesgNum.ACTIVITY as number), { timestamp: at(139), numSessions: 1, type: 'manual' });
  return enc.close();
}

if (process.argv[1]?.endsWith('generate-fit.ts')) {
  const dir = new URL('./', import.meta.url);
  writeFileSync(new URL('ride.fit', dir), buildRideFit());
  writeFileSync(new URL('workout.fit', dir), buildRideFit({ type: 'workout' }));
  console.log('wrote ride.fit and workout.fit');
}
