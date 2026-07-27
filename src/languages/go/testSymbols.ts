const TEST_FUNCTION_REGEX = /^Test\P{Ll}.*/u;
const TEST_METHOD_REGEX = /^\([^)]+\)\.(Test\P{Ll}.*)$/u;

interface SymbolLocation<TRange> {
  readonly range: TRange;
}

export interface GoDocumentSymbol<TRange> {
  readonly name: string;
  readonly kind: number;
  readonly range?: TRange;
  readonly location?: SymbolLocation<TRange>;
  readonly children?: readonly GoDocumentSymbol<TRange>[];
}

export interface GoTestSymbol<TRange> {
  readonly functionName: string;
  readonly range: TRange;
}

export function findGoTestSymbols<TRange>(
  symbols: readonly GoDocumentSymbol<TRange>[],
  functionKind: number,
  methodKind: number
): GoTestSymbol<TRange>[] {
  const tests: GoTestSymbol<TRange>[] = [];

  for (const symbol of symbols) {
    const functionName = testInvocationName(symbol.name);
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

function testInvocationName(symbolName: string): string | undefined {
  const methodMatch = symbolName.match(TEST_METHOD_REGEX);
  if (methodMatch) {
    // The slash selects a suite subtest. Keep the selector relative because
    // Please also appends it to the target's test command, where an absolute
    // path can be interpreted as an unwritable output filename by `tee`.
    return `./${methodMatch[1]}`;
  }

  return TEST_FUNCTION_REGEX.test(symbolName) ? symbolName : undefined;
}
