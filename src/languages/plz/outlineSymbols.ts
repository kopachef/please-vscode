export interface OutlinePosition {
  line: number;
  character: number;
}

export interface OutlineRange {
  start: OutlinePosition;
  end: OutlinePosition;
}

export interface FlatBuildSymbol {
  name: string;
  kind: number;
  range: OutlineRange;
}

export interface SemanticBuildSymbol extends FlatBuildSymbol {
  detail: string;
  selectionRange: OutlineRange;
}

export interface BuildSymbolKinds {
  function: number;
  key: number;
  string: number;
  target: number;
}

export function buildFileOutlineSymbols(
  symbols: readonly FlatBuildSymbol[],
  kinds: BuildSymbolKinds
): SemanticBuildSymbol[] {
  const topLevelCalls = symbols.filter(
    (symbol) =>
      symbol.kind === kinds.function && symbol.range.start.character === 0
  );

  return topLevelCalls.map((call) => {
    const callBodySymbols = symbols.filter(
      (symbol) => symbol !== call && rangeContains(call.range, symbol.range)
    );
    const nameKey = callBodySymbols.find(
      (symbol) => symbol.kind === kinds.key && symbol.name === 'name'
    );
    const targetName =
      nameKey &&
      callBodySymbols.find(
        (symbol) =>
          symbol.kind === kinds.string &&
          symbol.range.start.line === nameKey.range.start.line &&
          positionAfter(symbol.range.start, nameKey.range.end)
      );

    if (targetName) {
      return {
        name: targetName.name,
        detail: call.name,
        kind: kinds.target,
        range: call.range,
        selectionRange: targetName.range,
      };
    }

    const firstString = callBodySymbols.find(
      (symbol) => symbol.kind === kinds.string
    );
    return {
      name: call.name,
      detail: firstString?.name ?? '',
      kind: call.kind,
      range: call.range,
      selectionRange: {
        start: call.range.start,
        end: {
          line: call.range.start.line,
          character: call.range.start.character + call.name.length,
        },
      },
    };
  });
}

function rangeContains(parent: OutlineRange, child: OutlineRange): boolean {
  return (
    comparePositions(parent.start, child.start) <= 0 &&
    comparePositions(parent.end, child.end) >= 0
  );
}

function positionAfter(
  position: OutlinePosition,
  other: OutlinePosition
): boolean {
  return comparePositions(position, other) >= 0;
}

function comparePositions(
  left: OutlinePosition,
  right: OutlinePosition
): number {
  return left.line === right.line
    ? left.character - right.character
    : left.line - right.line;
}
