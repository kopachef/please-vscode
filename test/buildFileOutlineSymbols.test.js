const assert = require('assert').strict;

const {
  buildFileOutlineSymbols,
} = require('../out/src/languages/plz/outlineSymbols');

const kinds = {
  function: 11,
  key: 19,
  string: 14,
  target: 18,
};

const range = (startLine, startCharacter, endLine, endCharacter) => ({
  start: { line: startLine, character: startCharacter },
  end: { line: endLine, character: endCharacter },
});

const symbols = [
  {
    name: 'subinclude',
    kind: kinds.function,
    range: range(0, 0, 0, 40),
  },
  {
    name: '//build_defs:custom_rule',
    kind: kinds.string,
    range: range(0, 11, 0, 39),
  },
  {
    name: 'go_library',
    kind: kinds.function,
    range: range(2, 0, 8, 1),
  },
  {
    name: 'name',
    kind: kinds.key,
    range: range(3, 4, 3, 8),
  },
  {
    name: 'diagnostics',
    kind: kinds.string,
    range: range(3, 11, 3, 24),
  },
  {
    name: 'srcs',
    kind: kinds.key,
    range: range(4, 4, 4, 8),
  },
  {
    name: 'glob',
    kind: kinds.function,
    range: range(4, 11, 6, 5),
  },
  {
    name: '*.go',
    kind: kinds.string,
    range: range(5, 9, 5, 15),
  },
  {
    name: 'go_test',
    kind: kinds.function,
    range: range(10, 0, 14, 1),
  },
  {
    name: 'name',
    kind: kinds.key,
    range: range(11, 4, 11, 8),
  },
  {
    name: 'diagnostics_test',
    kind: kinds.string,
    range: range(11, 11, 11, 29),
  },
  {
    name: ':diagnostics',
    kind: kinds.string,
    range: range(12, 8, 12, 22),
  },
];

assert.deepStrictEqual(buildFileOutlineSymbols(symbols, kinds), [
  {
    name: 'subinclude',
    detail: '//build_defs:custom_rule',
    kind: kinds.function,
    range: range(0, 0, 0, 40),
    selectionRange: range(0, 0, 0, 10),
  },
  {
    name: 'diagnostics',
    detail: 'go_library',
    kind: kinds.target,
    range: range(2, 0, 8, 1),
    selectionRange: range(3, 11, 3, 24),
  },
  {
    name: 'diagnostics_test',
    detail: 'go_test',
    kind: kinds.target,
    range: range(10, 0, 14, 1),
    selectionRange: range(11, 11, 11, 29),
  },
]);

assert.deepStrictEqual(
  buildFileOutlineSymbols(
    [
      {
        name: 'nested_only',
        kind: kinds.function,
        range: range(1, 4, 1, 20),
      },
    ],
    kinds
  ),
  []
);

console.log('BUILD file Outline symbol tests passed.');
