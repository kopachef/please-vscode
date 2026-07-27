interface QueryTarget {
  test: boolean;
  noTestCoverage: boolean;
}

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

export function sourceTestTargetCandidates(
  sourceTargets: string[],
  queryTargets: Map<string, QueryTarget>,
  coverageOnly: boolean
): string[] {
  const coverableTests = [...queryTargets.entries()]
    .filter(
      ([, target]) => target.test && (!coverageOnly || !target.noTestCoverage)
    )
    .map(([label]) => label)
    .sort();
  const sourcePackages = new Set(sourceTargets.map(targetPackage));
  const samePackageTests = coverableTests.filter((label) =>
    sourcePackages.has(targetPackage(label))
  );

  return samePackageTests.length > 0 ? samePackageTests : coverableTests;
}

function targetPackage(label: string): string {
  const colon = label.indexOf(':');
  return colon === -1 ? label : label.substring(0, colon);
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
