interface QueryTarget {
  test: boolean;
  noTestCoverage: boolean;
  dependencies: string[];
}

/** Requests only the target metadata needed to decide coverage eligibility. */
export function coverageTargetQueryArgs(targets: string[]): string[] {
  return queryArgs(targets, ['test', 'no_test_coverage']);
}

/** Also requests dependencies so source coverage stays within its package. */
export function coverageTargetDependencyQueryArgs(targets: string[]): string[] {
  return queryArgs(targets, ['test', 'no_test_coverage', 'deps']);
}

function queryArgs(targets: string[], fields: string[]): string[] {
  const args = ['query', 'print', ...targets, '--json'];
  for (const field of fields) {
    args.push('--field', field);
  }
  return args;
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
      dependencies: stringArrayField(label, fields, 'deps'),
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

/** Restricts automatic source coverage to tests depending on its local rule. */
export function coverageTargetCandidatesDependingOn(
  queryTargets: Map<string, QueryTarget>,
  sourceTargets: string[]
): string[] {
  const sources = new Set(sourceTargets);

  return [...queryTargets.entries()]
    .filter(
      ([, target]) =>
        target.test &&
        !target.noTestCoverage &&
        target.dependencies.some((dependency) => sources.has(dependency))
    )
    .map(([label]) => label)
    .sort();
}

function stringArrayField(
  label: string,
  fields: { [key: string]: unknown },
  name: string
): string[] {
  const value = fields[name];
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((element) => typeof element !== 'string')
  ) {
    throw new Error(`Please target '${label}' field '${name}' must be a list.`);
  }
  return value;
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
