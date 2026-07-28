import * as path from 'path';

export const COVERED_LINE = 'C';
export const UNCOVERED_LINE = 'U';

export interface CoverageFiles {
  [filename: string]: string;
}

export interface CoverageResults {
  /**
   * Status strings are indexed by zero-based source line. `C` marks a covered
   * line, `U` an uncovered line, and other values are not coverable.
   */
  files: CoverageFiles;
  tests: { [target: string]: CoverageFiles };
  totalCoverage?: number;
}

export interface CoverageSummary {
  covered: number;
  uncovered: number;
  coverable: number;
  percentage: number;
}

/** Parses the coverage.json data used by presentation and audit features. */
export function parseCoverageResults(contents: string): CoverageResults {
  const value = JSON.parse(contents);
  if (!isRecord(value) || !isRecord(value.files)) {
    throw new Error('Coverage results must contain a files object.');
  }

  const files = parseCoverageFiles(value.files, 'Coverage');
  const tests: { [target: string]: CoverageFiles } = {};
  if (value.tests !== undefined) {
    if (!isRecord(value.tests)) {
      throw new Error('Coverage results tests must be an object.');
    }
    for (const [target, targetFiles] of Object.entries(value.tests)) {
      if (!isRecord(targetFiles)) {
        throw new Error(
          `Coverage results for test target '${target}' must be an object.`
        );
      }
      tests[target] = parseCoverageFiles(
        targetFiles,
        `Coverage for test target '${target}'`
      );
    }
  }

  const totalCoverage =
    isRecord(value.stats) && typeof value.stats.total_coverage === 'number'
      ? value.stats.total_coverage
      : undefined;

  return { files, tests, totalCoverage };
}

function parseCoverageFiles(
  value: { [key: string]: unknown },
  context: string
): CoverageFiles {
  const files: CoverageFiles = {};
  for (const [filename, lineStatuses] of Object.entries(value)) {
    if (typeof lineStatuses !== 'string') {
      throw new Error(
        `${context} line statuses for '${filename}' must be a string.`
      );
    }
    files[filename] = lineStatuses;
  }
  return files;
}

/** Returns zero-based editor line numbers with the requested coverage status. */
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

/** Summarises only coverable (`C` or `U`) lines in a status string. */
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

/** Converts an absolute workspace file path to a coverage.json file key. */
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
