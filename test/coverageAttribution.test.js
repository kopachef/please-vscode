const assert = require('assert').strict;

const {
  coverageLineAttribution,
} = require('../out/src/coverage/coverageAttribution');

const results = {
  files: {
    'pkg/calculator/calculator.go': 'NCU',
  },
  tests: {
    '//pkg/calculator:z_test': {
      'pkg/calculator/calculator.go': 'NCU',
    },
    '//pkg/calculator:a_test': {
      'pkg/calculator/calculator.go': 'NUC',
    },
    '//pkg/calculator:unrelated_test': {
      'pkg/calculator/other.go': 'CCC',
    },
  },
};

assert.deepStrictEqual(
  coverageLineAttribution(results, 'pkg/calculator/calculator.go', 1),
  {
    aggregateStatus: 'C',
    coveredBy: ['//pkg/calculator:z_test'],
    uncoveredBy: ['//pkg/calculator:a_test'],
  }
);
assert.deepStrictEqual(
  coverageLineAttribution(results, 'pkg/calculator/missing.go', 1),
  {
    aggregateStatus: undefined,
    coveredBy: [],
    uncoveredBy: [],
  }
);
assert.throws(
  () => coverageLineAttribution(results, 'pkg/calculator/calculator.go', -1),
  /non-negative integer/
);

console.log('Coverage attribution tests passed.');
