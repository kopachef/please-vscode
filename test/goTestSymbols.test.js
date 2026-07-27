const assert = require('assert').strict;

const { findGoTestSymbols } = require('../out/src/languages/go/testSymbols');

const FUNCTION_KIND = 11;
const METHOD_KIND = 5;

const tests = findGoTestSymbols(
  [
    {
      name: 'package',
      kind: 3,
      range: { line: 0 },
      children: [
        {
          name: 'TestPlainFunction',
          kind: FUNCTION_KIND,
          range: { line: 4 },
        },
        {
          name: 'TestlowercaseIsNotAGoTest',
          kind: FUNCTION_KIND,
          range: { line: 8 },
        },
        {
          name: '(*diagnosticsDBSuite).TestSuiteMethod',
          kind: METHOD_KIND,
          range: { line: 12 },
        },
      ],
    },
    {
      name: 'TestFlatSymbol',
      kind: FUNCTION_KIND,
      location: { range: { line: 16 } },
    },
    {
      name: 'TestWrongSymbolKind',
      kind: 13,
      range: { line: 20 },
    },
  ],
  FUNCTION_KIND,
  METHOD_KIND
);

assert.deepStrictEqual(tests, [
  {
    functionName: 'TestPlainFunction',
    range: { line: 4 },
  },
  {
    functionName: './TestSuiteMethod',
    range: { line: 12 },
  },
  {
    functionName: 'TestFlatSymbol',
    range: { line: 16 },
  },
]);

console.log('Go test symbol tests passed.');
