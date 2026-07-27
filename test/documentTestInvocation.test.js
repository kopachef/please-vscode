const assert = require('assert').strict;

const {
  documentTestInvocation,
} = require('../out/src/commands/documentTestInvocation');

assert.deepStrictEqual(
  documentTestInvocation('cover', '//services/diagnostics:diagnostics_test'),
  {
    command: 'cover',
    args: ['//services/diagnostics:diagnostics_test'],
  }
);

assert.deepStrictEqual(
  documentTestInvocation(
    'test',
    '//services/diagnostics:diagnostics_test',
    'TestCreate'
  ),
  {
    command: 'test',
    args: [
      '--rerun',
      '//services/diagnostics:diagnostics_test',
      '--',
      'TestCreate',
    ],
  }
);

assert.deepStrictEqual(
  documentTestInvocation(
    'cover',
    '//services/diagnostics:diagnostics_test',
    './TestSuiteMethod'
  ),
  {
    command: 'cover',
    args: [
      '--rerun',
      '//services/diagnostics:diagnostics_test',
      '--',
      './TestSuiteMethod',
    ],
  }
);

console.log('Document test invocation tests passed.');
