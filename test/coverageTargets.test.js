const assert = require('assert').strict;

const {
  coverageTargetCandidates,
  coverageTargetCandidatesDependingOn,
  coverageTargetDependencyQueryArgs,
  coverageTargetQueryArgs,
  coverageTargetQueryBatches,
  parseQueryTargets,
} = require('../out/src/coverage/coverageTargetSelection');

assert.deepStrictEqual(coverageTargetQueryArgs(['//services/api:api_test']), [
  'query',
  'print',
  '//services/api:api_test',
  '--json',
  '--field',
  'test',
  '--field',
  'no_test_coverage',
]);
assert.deepStrictEqual(
  coverageTargetDependencyQueryArgs(['//services/diagnostics:all']),
  [
    'query',
    'print',
    '//services/diagnostics:all',
    '--json',
    '--field',
    'test',
    '--field',
    'no_test_coverage',
    '--field',
    'deps',
  ]
);

const labels = [
  '//services/api:api_test',
  '//services/core:core_test',
  '//services/diagnostics:diagnostics_test',
  '//services/payments:payments_test',
  '//services/users:users_test',
];
const batches = coverageTargetQueryBatches(labels, 2);
assert.equal(batches.length, 3);
assert.deepStrictEqual(
  batches.flatMap((args) => args.slice(2, args.indexOf('--json'))),
  labels
);
assert.throws(
  () => coverageTargetQueryBatches(labels, 0),
  /batch size must be positive/
);

const targets = parseQueryTargets(
  JSON.stringify({
    '//services/diagnostics:diagnostics_test': {
      test: true,
      no_test_coverage: false,
      deps: ['//services/diagnostics:diagnostics'],
    },
    '//services/diagnostics:no_coverage_test': {
      test: true,
      no_test_coverage: true,
      deps: ['//services/diagnostics:diagnostics'],
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
assert.deepStrictEqual(
  coverageTargetCandidatesDependingOn(targets, [
    '//services/diagnostics:diagnostics',
  ]),
  ['//services/diagnostics:diagnostics_test']
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
assert.throws(
  () =>
    parseQueryTargets(
      JSON.stringify({
        '//services/diagnostics:diagnostics_test': {
          test: true,
          deps: '//services/diagnostics:diagnostics',
        },
      })
    ),
  /field 'deps' must be a list/
);

console.log('Coverage target tests passed.');
