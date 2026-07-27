/**
 * Builds `plz cover` arguments. Whole-document coverage aggregates every
 * resolved target; selected tests bypass Please's cached full-suite result.
 */
export function coverageCommandArgs(
  targets: string[],
  functionName?: string
): string[] {
  return functionName
    ? ['--rerun', ...targets, '--', functionName]
    : [...targets];
}
