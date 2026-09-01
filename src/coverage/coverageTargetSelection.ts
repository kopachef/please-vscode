interface QueryTarget {
  test: boolean;
  noTestCoverage: boolean;
}

/** Requests only the target metadata needed to decide coverage eligibility. */
export function coverageTargetQueryArgs(targets: string[]): string[] {
  return [
    'query',
    'print',
    ...targets,
    '--json',
    '--field',
    'test',
    '--field',
    'no_test_coverage',
  ];
}

/** Parses the target metadata returned by `plz query print --json`. */
export function parseQueryTargets(output: string): Map<string, QueryTarget> {
  const value = JSON.parse(output);
  if (!isRecord(value)) {
    throw new Error('Please target query must return an object.');
  }

  const targets = new Map<string, QueryTarget>();
  for (const [label, fields] of Object.entries(value)) {
    if (!isRecord(fields)) {
      throw new Error(`Please target '${label}' must contain an object.`);
    }
    targets.set(label, {
      test: fields.test === true,
      noTestCoverage: fields.no_test_coverage === true,
    });
  }
  return targets;
}

/**
 * Returns every test target that can contribute coverage. Callers are
 * responsible for limiting the query to the relevant direct dependencies.
 */
export function coverageTargetCandidates(
  queryTargets: Map<string, QueryTarget>
): string[] {
  return [...queryTargets.entries()]
    .filter(([, target]) => target.test && !target.noTestCoverage)
    .map(([label]) => label)
    .sort();
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
