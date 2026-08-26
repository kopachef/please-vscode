const assert = require('assert').strict;

const { terminalCommandLine } = require('../out/src/terminalCommandLine');

assert.strictEqual(
  terminalCommandLine('/Users/example/.local/bin/plz', [
    '--noupdate',
    'cover',
    '//calculator/domain:calculator_test',
  ]),
  'plz --noupdate cover //calculator/domain:calculator_test'
);
assert.strictEqual(
  terminalCommandLine('/tmp/custom please', [
    'run',
    '//app:binary',
    'two words',
  ]),
  '"/tmp/custom please" run //app:binary "two words"'
);

console.log('Terminal command-line tests passed.');
