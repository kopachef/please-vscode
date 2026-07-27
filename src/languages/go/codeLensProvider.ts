import * as vscode from 'vscode';

import {
  CLEAR_COVERAGE_COMMAND,
  CoverageDecorations,
} from '../../coverage/coverageDecorations';
import * as plz from '../../please';
import { TestFileCodeLensController } from '../testFileCodeLensController';
import { findGoTestSymbols } from './testSymbols';

const DOCUMENT_SYMBOL_COMMAND = 'vscode.executeDocumentSymbolProvider';

export class GoTestCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly inlineCodeLenses = new TestFileCodeLensController('go');
  private readonly coverageChangeListener: vscode.Disposable;

  public readonly onDidChangeCodeLenses: vscode.Event<void>;

  constructor(private readonly coverageDecorations: CoverageDecorations) {
    this.onDidChangeCodeLenses = this.inlineCodeLenses.onDidChangeCodeLenses;
    this.coverageChangeListener = coverageDecorations.onDidChangeCoverage(() =>
      this.inlineCodeLenses.refresh()
    );
  }

  public registerCommands(): vscode.Disposable {
    return this.inlineCodeLenses.registerCommands();
  }

  public dispose(): void {
    this.coverageChangeListener.dispose();
    this.inlineCodeLenses.dispose();
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!document.fileName.endsWith('.go')) {
      return [];
    }
    const firstLineRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    );
    if (!document.fileName.endsWith('_test.go')) {
      return [
        new vscode.CodeLens(firstLineRange, {
          title: 'plz test',
          command: 'plz.test.document',
          arguments: [{ document, sourceFile: true }],
        }),
        new vscode.CodeLens(firstLineRange, {
          title: 'plz cover',
          command: 'plz.cover.document',
          arguments: [{ document, sourceFile: true }],
        }),
        ...this.clearCoverageCodeLenses(document, firstLineRange),
      ];
    }

    return await this.getCodeLens(document, token);
  }

  private async getCodeLens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const firstLineRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    );
    const documentCodeLenses = [
      new vscode.CodeLens(firstLineRange, {
        title: 'plz test',
        command: 'plz.test.document',
        arguments: [{ document }],
      }),
      new vscode.CodeLens(firstLineRange, {
        title: 'plz cover',
        command: 'plz.cover.document',
        arguments: [{ document }],
      }),
      new vscode.CodeLens(firstLineRange, {
        title: 'plz debug',
        command: 'plz.debug.document',
        arguments: [{ document, language: 'go' }],
      }),
      ...this.clearCoverageCodeLenses(document, firstLineRange),
    ];

    if (token.isCancellationRequested) {
      return documentCodeLenses;
    }

    const symbolsPromise: Promise<
      (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
    > = Promise.resolve(
      vscode.commands.executeCommand<
        (vscode.DocumentSymbol | vscode.SymbolInformation)[]
      >(DOCUMENT_SYMBOL_COMMAND, document.uri)
    ).catch(() => undefined);
    const targetsPromise = this.inlineCodeLenses
      .targetsForDocument(document, token)
      .catch((e) => {
        plz.outputChannel.appendLine(
          `Error discovering test targets for '${document.fileName}': ${e.message}`
        );
        return [];
      });
    const [symbols, targets] = await Promise.all([
      symbolsPromise,
      targetsPromise,
    ]);

    if (token.isCancellationRequested || !symbols) {
      return documentCodeLenses;
    }

    const codeLens = [...documentCodeLenses];
    const testFunctions = findGoTestSymbols(
      symbols,
      vscode.SymbolKind.Function,
      vscode.SymbolKind.Method
    );
    for (const fn of testFunctions) {
      codeLens.push(
        ...this.inlineCodeLenses.inlineCodeLenses(
          document,
          fn.range,
          fn.functionName,
          targets
        )
      );
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
