export type StopOnEntryMode = 'never' | 'whenNoVerifiedBreakpoints' | 'always';

export const DEFAULT_STOP_ON_ENTRY_MODE: StopOnEntryMode =
  'whenNoVerifiedBreakpoints';

export const UNVERIFIED_BREAKPOINT_MESSAGE =
  'Delve could not verify this breakpoint. Make sure the line contains executable Go code and belongs to the selected Please target.';

export function debugStopOnEntryMode(
  stopOnEntry: unknown,
  configuredMode: unknown
): StopOnEntryMode {
  if (stopOnEntry !== undefined) {
    if (typeof stopOnEntry !== 'boolean') {
      throw new Error('Debug stopOnEntry must be a boolean.');
    }
    return stopOnEntry ? 'always' : 'never';
  }

  switch (configuredMode) {
    case undefined:
      return DEFAULT_STOP_ON_ENTRY_MODE;
    case 'never':
    case 'whenNoVerifiedBreakpoints':
    case 'always':
      return configuredMode;
    default:
      throw new Error(
        'plz.debug.stopOnEntry must be never, whenNoVerifiedBreakpoints, or always.'
      );
  }
}

export function shouldStopOnEntry(
  mode: StopOnEntryMode,
  verifiedBreakpointCount: number
): boolean {
  return (
    mode === 'always' ||
    (mode === 'whenNoVerifiedBreakpoints' && verifiedBreakpointCount === 0)
  );
}

export function unverifiedBreakpoint(line: number): {
  verified: false;
  line: number;
  message: string;
} {
  return {
    verified: false,
    line,
    message: UNVERIFIED_BREAKPOINT_MESSAGE,
  };
}
