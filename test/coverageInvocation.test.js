const assert = require('assert').strict;

const {
  coverageCommandArgs,
} = require('../out/src/coverage/coverageInvocation');

assert.deepStrictEqual(
  coverageCommandArgs(['//app:unit_test', '//app:integration_test']),
  ['//app:unit_test', '//app:integration_test']
);
assert.deepStrictEqual(
  coverageCommandArgs(['//app:unit_test'], 'TestFeature'),
  ['--rerun', '//app:unit_test', '--', 'TestFeature']
);

console.log('Coverage invocation tests passed.');
