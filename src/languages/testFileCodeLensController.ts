import * as path from 'path';
import * as vscode from 'vscode';

import * as plz from '../please';
import {
  discoverTestFileTargets,
  testFileActionLayout,
  testFileActionTitle,
  TestFileActionKind,
  TestFileTarget,
} from './testFileActionLayout';

type TestLanguage = 'go' | 'python';

interface CachedTargets {
  documentVersion: number;
  targets: TestFileTarget[];
}

export class TestFileCodeLensController implements vscode.Disposable {
  private readonly selectedActions = new Map<string, TestFileActionKind>();
  private readonly targetCache = new Map<string, CachedTargets>();
  private readonly codeLensesChanged = new vscode.EventEmitter<void>();
  private readonly selectActionCommand: string;

  public readonly onDidChangeCodeLenses = this.codeLensesChanged.event;

  constructor(private readonly language: TestLanguage) {
    this.selectActionCommand = `plz.${language}TestFile.selectAction`;
  }

  public registerCommands(): vscode.Disposable {
    return vscode.commands.registerCommand(
      this.selectActionCommand,
      (documentKey: string, action: TestFileActionKind) =>
        this.selectAction(documentKey, action)
    );
  }

  public refresh(): void {
    this.codeLensesChanged.fire();
  }

  public dispose(): void {
    this.selectedActions.clear();
    this.targetCache.clear();
    this.codeLensesChanged.dispose();
  }

  public async targetsForDocument(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<TestFileTarget[]> {
    const documentKey = document.uri.toString();
    const documentVersion = document.version;
    const cached = this.targetCache.get(documentKey);
    if (cached?.documentVersion === documentVersion) {
      return cached.targets;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      throw new Error('The test file is not inside a workspace folder.');
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    const relativeFileName = path
      .relative(workspaceRoot, document.fileName)
      .split(path.sep)
      .join('/');
    const packageFragment = plz.buildLabel(
      workspaceRoot,
      document.fileName,
      ''
    );

    const [inputTargetsOutput, testCompletionsOutput] = await Promise.all([
      plz.runCommandAsync(['query', 'whatinputs', relativeFileName], {
        cwd: workspaceRoot,
        token,
      }),
      plz.runCommandAsync(
        [
          '--plain_output',
          'query',
          'completions',
          '--cmd=test',
          packageFragment,
        ],
        {
          cwd: workspaceRoot,
          token,
        }
      ),
    ]);

    if (token.isCancellationRequested || document.version !== documentVersion) {
      return [];
    }

    const targets = discoverTestFileTargets(
      inputTargetsOutput,
      testCompletionsOutput,
      packageFragment
    );
    this.targetCache.set(documentKey, {
      documentVersion,
      targets,
    });
    return targets;
  }

  public inlineCodeLenses(
    document: vscode.TextDocument,
    range: vscode.Range,
    functionName: string,
    targets: TestFileTarget[]
  ): vscode.CodeLens[] {
    const documentKey = document.uri.toString();
    const layout = testFileActionLayout(
      targets,
      this.selectedActions.get(documentKey)
    );

    if (!layout.selectedAction) {
      return this.fallbackCodeLenses(document, range, functionName);
    }

    const codeLenses = layout.actions.map(
      (action) =>
        new vscode.CodeLens(range, {
          title: testFileActionTitle(action, action === layout.selectedAction),
          command: this.selectActionCommand,
          arguments: [documentKey, action],
        })
    );

    for (const target of layout.targets) {
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `:${target.name}`,
          command:
            layout.selectedAction === 'test'
              ? 'plz.test.document'
              : 'plz.debug.document',
          arguments: [
            {
              document,
              functionName,
              target: target.label,
              ...(layout.selectedAction === 'debug'
                ? { language: this.language }
                : {}),
            },
          ],
        })
      );
    }

    return codeLenses;
  }

  private selectAction(documentKey: string, action: TestFileActionKind): void {
    this.selectedActions.set(documentKey, action);
    this.refresh();
  }

  private fallbackCodeLenses(
    document: vscode.TextDocument,
    range: vscode.Range,
    functionName: string
  ): vscode.CodeLens[] {
    return [
      new vscode.CodeLens(range, {
        title: 'plz test',
        command: 'plz.test.document',
        arguments: [{ document, functionName }],
      }),
      new vscode.CodeLens(range, {
        title: 'plz debug',
        command: 'plz.debug.document',
        arguments: [{ document, functionName, language: this.language }],
      }),
    ];
  }
}
