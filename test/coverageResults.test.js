const assert = require('assert').strict;

const {
  accumulateCoverageResults,
  COVERED_LINE,
  coverageFilename,
  coverageLineNumbers,
  coverageSummary,
  mergeCoverageResults,
  parseCoverageResults,
  UNCOVERED_LINE,
} = require('../out/src/coverage/coverageResults');

const results = parseCoverageResults(
  JSON.stringify({
    tests: {
      '//services/diagnostics:diagnostics_test': {
        'services/diagnostics/diagnostics.go': 'NCCUUN',
      },
    },
    files: {
      'services/diagnostics/diagnostics.go': 'NCCUUN',
    },
    stats: {
      total_coverage: 42.5,
    },
  })
);

assert.deepStrictEqual(results, {
  tests: {
    '//services/diagnostics:diagnostics_test': {
      'services/diagnostics/diagnostics.go': 'NCCUUN',
    },
  },
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
assert.deepStrictEqual(
  mergeCoverageResults([
    {
      files: {
        'pkg/calculator.go': 'NCUN',
        'pkg/first.go': 'CU',
      },
      tests: {
        '//pkg:first_test': {
          'pkg/calculator.go': 'NCUN',
        },
      },
    },
    {
      files: {
        'pkg/calculator.go': 'NUCN',
        'pkg/second.go': 'UC',
      },
      tests: {
        '//pkg:second_test': {
          'pkg/calculator.go': 'NUCN',
        },
      },
    },
  ]),
  {
    files: {
      'pkg/calculator.go': 'NCCN',
      'pkg/first.go': 'CU',
      'pkg/second.go': 'UC',
    },
    tests: {
      '//pkg:first_test': {
        'pkg/calculator.go': 'NCUN',
      },
      '//pkg:second_test': {
        'pkg/calculator.go': 'NUCN',
      },
    },
  }
);
assert.deepStrictEqual(
  accumulateCoverageResults(
    {
      files: {
        'pkg/calculator.go': 'NCUN',
      },
      tests: {
        '//pkg:first_test': {
          'pkg/calculator.go': 'NCUN',
        },
      },
    },
    {
      files: {
        'pkg/calculator.go': 'NUCN',
      },
      tests: {
        '//external:second_test': {
          'pkg/calculator.go': 'NUCN',
        },
      },
    }
  ),
  {
    files: {
      'pkg/calculator.go': 'NCCN',
    },
    tests: {
      '//pkg:first_test': {
        'pkg/calculator.go': 'NCUN',
      },
      '//external:second_test': {
        'pkg/calculator.go': 'NUCN',
      },
    },
    totalCoverage: 100,
  }
);
assert.deepStrictEqual(
  accumulateCoverageResults(
    {
      files: {
        'pkg/calculator.go': 'NCUN',
      },
      tests: {
        '//pkg:calculator_test': {
          'pkg/calculator.go': 'NCUN',
        },
      },
    },
    {
      files: {
        'pkg/calculator.go': 'NUCN',
      },
      tests: {
        '//pkg:calculator_test': {
          'pkg/calculator.go': 'NUCN',
        },
      },
    }
  ),
  {
    files: {
      'pkg/calculator.go': 'NUCN',
    },
    tests: {
      '//pkg:calculator_test': {
        'pkg/calculator.go': 'NUCN',
      },
    },
    totalCoverage: 50,
  }
);
assert.deepStrictEqual(
  accumulateCoverageResults(
    {
      files: {
        'pkg/first.go': 'CC',
      },
      tests: {
        '//pkg:first_test': {
          'pkg/first.go': 'CC',
        },
      },
    },
    {
      files: {
        'pkg/unattributed.go': 'CU',
      },
      tests: {},
      totalCoverage: 50,
    }
  ),
  {
    files: {
      'pkg/unattributed.go': 'CU',
    },
    tests: {},
    totalCoverage: 50,
  }
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
assert.throws(
  () => parseCoverageResults(JSON.stringify({ files: {}, tests: [] })),
  /tests must be an object/
);
assert.throws(
  () =>
    parseCoverageResults(
      JSON.stringify({
        files: {},
        tests: {
          '//services/diagnostics:diagnostics_test': true,
        },
      })
    ),
  /test target.*must be an object/
);

console.log('Coverage result tests passed.');
