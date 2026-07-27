const assert = require('assert').strict;

const {
  mapTargetsToRuleCalls,
  mergeCompletionTargets,
} = require('../out/src/languages/plz/targetDiscovery');
const {
  buildFileActionLayout,
  buildFileActionTitle,
} = require('../out/src/languages/plz/buildFileActionLayout');

const packageLabel = '//services/diagnostics:';
const targets = mergeCompletionTargets(
  [
    `${packageLabel}diagnostics`,
    `${packageLabel}diagnostics_test`,
    `${packageLabel}diagnostics_test_runner`,
    `${packageLabel}all`,
  ].join('\n'),
  [
    `${packageLabel}diagnostics_test`,
    `${packageLabel}diagnostics_test_runner`,
  ].join('\n'),
  `${packageLabel}diagnostics_test_runner`
);

assert.deepStrictEqual(targets, [
  {
    label: `${packageLabel}all`,
    name: 'all',
    canBuild: true,
    canTest: false,
    canRun: false,
  },
  {
    label: `${packageLabel}diagnostics`,
    name: 'diagnostics',
    canBuild: true,
    canTest: false,
    canRun: false,
  },
  {
    label: `${packageLabel}diagnostics_test`,
    name: 'diagnostics_test',
    canBuild: true,
    canTest: true,
    canRun: false,
  },
  {
    label: `${packageLabel}diagnostics_test_runner`,
    name: 'diagnostics_test_runner',
    canBuild: true,
    canTest: true,
    canRun: true,
  },
]);

const mappedTargets = mapTargetsToRuleCalls(
  [
    { id: 'go_library', name: 'diagnostics', line: 1 },
    { id: 'go_test', name: 'diagnostics_test', line: 16 },
  ],
  targets
);

assert.deepStrictEqual(
  mappedTargets.map(({ ruleCall, targets: mapped }) => ({
    rule: ruleCall.name,
    targets: mapped.map(({ name }) => name),
  })),
  [
    {
      rule: 'diagnostics',
      targets: ['diagnostics'],
    },
    {
      rule: 'diagnostics_test',
      targets: ['diagnostics_test', 'diagnostics_test_runner'],
    },
  ]
);

assert.deepStrictEqual(buildFileActionLayout(mappedTargets[1].targets), {
  actions: ['build', 'test', 'run', 'copy'],
  selectedAction: 'build',
  targets: mappedTargets[1].targets,
});

assert.deepStrictEqual(
  buildFileActionLayout(mappedTargets[1].targets, 'test'),
  {
    actions: ['build', 'test', 'run', 'copy'],
    selectedAction: 'test',
    targets: mappedTargets[1].targets,
  }
);

assert.deepStrictEqual(buildFileActionLayout(mappedTargets[1].targets, 'run'), {
  actions: ['build', 'test', 'run', 'copy'],
  selectedAction: 'run',
  targets: mappedTargets[1].targets,
});

assert.deepStrictEqual(
  buildFileActionLayout(mappedTargets[0].targets, 'test'),
  {
    actions: ['build', 'test', 'run', 'copy'],
    selectedAction: 'test',
    targets: mappedTargets[0].targets,
  }
);

assert.deepStrictEqual(buildFileActionLayout([]), {
  actions: [],
  selectedAction: undefined,
  targets: [],
});

assert.strictEqual(buildFileActionTitle('build', true), '[ ✓ 𝗯𝘂𝗶𝗹𝗱');
assert.strictEqual(buildFileActionTitle('test', false), 'test');
assert.strictEqual(buildFileActionTitle('run', true), '✓ 𝗿𝘂𝗻');
assert.strictEqual(buildFileActionTitle('copy', false), 'copy ]');

console.log('Target discovery tests passed.');
