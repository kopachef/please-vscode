import * as vscode from 'vscode';

import {
  CLEAR_COVERAGE_COMMAND,
  CoverageDecorations,
} from '../../coverage/coverageDecorations';
import { getBinPathUsingConfig } from '../../utils';
import { documentSymbols } from './goOutline';

const TEST_FUNCTION_REGEX = /^Test\P{Ll}.*/u;
const TEST_METHOD_REGEX = /^\(([^)]+)\)\.(Test\P{Ll}.*)$/u;

export class GoTestCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private goOutlineNotFoundMessageShown = false;
  private readonly coverageChangeListener: vscode.Disposable;
  private readonly codeLensesChanged = new vscode.EventEmitter<void>();

  public readonly onDidChangeCodeLenses = this.codeLensesChanged.event;

  constructor(private readonly coverageDecorations: CoverageDecorations) {
    // `[clear]` is visible only while this document has coverage results.
    this.coverageChangeListener = coverageDecorations.onDidChangeCoverage(() =>
      this.codeLensesChanged.fire()
    );
  }

  public dispose(): void {
    this.coverageChangeListener.dispose();
    this.codeLensesChanged.dispose();
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!document.fileName.endsWith('.go')) {
      return [];
    }

    if (!document.fileName.endsWith('_test.go')) {
      const range = new vscode.Range(0, 0, 0, 0);
      return [
        new vscode.CodeLens(range, {
          title: 'plz cover',
          command: 'plz.cover.document',
          arguments: [{ document, sourceFile: true }],
        }),
        ...this.clearCoverageCodeLenses(document, range),
      ];
    }

    return await this.getCodeLens(document, token);
  }

  private async getCodeLens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const range = new vscode.Range(0, 0, 0, 0);
    const documentCodeLenses = [
      new vscode.CodeLens(range, {
        title: 'plz test',
        command: 'plz.test.document',
        arguments: [{ document }],
      }),
      new vscode.CodeLens(range, {
        title: 'plz cover',
        command: 'plz.cover.document',
        arguments: [{ document }],
      }),
      new vscode.CodeLens(range, {
        title: 'plz debug',
        command: 'plz.debug.document',
        arguments: [{ document, language: 'go' }],
      }),
      ...this.clearCoverageCodeLenses(document, range),
    ];

    const goOutline = getBinPathUsingConfig('go-outline');
    if (!goOutline) {
      if (!this.goOutlineNotFoundMessageShown) {
        this.goOutlineNotFoundMessageShown = true;
        vscode.window.showWarningMessage(
          'Go Outline is required for providing code lenses in Go tests for debugging. Get it from https://github.com/ramya-rao-a/go-outline.'
        );
      }
      return documentCodeLenses;
    }

    const symbols = await documentSymbols(goOutline, document, token);
    if (!Array.isArray(symbols)) {
      return documentCodeLenses;
    }

    const pkg = symbols[0];
    if (!pkg) {
      return documentCodeLenses;
    }

    let codeLens: vscode.CodeLens[] = documentCodeLenses;

    const testFunctions = pkg.children.filter(
      (sym) =>
        sym.kind === vscode.SymbolKind.Function &&
        (TEST_FUNCTION_REGEX.test(sym.name) || TEST_METHOD_REGEX.test(sym.name))
    );
    for (const fn of testFunctions) {
      const functionName = extractTestName(fn.name);

      codeLens = [
        ...codeLens,
        new vscode.CodeLens(fn.range, {
          title: 'plz test',
          command: 'plz.test.document',
          arguments: [{ document, functionName }],
        }),
        new vscode.CodeLens(fn.range, {
          title: 'plz debug',
          command: 'plz.debug.document',
          arguments: [{ document, functionName, language: 'go' }],
        }),
      ];
    }

    return codeLens;
  }

  private clearCoverageCodeLenses(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeLens[] {
    if (!this.coverageDecorations.hasCoverageForDocument(document)) {
      return [];
    }
    return [
      new vscode.CodeLens(range, {
        title: '[clear]',
        command: CLEAR_COVERAGE_COMMAND,
      }),
    ];
  }
}

export function registerGoTestCodeLensProvider(
  coverageDecorations: CoverageDecorations
): vscode.Disposable {
  const provider = new GoTestCodeLensProvider(coverageDecorations);
  return vscode.Disposable.from(
    provider,
    vscode.languages.registerCodeLensProvider(
      { language: 'go', scheme: 'file' },
      provider
    )
  );
}

function extractTestName(symbolName: string): string {
  if (TEST_FUNCTION_REGEX.test(symbolName)) {
    return symbolName;
  } else if (TEST_METHOD_REGEX.test(symbolName)) {
    const match = symbolName.match(TEST_METHOD_REGEX);
    return `/${match[2]}`;
  }

  return '';
}
