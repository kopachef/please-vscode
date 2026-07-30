import * as vscode from 'vscode';

import * as plz from '../../please';
import { getBinPathUsingConfig } from '../../utils';
import { documentSymbols } from './goOutline';

const TEST_FUNCTION_REGEX = /^Test\P{Ll}.*/u;
const TEST_METHOD_REGEX = /^\(([^)]+)\)\.(Test\P{Ll}.*)$/u;

export class GoTestCodeLensProvider implements vscode.CodeLensProvider {
  private goOutlineNotFoundMessageShown = false;

  private static _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = GoTestCodeLensProvider._onDidChangeCodeLenses.event;

  public static activeMode: 'test' | 'debug' = 'test';

  public static setMode(mode: 'test' | 'debug') {
    if (this.activeMode !== mode) {
      this.activeMode = mode;
      this._onDidChangeCodeLenses.fire();
    }
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!document.fileName.endsWith('_test.go')) {
      return [];
    }

    return await this.getCodeLens(document, token);
  }

  private async getCodeLens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const goOutline = getBinPathUsingConfig('go-outline');
    if (!goOutline) {
      if (!this.goOutlineNotFoundMessageShown) {
        this.goOutlineNotFoundMessageShown = true;
        vscode.window.showWarningMessage(
          'Go Outline is required for providing code lenses in Go tests for debugging. Get it from https://github.com/ramya-rao-a/go-outline.'
        );
      }
      return;
    }

    const symbols = await documentSymbols(goOutline, document, token);
    if (!Array.isArray(symbols)) {
      return [];
    }

    const pkg = symbols[0];
    if (!pkg) {
      return [];
    }

    const targets = plz.inputTargets(document.fileName);
    let codeLens: vscode.CodeLens[] = [];

    // Add lenses for package level
    codeLens.push(...buildLenses(pkg.range, targets, document));

    const testFunctions = pkg.children.filter(
      (sym) =>
        sym.kind === vscode.SymbolKind.Function &&
        (TEST_FUNCTION_REGEX.test(sym.name) || TEST_METHOD_REGEX.test(sym.name))
    );
    for (const fn of testFunctions) {
      const functionName = extractTestName(fn.name);
      // Add lenses for function level
      codeLens.push(...buildLenses(fn.range, targets, document, functionName));
    }

    return codeLens;
  }
}

function buildLenses(
  range: vscode.Range,
  targets: string[],
  document: vscode.TextDocument,
  functionName?: string
): vscode.CodeLens[] {
  const lenses: vscode.CodeLens[] = [];
  const activeMode = GoTestCodeLensProvider.activeMode;

  // 1. Mode selector: test
  lenses.push(
    new vscode.CodeLens(range, {
      title: activeMode === 'test' ? '✔ test' : 'test',
      command: 'plz.setMode',
      arguments: ['test'],
    })
  );

  // 2. Mode selector: debug
  lenses.push(
    new vscode.CodeLens(range, {
      title: activeMode === 'debug' ? '✔ debug' : 'debug',
      command: 'plz.setMode',
      arguments: ['debug'],
    })
  );

  // 3. Targets
  for (const target of targets) {
    const colonIndex = target.indexOf(':');
    const targetName = colonIndex !== -1 ? target.substring(colonIndex + 1) : target;

    if (activeMode === 'test') {
      lenses.push(
        new vscode.CodeLens(range, {
          title: targetName,
          command: 'plz.test.document',
          arguments: [{ document, functionName, target }],
        })
      );
    } else {
      lenses.push(
        new vscode.CodeLens(range, {
          title: targetName,
          command: 'plz.debug.document',
          arguments: [{ document, functionName, language: 'go', target }],
        })
      );
    }
  }

  return lenses;
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
