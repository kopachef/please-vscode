const assert = require('assert');
const {
  formatTerminalCommand,
  quoteShellArgument,
} = require('../out/src/commands/terminalCommand');

assert.strictEqual(
  quoteShellArgument(':diagnostics_test'),
  ':diagnostics_test'
);
assert.strictEqual(quoteShellArgument(''), "''");
assert.strictEqual(quoteShellArgument('two words'), "'two words'");
assert.strictEqual(quoteShellArgument("it's"), "'it'\\''s'");
assert.strictEqual(
  formatTerminalCommand('plz', ['test', '//some package:diagnostics_test']),
  "plz test '//some package:diagnostics_test'"
);

console.log('Terminal command tests passed.');
