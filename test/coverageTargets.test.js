const assert = require('assert').strict;

const {
  parseQueryTargets,
  sourceTestTargetCandidates,
} = require('../out/src/coverage/coverageTargetSelection');

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

assert.deepStrictEqual(
  sourceTestTargetCandidates(
    ['//services/diagnostics:diagnostics'],
    targets,
    true
  ),
  ['//services/diagnostics:diagnostics_test']
);
assert.deepStrictEqual(
  sourceTestTargetCandidates(['//services/unknown:unknown'], targets, true),
  ['//services/api:api_test', '//services/diagnostics:diagnostics_test']
);
assert.deepStrictEqual(
  sourceTestTargetCandidates(
    ['//services/diagnostics:diagnostics'],
    targets,
    false
  ),
  [
    '//services/diagnostics:diagnostics_test',
    '//services/diagnostics:no_coverage_test',
  ]
);
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
