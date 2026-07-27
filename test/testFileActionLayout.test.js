const assert = require('assert').strict;

const {
  discoverTestFileTargets,
  testFileActionLayout,
  testFileActionTitle,
} = require('../out/src/languages/testFileActionLayout');

const packageFragment = '//services/diagnostics:';
const targets = discoverTestFileTargets(
  [
    `${packageFragment}diagnostics_test`,
    ':diagnostics_integration_test',
    `${packageFragment}diagnostics_library`,
  ].join('\n'),
  [
    ':diagnostics_test',
    `${packageFragment}diagnostics_integration_test`,
    `${packageFragment}diagnostics_integration_test`,
    `${packageFragment}unrelated_test`,
  ].join('\n'),
  packageFragment
);

assert.deepStrictEqual(targets, [
  {
    label: `${packageFragment}diagnostics_integration_test`,
    name: 'diagnostics_integration_test',
  },
  {
    label: `${packageFragment}diagnostics_test`,
    name: 'diagnostics_test',
  },
]);

assert.deepStrictEqual(testFileActionLayout(targets), {
  actions: ['test', 'debug'],
  selectedAction: 'test',
  targets,
});

assert.deepStrictEqual(testFileActionLayout(targets, 'debug'), {
  actions: ['test', 'debug'],
  selectedAction: 'debug',
  targets,
});

assert.deepStrictEqual(testFileActionLayout([]), {
  actions: [],
  selectedAction: undefined,
  targets: [],
});

assert.strictEqual(testFileActionTitle('test', true), '[ ✓ 𝘁𝗲𝘀𝘁');
assert.strictEqual(testFileActionTitle('debug', false), 'debug ]');
assert.strictEqual(testFileActionTitle('test', false), '[ test');
assert.strictEqual(testFileActionTitle('debug', true), '✓ 𝗱𝗲𝗯𝘂𝗴 ]');

console.log('Test file action layout tests passed.');
