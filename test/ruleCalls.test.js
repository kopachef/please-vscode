const assert = require('assert').strict;

const {
  labelPackage,
  getRuleCalls,
  parseRuleCalls,
  ruleCallForTarget,
  targetsFromAllowedBuildDefs,
} = require('../out/src/languages/plz/ruleCalls');

const domainCalls = parseRuleCalls(
  JSON.stringify([
    { id: 'go_library', name: 'calculator', line: 1 },
    { id: 'go_test', name: 'calculator_test', line: 7 },
  ])
);
const satCalls = parseRuleCalls(
  JSON.stringify([
    {
      id: 'variant_go_test',
      name: 'calculator_sat_test',
      line: 3,
    },
    {
      id: 'expensive_go_test',
      name: 'calculator_expensive_test',
      line: 12,
    },
  ])
);

assert.equal(
  ruleCallForTarget('//calculator/sat:calculator_sat_test_addition', satCalls)
    .id,
  'variant_go_test'
);
assert.equal(
  ruleCallForTarget('//calculator/domain:calculator_test', domainCalls).id,
  'go_test'
);
assert.equal(
  ruleCallForTarget('//calculator/sat:calculator_sat_test_addition', [
    ...satCalls,
    {
      id: 'special_go_test',
      name: 'calculator_sat_test_addition',
      line: 20,
    },
  ]).id,
  'special_go_test'
);
assert.equal(
  ruleCallForTarget('//calculator/sat:unrelated_test', satCalls),
  undefined
);
assert.equal(
  labelPackage('//calculator/sat:calculator_sat_test_addition'),
  'calculator/sat'
);

const targets = [
  '//calculator/domain:calculator_test',
  '//calculator/sat:calculator_sat_test_addition',
  '//calculator/sat:calculator_sat_test_subtraction',
  '//calculator/sat:calculator_expensive_test',
];
const callsByPackage = new Map([
  ['calculator/domain', domainCalls],
  ['calculator/sat', satCalls],
]);

assert.deepStrictEqual(
  targetsFromAllowedBuildDefs(targets, callsByPackage, [
    'go_test',
    'variant_go_test',
  ]),
  [
    '//calculator/domain:calculator_test',
    '//calculator/sat:calculator_sat_test_addition',
    '//calculator/sat:calculator_sat_test_subtraction',
  ]
);

assert.throws(() => parseRuleCalls('{}'), /must be a list/);
assert.throws(
  () => parseRuleCalls('[{"id":"go_test","name":"test"}]'),
  /rule call 1 is invalid/
);

async function testRuleCallScript() {
  assert.deepStrictEqual(
    await getRuleCalls(
      'python3',
      'go_test(\n    name = "calculator_test",\n)\n'
    ),
    [{ id: 'go_test', name: 'calculator_test', line: 1 }]
  );
}

testRuleCallScript()
  .then(() => console.log('BUILD rule call tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
