import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  CLEAR_COVERAGE_COMMAND,
  CoverageDecorations,
} from '../../coverage/coverageDecorations';
import * as plz from '../../please';
import { getBinPath } from '../../utils/pathUtils';
import { TestFileCodeLensController } from '../testFileCodeLensController';

// Test function location item structure returned by `scripts/test_functions.py`.
interface TestFunctionLocation {
  id: string;
  line: number;
}

// Good enough heuristic.
const PYTHON_TEST_FILENAME_REGEX = /^(test_.+|.+_test)\.py$/;

export class PythonTestCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private python3NotFoundMessageShown = false;
  private readonly inlineCodeLenses = new TestFileCodeLensController('python');
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
    if (!PYTHON_TEST_FILENAME_REGEX.test(document.fileName)) {
      return [];
    }

    return await this.getCodeLens(document, token);
  }

  private async getCodeLens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    let testFunctionLocations: TestFunctionLocation[] = [];

    try {
      const python3 = getBinPath('python3');
      if (!python3) {
        if (!this.python3NotFoundMessageShown) {
          this.python3NotFoundMessageShown = true;
          vscode.window.showWarningMessage(
            'Could not find python3 required for adding all code lenses to BUILD files.'
          );
        }
      } else {
        const content = await getTextFunctions(python3, document.getText());
        testFunctionLocations = JSON.parse(content);
      }
    } catch (e) {
      plz.outputChannel.appendLine(
        `Error placing codelenses on '${document.fileName}': ${e.message}`
      );
      return [];
    }

    const firstLineRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(0, 0)
    );

    let codeLens: vscode.CodeLens[] = [
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
        arguments: [{ document, language: 'python' }],
      }),
      ...this.clearCoverageCodeLenses(document, firstLineRange),
    ];

    const targets = await this.inlineCodeLenses
      .targetsForDocument(document, token)
      .catch((e) => {
        plz.outputChannel.appendLine(
          `Error discovering test targets for '${document.fileName}': ${e.message}`
        );
        return [];
      });
    if (token.isCancellationRequested) {
      return codeLens;
    }

    for (const testFunctionLocation of testFunctionLocations) {
      const range = new vscode.Range(
        new vscode.Position(testFunctionLocation.line - 1, 0),
        new vscode.Position(testFunctionLocation.line - 1, 0)
      );

      codeLens = [
        ...codeLens,
        ...this.inlineCodeLenses.inlineCodeLenses(
          document,
          range,
          testFunctionLocation.id,
          targets
        ),
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

async function getTextFunctions(
  python3Path: string,
  sourceFileContents: string
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const proc = execFile(
      python3Path,
      [path.join(__dirname, '../../../scripts/test_functions.py')],
      { encoding: 'utf-8' },
      (err, stdout, stderr) => {
        if (err || stderr) {
          return reject(err || stderr);
        }
        resolve(stdout);
      }
    );
    proc.stdin.end(sourceFileContents);
  });
}
