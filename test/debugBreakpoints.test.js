const assert = require('assert').strict;

const {
  DEFAULT_STOP_ON_ENTRY_MODE,
  UNVERIFIED_BREAKPOINT_MESSAGE,
  debugStopOnEntryMode,
  shouldStopOnEntry,
  unverifiedBreakpoint,
} = require('../out/src/languages/go/debugBreakpoints');

assert.strictEqual(DEFAULT_STOP_ON_ENTRY_MODE, 'whenNoVerifiedBreakpoints');
assert.strictEqual(
  debugStopOnEntryMode(undefined, undefined),
  'whenNoVerifiedBreakpoints'
);
assert.strictEqual(debugStopOnEntryMode(undefined, 'never'), 'never');
assert.strictEqual(debugStopOnEntryMode(undefined, 'always'), 'always');
assert.strictEqual(debugStopOnEntryMode(true, 'never'), 'always');
assert.strictEqual(
  debugStopOnEntryMode(false, 'whenNoVerifiedBreakpoints'),
  'never'
);
assert.throws(
  () => debugStopOnEntryMode('true', 'never'),
  /stopOnEntry must be a boolean/
);
assert.throws(
  () => debugStopOnEntryMode(undefined, 'sometimes'),
  /plz\.debug\.stopOnEntry must be/
);

assert.strictEqual(shouldStopOnEntry('whenNoVerifiedBreakpoints', 0), true);
assert.strictEqual(shouldStopOnEntry('whenNoVerifiedBreakpoints', 1), false);
assert.strictEqual(shouldStopOnEntry('always', 1), true);
assert.strictEqual(shouldStopOnEntry('never', 0), false);

assert.deepStrictEqual(unverifiedBreakpoint(42), {
  verified: false,
  line: 42,
  message: UNVERIFIED_BREAKPOINT_MESSAGE,
});

console.log('Debug breakpoint tests passed.');
