const TEST_FUNCTION_REGEX = /^Test\P{Ll}.*/u;
const TEST_METHOD_REGEX = /^\([^)]+\)\.(Test\P{Ll}.*)$/u;
const MAX_FAILURE_CASES = 4;
const MAX_FAILURE_VALUE_LENGTH = 20000;

interface SymbolLocation<TRange> {
  readonly range: TRange;
}

export interface DocumentSymbolLike<TRange> {
  readonly name: string;
  readonly kind: number;
  readonly range?: TRange;
  readonly location?: SymbolLocation<TRange>;
  readonly children?: readonly DocumentSymbolLike<TRange>[];
}

export interface GoTestSymbol<TRange> {
  readonly functionName: string;
  readonly range: TRange;
}

export interface PleaseTestTarget {
  readonly label: string;
  readonly name: string;
}

export interface PleaseTestFailureLocation {
  readonly column?: number;
  readonly line: number;
  readonly relativeFileName: string;
}

export interface PleaseTestFailureSummary {
  readonly actual?: string;
  readonly details: readonly string[];
  readonly expected?: string;
  readonly headline: string;
  readonly location?: PleaseTestFailureLocation;
  readonly testName?: string;
}

export function packageFragmentForTestFile(relativeFileName: string): string {
  const normalized = relativeFileName.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  const packageName =
    separator === -1 ? '' : normalized.substring(0, separator);
  return `//${packageName}:`;
}

export function discoverPleaseTestTargets(
  inputTargetsOutput: string,
  testCompletionsOutput: string,
  packageFragment: string
): PleaseTestTarget[] {
  const inputTargets = new Set(
    parseTargetLabels(inputTargetsOutput, packageFragment)
  );

  return parseTargetLabels(testCompletionsOutput, packageFragment)
    .filter((label) => inputTargets.has(label))
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .map((label) => ({
      label,
      name: label.substring(label.lastIndexOf(':') + 1),
    }))
    .filter((target) => target.name.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function findGoTestSymbols<TRange>(
  symbols: readonly DocumentSymbolLike<TRange>[],
  functionKind: number,
  methodKind: number
): GoTestSymbol<TRange>[] {
  const tests: GoTestSymbol<TRange>[] = [];

  for (const symbol of symbols) {
    const functionName = goTestInvocationName(symbol.name);
    const range = symbol.range ?? symbol.location?.range;
    const isFunction =
      symbol.kind === functionKind || symbol.kind === methodKind;

    if (isFunction && functionName && range) {
      tests.push({ functionName, range });
    }

    if (symbol.children) {
      tests.push(
        ...findGoTestSymbols(symbol.children, functionKind, methodKind)
      );
    }
  }

  return tests;
}

export function pleaseTestArguments(
  target: string,
  functionName?: string
): string[] {
  return functionName ? ['--rerun', target, '--', functionName] : [target];
}

export function summarizePleaseTestFailure(
  output: string
): PleaseTestFailureSummary {
  const lines = normalizedLines(output);
  const summary =
    summarizePleaseTestFailures(output)[0] ?? fallbackFailureSummary(lines);
  const details = [...summary.details];
  const failedCases = lines
    .filter((line) => line.startsWith('Failure:') && line.includes(' in '))
    .map((line) => line.substring(line.indexOf(' in ') + ' in '.length))
    .filter(
      (name, index, names) => name.length > 0 && names.indexOf(name) === index
    )
    .slice(0, MAX_FAILURE_CASES);
  if (failedCases.length > 0) {
    details.push(
      'Failed cases:',
      ...failedCases.map((failedCase) => `  ${failedCase}`)
    );
  }
  const finalSummary = pleaseTestResultSummary(output);
  if (finalSummary) {
    details.push(`Result: ${finalSummary}`);
  }

  return {
    ...summary,
    details,
  };
}

export function summarizePleaseTestFailures(
  output: string
): PleaseTestFailureSummary[] {
  const lines = normalizedLines(output);
  const traceIndexes = lines
    .map((line, index) => (hasField(line, 'Error Trace') ? index : -1))
    .filter((index) => index !== -1);
  const failures: PleaseTestFailureSummary[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < traceIndexes.length; index += 1) {
    const start = traceIndexes[index];
    const end = traceIndexes[index + 1] ?? lines.length;
    const summary = failureBlockSummary(lines.slice(start, end));
    if (!summary) {
      continue;
    }

    const key = failureSummaryKey(summary);
    if (!seen.has(key)) {
      seen.add(key);
      failures.push(summary);
    }
  }

  return failures.length > 0 ? failures : [fallbackFailureSummary(lines)];
}

export function pleaseTestFailureMatchesFunction(
  failure: PleaseTestFailureSummary,
  functionName: string
): boolean {
  const normalizedFunctionName = functionName.startsWith('./')
    ? functionName.substring('./'.length)
    : functionName;
  return (
    failure.testName
      ?.split('/')
      .some((segment) => segment === normalizedFunctionName) ?? false
  );
}

export function pleaseTestResultSummary(output: string): string | undefined {
  const finalSummary = [...normalizedLines(output)]
    .reverse()
    .find(
      (line) =>
        /^Fail:\s/.test(line) || /^\d+ test target(?:s)? and /.test(line)
    );
  if (!finalSummary) {
    return undefined;
  }
  return finalSummary.startsWith('Fail: ')
    ? finalSummary.substring('Fail: '.length)
    : finalSummary;
}

function parseTargetLabels(output: string, packageFragment: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(':') || line.startsWith('//'))
    .map((label) =>
      label.startsWith(':')
        ? `${packageFragment}${label.substring(':'.length)}`
        : label
    );
}

function goTestInvocationName(symbolName: string): string | undefined {
  const methodMatch = symbolName.match(TEST_METHOD_REGEX);
  if (methodMatch) {
    return `./${methodMatch[1]}`;
  }

  return TEST_FUNCTION_REGEX.test(symbolName) ? symbolName : undefined;
}

function fieldValue(
  lines: readonly string[],
  field: string
): string | undefined {
  const normalizedField = field.toLowerCase();

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (
      separator !== -1 &&
      line.substring(0, separator).trim().toLowerCase() === normalizedField
    ) {
      const value = line.substring(separator + 1).trim();
      return value || undefined;
    }
  }
  return undefined;
}

function hasField(line: string, field: string): boolean {
  const separator = line.indexOf(':');
  return (
    separator !== -1 &&
    line.substring(0, separator).trim().toLowerCase() === field.toLowerCase()
  );
}

function failureBlockSummary(
  lines: readonly string[]
): PleaseTestFailureSummary | undefined {
  const error = fieldValue(lines, 'Error');
  if (!error) {
    return undefined;
  }

  const testName = fieldValue(lines, 'Test');
  const userMessage = fieldValue(lines, 'Messages');
  const expected = formatFailureValue(fieldValue(lines, 'expected'));
  const actual = formatFailureValue(fieldValue(lines, 'actual'));
  const details: string[] = [];

  if (testName) {
    details.push(`Test: ${testName}`);
  }
  if (userMessage) {
    details.push(`Message: ${userMessage}`);
  }
  if (expected !== undefined && actual !== undefined) {
    details.push(
      'Comparison: select this failure to compare expected and actual values.'
    );
  }

  return {
    headline: `Test failed: ${error}`,
    details,
    expected,
    actual,
    location: failureLocation(lines),
    testName,
  };
}

function fallbackFailureSummary(
  lines: readonly string[]
): PleaseTestFailureSummary {
  const panic = lines.find((line) => line.startsWith('panic:'));
  return {
    actual: undefined,
    headline: panic
      ? `Test panicked: ${boundedValue(
          panic.substring('panic:'.length).trim()
        )}`
      : 'Please test failed.',
    details: [],
    expected: undefined,
    location: undefined,
    testName: undefined,
  };
}

function failureSummaryKey(summary: PleaseTestFailureSummary): string {
  return [
    summary.headline,
    summary.testName,
    summary.location?.relativeFileName,
    summary.location?.line,
    summary.location?.column,
    summary.expected,
    summary.actual,
    ...summary.details,
  ].join('\u0000');
}

function failureLocation(
  lines: readonly string[]
): PleaseTestFailureLocation | undefined {
  const trace = fieldValue(lines, 'Error Trace');
  if (!trace) {
    return undefined;
  }

  const match = trace.match(/^(.+):(\d+)(?::(\d+))?$/);
  if (!match) {
    return undefined;
  }

  return {
    relativeFileName: match[1],
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : undefined,
  };
}

function stripAnsi(output: string): string {
  return output.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ''
  );
}

function normalizedLines(output: string): string[] {
  return stripAnsi(output)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim());
}

function boundedValue(value: string | undefined): string | undefined {
  if (value === undefined || value.length <= MAX_FAILURE_VALUE_LENGTH) {
    return value;
  }
  return `${value.substring(0, MAX_FAILURE_VALUE_LENGTH)}…`;
}

function formatFailureValue(value: string | undefined): string | undefined {
  const bounded = boundedValue(value);
  if (!bounded || !bounded.includes('{') || !bounded.includes('}')) {
    return bounded;
  }

  return boundedValue(formatGoLikeValue(bounded));
}

function formatGoLikeValue(value: string): string {
  const lines: string[] = [];
  let currentLine = '';
  let braceDepth = 0;
  let parenthesisDepth = 0;
  let quote: string | undefined;
  let escaped = false;

  const startLine = () => {
    currentLine = '  '.repeat(braceDepth);
  };
  const finishLine = () => {
    lines.push(currentLine.trimEnd());
    startLine();
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      currentLine += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\' && quote !== '`') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      currentLine += character;
      continue;
    }

    if (
      (character === ' ' || character === '\t') &&
      currentLine.trim().length === 0
    ) {
      continue;
    }

    if (character === '(') {
      parenthesisDepth += 1;
      currentLine += character;
      continue;
    }
    if (character === ')') {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      currentLine += character;
      continue;
    }

    if (character === '{') {
      currentLine += character;
      finishLine();
      braceDepth += 1;
      startLine();
      continue;
    }

    if (character === '}') {
      if (currentLine.trim().length > 0) {
        finishLine();
      }
      braceDepth = Math.max(0, braceDepth - 1);
      startLine();
      currentLine += character;
      continue;
    }

    if (character === ',' && braceDepth > 0 && parenthesisDepth === 0) {
      currentLine += character;
      finishLine();
      continue;
    }

    if (character === ':' && braceDepth > 0) {
      currentLine += ':';
      if (value[index + 1] !== ' ') {
        currentLine += ' ';
      }
      continue;
    }

    currentLine += character;
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trimEnd());
  }
  return lines.join('\n');
}
