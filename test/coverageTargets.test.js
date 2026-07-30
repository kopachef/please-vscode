const assert = require('assert').strict;

const {
  coverageTargetCandidates,
  coverageTargetQueryArgs,
  parseQueryTargets,
} = require('../out/src/coverage/coverageTargetSelection');

assert.deepStrictEqual(
  coverageTargetQueryArgs([
    '//services/diagnostics:diagnostics_test',
    '//services/api:api_test',
  ]),
  [
    'query',
    'print',
    '//services/diagnostics:diagnostics_test',
    '//services/api:api_test',
    '--json',
    '--field',
    'test',
    '--field',
    'no_test_coverage',
  ]
);

const targets = parseQueryTargets(
  JSON.stringify({
    '//services/diagnostics:diagnostics_test': {
      test: true,
      no_test_coverage: false,
    },
    '//services/diagnostics:no_coverage_test': {
      test: true,
      no_test_coverage: true,
    },
    '//services/core:core': {
      test: false,
    },
    '//services/api:api_test': {
      test: true,
    },
  })
);

assert.deepStrictEqual(coverageTargetCandidates(targets), [
  '//services/api:api_test',
  '//services/diagnostics:diagnostics_test',
]);
assert.throws(() => parseQueryTargets('[]'), /must return an object/);
assert.throws(
  () =>
    parseQueryTargets(
      JSON.stringify({
        '//services/diagnostics:diagnostics_test': true,
      })
    ),
  /must contain an object/
);

console.log('Coverage target tests passed.');
