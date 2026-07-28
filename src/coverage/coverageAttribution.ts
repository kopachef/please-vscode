import {
  COVERED_LINE,
  CoverageResults,
  UNCOVERED_LINE,
} from './coverageResults';

export interface CoverageLineAttribution {
  aggregateStatus: string | undefined;
  coveredBy: string[];
  uncoveredBy: string[];
}

/**
 * Returns deterministic per-target evidence for a source line. Targets that
 * report the line as non-coverable, or do not report the file, are omitted.
 */
export function coverageLineAttribution(
  results: CoverageResults,
  filename: string,
  lineNumber: number
): CoverageLineAttribution {
  if (!Number.isInteger(lineNumber) || lineNumber < 0) {
    throw new Error('Coverage line number must be a non-negative integer.');
  }

  const coveredBy: string[] = [];
  const uncoveredBy: string[] = [];
  for (const target of Object.keys(results.tests).sort()) {
    const status = results.tests[target][filename]?.[lineNumber];
    if (status === COVERED_LINE) {
      coveredBy.push(target);
    } else if (status === UNCOVERED_LINE) {
      uncoveredBy.push(target);
    }
  }

  return {
    aggregateStatus: results.files[filename]?.[lineNumber],
    coveredBy,
    uncoveredBy,
  };
}
