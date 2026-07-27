const assert = require('assert').strict;

const {
  COVERED_LINE,
  coverageFilename,
  coverageLineNumbers,
  coverageSummary,
  parseCoverageResults,
  UNCOVERED_LINE,
} = require('../out/src/coverage/coverageResults');

const results = parseCoverageResults(
  JSON.stringify({
    files: {
      'services/diagnostics/diagnostics.go': 'NCCUUN',
    },
    stats: {
      total_coverage: 42.5,
    },
  })
);

assert.deepStrictEqual(results, {
  files: {
    'services/diagnostics/diagnostics.go': 'NCCUUN',
  },
  totalCoverage: 42.5,
});
assert.deepStrictEqual(
  coverageLineNumbers(
    results.files['services/diagnostics/diagnostics.go'],
    COVERED_LINE
  ),
  [1, 2]
);
assert.deepStrictEqual(
  coverageLineNumbers(
    results.files['services/diagnostics/diagnostics.go'],
    UNCOVERED_LINE
  ),
  [3, 4]
);
assert.deepStrictEqual(
  coverageSummary(results.files['services/diagnostics/diagnostics.go']),
  {
    covered: 2,
    uncovered: 2,
    coverable: 4,
    percentage: 50,
  }
);
assert.strictEqual(
  coverageFilename('/repo', '/repo/services/diagnostics/diagnostics.go'),
  'services/diagnostics/diagnostics.go'
);
assert.strictEqual(
  coverageFilename('/repo', '/another-repo/diagnostics.go'),
  undefined
);
assert.throws(
  () => parseCoverageResults(JSON.stringify({ files: [] })),
  /files object/
);
assert.throws(
  () =>
    parseCoverageResults(
      JSON.stringify({
        files: {
          'services/diagnostics/diagnostics.go': ['C', 'U'],
        },
      })
    ),
  /must be a string/
);

console.log('Coverage result tests passed.');
