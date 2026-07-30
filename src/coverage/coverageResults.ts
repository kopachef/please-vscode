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

/**
 * Combines coverage from separate Please invocations. A line covered by any
 * invocation is covered in the aggregate; otherwise a coverable line remains
 * uncovered.
 */
export function mergeCoverageResults(
  results: readonly CoverageResults[]
): CoverageResults {
  const files = mergeCoverageFileSets(results.map((result) => result.files));
  const targetNames = new Set<string>();
  for (const result of results) {
    for (const target of Object.keys(result.tests)) {
      targetNames.add(target);
    }
  }
  const tests: { [target: string]: CoverageFiles } = {};

  for (const target of targetNames) {
    tests[target] = mergeCoverageFileSets(
      results
        .map((result) => result.tests[target])
        .filter((targetFiles): targetFiles is CoverageFiles => !!targetFiles)
    );
  }

  return { files, tests };
}

/**
 * Adds a report to session coverage while keeping only the latest result for
 * each test target. Reports without per-target data cannot be accumulated
 * safely, so they replace the current result.
 */
export function accumulateCoverageResults(
  current: CoverageResults | undefined,
  next: CoverageResults
): CoverageResults {
  if (
    !current ||
    Object.keys(current.tests).length === 0 ||
    Object.keys(next.tests).length === 0
  ) {
    return next;
  }

  const tests = {
    ...current.tests,
    ...next.tests,
  };
  const files = mergeCoverageFileSets(Object.values(tests));
  const summary = coverageSummary(Object.values(files).join(''));

  return {
    files,
    tests,
    totalCoverage: summary.coverable === 0 ? undefined : summary.percentage,
  };
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

function mergeCoverageFileSets(
  fileSets: readonly CoverageFiles[]
): CoverageFiles {
  const filenames = new Set<string>();
  for (const fileSet of fileSets) {
    for (const filename of Object.keys(fileSet)) {
      filenames.add(filename);
    }
  }
  const files: CoverageFiles = {};

  for (const filename of filenames) {
    files[filename] = mergeLineStatuses(
      fileSets
        .map((fileSet) => fileSet[filename])
        .filter((lineStatuses): lineStatuses is string => !!lineStatuses)
    );
  }
  return files;
}

function mergeLineStatuses(lineStatuses: readonly string[]): string {
  const lineCount = Math.max(
    0,
    ...lineStatuses.map((statuses) => statuses.length)
  );
  let merged = '';

  for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
    const statuses = lineStatuses
      .map((coverage) => coverage[lineNumber])
      .filter((status): status is string => status !== undefined);
    if (statuses.includes(COVERED_LINE)) {
      merged += COVERED_LINE;
    } else if (statuses.includes(UNCOVERED_LINE)) {
      merged += UNCOVERED_LINE;
    } else {
      merged += statuses[0] ?? 'N';
    }
  }
  return merged;
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
