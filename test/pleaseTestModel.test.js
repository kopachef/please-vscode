const assert = require('assert').strict;

const {
  discoverPleaseTestTargets,
  findGoTestSymbols,
  packageFragmentForTestFile,
  pleaseTestFailureMatchesFunction,
  pleaseTestArguments,
  pleaseTestResultSummary,
  summarizePleaseTestFailure,
  summarizePleaseTestFailures,
} = require('../out/src/testing/pleaseTestModel');

const packageFragment = '//services/diagnostics:';
assert.deepStrictEqual(
  discoverPleaseTestTargets(
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
  ),
  [
    {
      label: `${packageFragment}diagnostics_integration_test`,
      name: 'diagnostics_integration_test',
    },
    {
      label: `${packageFragment}diagnostics_test`,
      name: 'diagnostics_test',
    },
  ]
);

assert.strictEqual(
  packageFragmentForTestFile('services/diagnostics/diagnostics_test.go'),
  packageFragment
);
assert.strictEqual(packageFragmentForTestFile('diagnostics_test.go'), '//:');
assert.strictEqual(
  packageFragmentForTestFile('services\\diagnostics\\diagnostics_test.go'),
  packageFragment
);

const FUNCTION_KIND = 11;
const METHOD_KIND = 5;
assert.deepStrictEqual(
  findGoTestSymbols(
    [
      {
        name: 'package',
        kind: 3,
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
    ],
    FUNCTION_KIND,
    METHOD_KIND
  ),
  [
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
  ]
);

assert.deepStrictEqual(pleaseTestArguments('//services:service_test'), [
  '//services:service_test',
]);
assert.deepStrictEqual(
  pleaseTestArguments('//services:service_test', 'TestFeature'),
  ['--rerun', '//services:service_test', '--', 'TestFeature']
);

assert.deepStrictEqual(
  summarizePleaseTestFailure(
    [
      '14:52:07.006 ERROR: //services/customer:customer_test failed: customers_test.go:128:',
      '\tError Trace:\tservices/customer/customers_test.go:128',
      '\tError:      \tAn error is expected but got nil.',
      '\tTest:       \tTestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      '\tMessages:   \texpected customer create to succeed',
      'Fail: //services/customer:customer_test 0 passed 2 failed',
      'Failure:  in TestCustomerDBSuite',
      'Failure:  in TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      '1 test target and 2 tests run; 0 passed, 2 failed.',
    ].join('\n')
  ),
  {
    actual: undefined,
    headline: 'Test failed: An error is expected but got nil.',
    details: [
      'Test: TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      'Message: expected customer create to succeed',
      'Failed cases:',
      '  TestCustomerDBSuite',
      '  TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      'Result: 1 test target and 2 tests run; 0 passed, 2 failed.',
    ],
    expected: undefined,
    location: {
      relativeFileName: 'services/customer/customers_test.go',
      line: 128,
      column: undefined,
    },
    testName: 'TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
  }
);

assert.deepStrictEqual(
  summarizePleaseTestFailure(
    '\u001b[31mFail: //services/customer:customer_test 0 passed 2 failed\u001b[0m\n' +
      '1 test target and 2 tests run; 0 passed, 2 failed.'
  ),
  {
    actual: undefined,
    headline: 'Please test failed.',
    details: ['Result: 1 test target and 2 tests run; 0 passed, 2 failed.'],
    expected: undefined,
    location: undefined,
    testName: undefined,
  }
);

assert.deepStrictEqual(
  summarizePleaseTestFailure(
    [
      '\tError Trace:\tservices/customer/customers_test.go:212',
      '\tError:      \tNot equal:',
      '\t             \texpected: "active"',
      '\t             \tactual  : "archived"',
      '\tTest:       \tTestCustomerDBSuite/TestCustomerStatus',
      'Failure:  in TestCustomerDBSuite/TestCustomerStatus',
      '1 test target and 1 test run; 0 passed, 1 failed.',
    ].join('\n')
  ),
  {
    actual: '"archived"',
    headline: 'Test failed: Not equal:',
    details: [
      'Test: TestCustomerDBSuite/TestCustomerStatus',
      'Comparison: select this failure to compare expected and actual values.',
      'Failed cases:',
      '  TestCustomerDBSuite/TestCustomerStatus',
      'Result: 1 test target and 1 test run; 0 passed, 1 failed.',
    ],
    expected: '"active"',
    location: {
      relativeFileName: 'services/customer/customers_test.go',
      line: 212,
      column: undefined,
    },
    testName: 'TestCustomerDBSuite/TestCustomerStatus',
  }
);

assert.deepStrictEqual(
  summarizePleaseTestFailure(
    [
      '\tError Trace:\tservices/customer/customers_test.go:131',
      '\tError:      \tNot equal:',
      '\t             \texpected: customer.CustomerRow{ID:"customer1", Phone:pgtype.Text{String:"+260211000001", Valid:true}, CreatedTimestamp:time.Date(1970, time.January, 1, 0, 0, 2, 0, time.UTC)}',
      '\t             \tactual  : customer.CustomerRow{ID:"customer1", Phone:pgtype.Text{String:"+260211000001", Valid:true}, CreatedTimestamp:time.Date(1970, time.January, 1, 0, 0, 1, 0, time.UTC)}',
      '\tTest:       \tTestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      '1 test target and 1 test run; 0 passed, 1 failed.',
    ].join('\n')
  ),
  {
    actual: [
      'customer.CustomerRow{',
      '  ID: "customer1",',
      '  Phone: pgtype.Text{',
      '    String: "+260211000001",',
      '    Valid: true',
      '  },',
      '  CreatedTimestamp: time.Date(1970, time.January, 1, 0, 0, 1, 0, time.UTC)',
      '}',
    ].join('\n'),
    headline: 'Test failed: Not equal:',
    details: [
      'Test: TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
      'Comparison: select this failure to compare expected and actual values.',
      'Result: 1 test target and 1 test run; 0 passed, 1 failed.',
    ],
    expected: [
      'customer.CustomerRow{',
      '  ID: "customer1",',
      '  Phone: pgtype.Text{',
      '    String: "+260211000001",',
      '    Valid: true',
      '  },',
      '  CreatedTimestamp: time.Date(1970, time.January, 1, 0, 0, 2, 0, time.UTC)',
      '}',
    ].join('\n'),
    location: {
      relativeFileName: 'services/customer/customers_test.go',
      line: 131,
      column: undefined,
    },
    testName: 'TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
  }
);

const multipleFailureOutput = [
  '\tError Trace:\tservices/customer/customers_test.go:131',
  '\tError:      \tNot equal:',
  '\t             \texpected: "created-at-2"',
  '\t             \tactual  : "created-at-1"',
  '\tTest:       \tTestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
  '\tMessages:   \texpected created customer row',
  '\tError Trace:\tservices/customer/customers_test.go:175',
  '\tError:      \tNot equal:',
  '\t             \texpected: "updated-at-1"',
  '\t             \tactual  : "updated-at-2"',
  '\tTest:       \tTestCustomerDBSuite/TestCreateCustomerCreatesRowGivenMinimalFields',
  '\tMessages:   \texpected minimal customer row',
  'Failure:  in TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
  '\tError Trace:\tservices/customer/customers_test.go:131',
  '\tError:      \tNot equal:',
  '\t             \texpected: "created-at-2"',
  '\t             \tactual  : "created-at-1"',
  '\tTest:       \tTestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
  '\tMessages:   \texpected created customer row',
  '1 test target and 48 tests run; 45 passed, 3 failed.',
].join('\n');
const multipleFailures = summarizePleaseTestFailures(multipleFailureOutput);

assert.strictEqual(multipleFailures.length, 2);
assert.deepStrictEqual(
  multipleFailures.map((failure) => ({
    actual: failure.actual,
    expected: failure.expected,
    line: failure.location?.line,
    testName: failure.testName,
  })),
  [
    {
      actual: '"created-at-1"',
      expected: '"created-at-2"',
      line: 131,
      testName:
        'TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenAllFields',
    },
    {
      actual: '"updated-at-2"',
      expected: '"updated-at-1"',
      line: 175,
      testName:
        'TestCustomerDBSuite/TestCreateCustomerCreatesRowGivenMinimalFields',
    },
  ]
);
assert.strictEqual(
  pleaseTestFailureMatchesFunction(
    multipleFailures[0],
    './TestCreateCustomerCreatesRowGivenAllFields'
  ),
  true
);
assert.strictEqual(
  pleaseTestFailureMatchesFunction(
    multipleFailures[0],
    './TestCreateCustomerCreatesRowGivenMinimalFields'
  ),
  false
);
assert.strictEqual(
  pleaseTestResultSummary(multipleFailureOutput),
  '1 test target and 48 tests run; 45 passed, 3 failed.'
);

console.log('Please Test Explorer model tests passed.');
