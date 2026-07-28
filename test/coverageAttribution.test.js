const assert = require('assert').strict;

const {
  coverageAttributionMarkdown,
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

const hover = coverageAttributionMarkdown({
  aggregateStatus: 'C',
  coveredBy: ['//pkg/calculator:calculator_test'],
  uncoveredBy: ['//pkg/calculator:calculator_test_alt'],
});
assert.match(hover, /\*\*Covered by\*\*/);
assert.match(hover, /`\/\/pkg\/calculator:calculator_test`/);
assert.match(hover, /\*\*Not covered by\*\*/);
assert.match(hover, /`\/\/pkg\/calculator:calculator_test_alt`/);
assert.doesNotMatch(hover, /latest Please coverage run/);

const boundedHover = coverageAttributionMarkdown({
  aggregateStatus: 'C',
  coveredBy: [
    '//pkg:test_1',
    '//pkg:test_2',
    '//pkg:test_3',
    '//pkg:test_4',
    '//pkg:test_5',
    '//pkg:test_6',
    '//pkg:test_7',
  ],
  uncoveredBy: [],
});
assert.match(boundedHover, /2 additional targets omitted/);
assert.doesNotMatch(boundedHover, /test_6/);

assert.match(
  coverageAttributionMarkdown({
    aggregateStatus: 'U',
    coveredBy: [],
    uncoveredBy: ['//pkg/calculator:calculator_test'],
  }),
  /No Please targets/
);
assert.match(
  coverageAttributionMarkdown({
    aggregateStatus: 'U',
    coveredBy: [],
    uncoveredBy: ['//pkg/calculator:calculator_test'],
  }),
  /`\/\/pkg\/calculator:calculator_test`/
);

console.log('Coverage attribution tests passed.');
