/** Loaded on demand by the export dialogs, so the writers stay out of the page bundle. */
import type { ExportInput, ExportResult } from '../../../io/export/common.ts'
import type { FitResult } from '../../../io/export/fit.ts'
import type { LoadThresholds } from '../../../domain/metrics/load.ts'
import type { AthleteId, WorkoutTemplate } from '../../../domain/types.ts'
import { writeErg } from '../../../io/export/erg.ts'
import { writeFit } from '../../../io/export/fit.ts'
import { writeMrc } from '../../../io/export/mrc.ts'
import { writeZwo } from '../../../io/export/zwo.ts'
import { now } from '../../../domain/time.ts'

export type ExportFormat = 'zwo' | 'fit' | 'mrc' | 'erg'

export function buildInput(
  template: WorkoutTemplate,
  athleteId: AthleteId,
  athleteName: string,
  thresholds: LoadThresholds,
): ExportInput {
  const tags = [template.tags.phase, template.tags.type].filter((t): t is string => Boolean(t))
  return {
    athlete: { id: athleteId, name: athleteName },
    thresholds,
    workout: {
      title: template.name.trim() === '' ? 'Workout' : template.name,
      sport: template.sport,
      steps: template.steps,
      description: template.description,
      tags,
    },
  }
}

export async function buildFile(format: ExportFormat, input: ExportInput): Promise<ExportResult | FitResult> {
  switch (format) {
    case 'zwo':
      return writeZwo(input)
    case 'mrc':
      return writeMrc(input)
    case 'erg':
      return writeErg(input)
    case 'fit':
      return writeFit(input, { now: now() })
  }
}
