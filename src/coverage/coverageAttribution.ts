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

const MAX_HOVER_TARGETS = 5;

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

/** Formats bounded target evidence for a VS Code coverage hover. */
export function coverageAttributionMarkdown(
  attribution: CoverageLineAttribution
): string {
  const lines = ['**Covered by**'];
  if (attribution.coveredBy.length === 0) {
    lines.push('No Please targets.');
  } else {
    appendTargets(lines, attribution.coveredBy);
  }

  return lines.join('\n\n');
}

function appendTargets(lines: string[], targets: string[]): void {
  const visibleTargets = targets.slice(0, MAX_HOVER_TARGETS);
  lines.push(visibleTargets.map((target) => `- \`${target}\``).join('\n'));

  const remaining = targets.length - visibleTargets.length;
  if (remaining > 0) {
    lines.push(
      `${remaining} additional target${remaining === 1 ? '' : 's'} omitted.`
    );
  }
}
