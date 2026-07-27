const assert = require('assert').strict;

const {
  debugRuntimeArgs,
  debugTarget,
  pleaseDebugBinArgs,
} = require('../out/src/languages/go/debugConfiguration');

assert.strictEqual(debugTarget(undefined), undefined);
assert.strictEqual(debugTarget(null), undefined);
assert.strictEqual(debugTarget(''), undefined);
assert.strictEqual(
  debugTarget('//services/customer:customer_test'),
  '//services/customer:customer_test'
);
assert.throws(() => debugTarget(42), /debug target must be a string/);

assert.deepStrictEqual(debugRuntimeArgs(undefined), []);
assert.deepStrictEqual(debugRuntimeArgs(['TestCreate']), ['TestCreate']);
assert.throws(
  () => debugRuntimeArgs('TestCreate'),
  /runtimeArgs must be an array of strings/
);
assert.throws(
  () => debugRuntimeArgs(['TestCreate', 42]),
  /runtimeArgs must be an array of strings/
);

assert.deepStrictEqual(
  pleaseDebugBinArgs(
    ['--noupdate'],
    '/Users/martin/go/bin/dlv',
    [
      '/usr/local/go/bin:/usr/local/bin',
      '/Users/martin/go/bin',
      '/usr/bin',
      '/bin',
    ].join('\n')
  ),
  [
    '--noupdate',
    '-o',
    'build.path:/Users/martin/go/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin',
  ]
);

assert.deepStrictEqual(pleaseDebugBinArgs([], '/opt/go/bin/dlv', ''), [
  '-o',
  'build.path:/opt/go/bin',
]);

console.log('Debug configuration tests passed.');
