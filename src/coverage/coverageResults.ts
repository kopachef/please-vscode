import * as path from 'path';

export const COVERED_LINE = 'C';
export const UNCOVERED_LINE = 'U';

export interface CoverageResults {
  files: { [filename: string]: string };
  totalCoverage?: number;
}

export interface CoverageSummary {
  covered: number;
  uncovered: number;
  coverable: number;
  percentage: number;
}

export function parseCoverageResults(contents: string): CoverageResults {
  const value = JSON.parse(contents);
  if (!isRecord(value) || !isRecord(value.files)) {
    throw new Error('Coverage results must contain a files object.');
  }

  const files: { [filename: string]: string } = {};
  for (const [filename, lineStatuses] of Object.entries(value.files)) {
    if (typeof lineStatuses !== 'string') {
      throw new Error(
        `Coverage line statuses for '${filename}' must be a string.`
      );
    }
    files[filename] = lineStatuses;
  }

  const totalCoverage =
    isRecord(value.stats) && typeof value.stats.total_coverage === 'number'
      ? value.stats.total_coverage
      : undefined;

  return { files, totalCoverage };
}

export function coverageLineNumbers(
  lineStatuses: string,
  status: typeof COVERED_LINE | typeof UNCOVERED_LINE
): number[] {
  const lineNumbers: number[] = [];
  for (let lineNumber = 0; lineNumber < lineStatuses.length; lineNumber++) {
    if (lineStatuses[lineNumber] === status) {
      lineNumbers.push(lineNumber);
    }
  }
  return lineNumbers;
}

export function coverageSummary(lineStatuses: string): CoverageSummary {
  let covered = 0;
  let uncovered = 0;

  for (const status of lineStatuses) {
    if (status === COVERED_LINE) {
      covered++;
    } else if (status === UNCOVERED_LINE) {
      uncovered++;
    }
  }

  const coverable = covered + uncovered;
  return {
    covered,
    uncovered,
    coverable,
    percentage: coverable === 0 ? 0 : (covered / coverable) * 100,
  };
}

export function coverageFilename(
  workspaceRoot: string,
  filename: string
): string | undefined {
  const relativeFilename = path.relative(workspaceRoot, filename);
  if (
    relativeFilename === '..' ||
    relativeFilename.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeFilename)
  ) {
    return undefined;
  }

  return relativeFilename.split(path.sep).join('/');
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
