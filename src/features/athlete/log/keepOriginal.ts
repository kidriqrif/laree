type Keep = (athleteId: string, activityId: string, file: File) => Promise<boolean>

/**
 * Keep an imported session's original file (live app only). False when it could not be kept for
 * any reason, a failure to load the code that keeps it included, so the person is always told.
 */
export async function keepOriginal(
  load: () => Promise<{ keepActivityFile: Keep }>,
  athleteId: string,
  activityId: string,
  file: File,
): Promise<boolean> {
  try {
    const { keepActivityFile } = await load()
    return await keepActivityFile(athleteId, activityId, file)
  } catch {
    return false
  }
}
