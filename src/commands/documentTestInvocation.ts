export type PlzTestCommand = 'test' | 'cover';

export interface DocumentTestInvocation {
  command: PlzTestCommand;
  args: string[];
}

export function documentTestInvocation(
  command: PlzTestCommand,
  target: string,
  functionName?: string
): DocumentTestInvocation {
  // Please does not include test selectors in its test-result cache key.
  // Selected tests must bypass a cached full-suite result to actually run.
  const args = functionName
    ? ['--rerun', target, '--', functionName]
    : [target];

  return { command, args };
}
