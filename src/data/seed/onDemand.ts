/**
 * Detailed streams for seeded activities, made on demand. Kept apart from the seed generator so
 * screens that never draw a stream (Today, Week) do not ship the stream maker.
 */
import { today as clockToday } from '../../domain/time.ts';
import type { Activity, DayOffset } from '../../domain/types.ts';
import { generateSeed } from './index.ts';
import type { Seed } from './index.ts';
import { streamOf } from './streams.ts';
import type { ActivityStream } from './streams.ts';

let cached: { today: DayOffset; seed: Seed } | undefined;

/** The seed for the real today, built once and reused by streamFor. */
function sharedSeed(): Seed {
  const today = clockToday();
  if (!cached || cached.today !== today) cached = { today, seed: generateSeed({ today }) };
  return cached.seed;
}

/**
 * Detailed per-second streams for a seeded activity, made on demand and always the same for
 * the same activity. Returns null for an activity that is not in the seed.
 */
export function streamFor(activityId: string, source?: Seed): ActivityStream | null {
  const seed = source ?? sharedSeed();
  const activity = seed.activities.find((a) => a.id === activityId);
  if (!activity) return null;
  const matched = activity.matchedWorkoutId
    ? seed.planned.find((w) => w.id === activity.matchedWorkoutId)
    : undefined;
  return streamOf(activity, matched);
}

/**
 * The seeded stream for a stored activity. Null once a quick log or an imported file has taken the
 * seeded activity's place under the same id: the seed's stream is not that log's data.
 */
export function seededStream(a: Pick<Activity, 'id' | 'source' | 'streamDigest'>): ActivityStream | null {
  return a.source === 'manual' || a.streamDigest ? null : streamFor(a.id);
}
