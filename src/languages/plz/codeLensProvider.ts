import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

import { CLIPBOARD_WRITE_COMMAND } from '../../commands/clipboardWriteCommand';
import * as plz from '../../please';
import { getBinPathUsingConfig } from '../../utils';
import {
  mapTargetsToRuleCalls,
  mergeCompletionTargets,
  RuleCall,
  TargetCapabilities,
} from './targetDiscovery';
import {
  buildFileActionLayout,
  buildFileActionTitle,
  BuildFileActionKind,
} from './buildFileActionLayout';

const SELECT_BUILD_FILE_ACTION_COMMAND = 'plz.buildFile.selectAction';

interface BuildFileCodeLensData {
  documentVersion: number;
  ruleCalls: RuleCall[];
  targets: TargetCapabilities[];
}

export class BuildFileCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private python3NotFoundMessageShown = false;
  private readonly selectedActions = new Map<string, BuildFileActionKind>();
  private readonly documentData = new Map<string, BuildFileCodeLensData>();
  private readonly codeLensesChanged = new vscode.EventEmitter<void>();

  public readonly onDidChangeCodeLenses = this.codeLensesChanged.event;

  public selectAction(ruleKey: string, action: BuildFileActionKind): void {
    this.selectedActions.set(ruleKey, action);
    this.codeLensesChanged.fire();
  }

  public dispose(): void {
    this.documentData.clear();
    this.codeLensesChanged.dispose();
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (!plz.BUILD_FILENAME_REGEX.test(path.basename(document.fileName))) {
      return [];
    }

    return await this.getCodeLenses(document, token);
  }

  private async getCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const data = await this.getCodeLensData(document, token);
    if (!data) {
      return [];
    }

    const codeLens: vscode.CodeLens[] = [];
    for (const { ruleCall, targets: ruleTargets } of mapTargetsToRuleCalls(
      data.ruleCalls,
      data.targets
    )) {
      const { line } = ruleCall;
      // Get line range.
      const range = new vscode.Range(
        new vscode.Position(line - 1, 0),
        new vscode.Position(line - 1, 0)
      );
      const ruleKey = `${document.uri.toString()}#${ruleCall.name}`;
      const layout = buildFileActionLayout(
        ruleTargets,
        this.selectedActions.get(ruleKey)
      );

      if (!layout.selectedAction) {
        continue;
      }
      for (const action of layout.actions) {
        codeLens.push(
          actionSelectorCodeLens(
            range,
            ruleKey,
            action,
            action === layout.selectedAction
          )
        );
      }
      for (const target of layout.targets) {
        codeLens.push(targetCodeLens(range, layout.selectedAction, target));
      }
    }

    return codeLens;
  }

  private async getCodeLensData(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<BuildFileCodeLensData | undefined> {
    const documentKey = document.uri.toString();
    const documentVersion = document.version;
    const cached = this.documentData.get(documentKey);
    if (cached?.documentVersion === documentVersion) {
      return cached;
    }

    const python3 = getBinPathUsingConfig('python3');
    if (!python3) {
      if (!this.python3NotFoundMessageShown) {
        this.python3NotFoundMessageShown = true;
        vscode.window.showWarningMessage(
          'Cannot find python3 required for adding code lenses to BUILD files.'
        );
      }
      return undefined;
    }

    let ruleCalls: RuleCall[];
    try {
      const content = await getRuleCalls(python3, document.getText());
      ruleCalls = JSON.parse(content);
    } catch (e) {
      plz.outputChannel.appendLine(
        `Error placing codelenses on '${document.fileName}': ${e.message}`
      );
      return undefined;
    }

    let targets: TargetCapabilities[];
    try {
      targets = await discoverTargets(document, token);
    } catch (e) {
      plz.outputChannel.appendLine(
        `Error discovering targets for '${document.fileName}': ${e.message}`
      );
      return undefined;
    }

    // VS Code commonly cancels superseded CodeLens requests while an editor is
    // opening or reloading. A cancelled completion query resolves without
    // targets, so never cache that partial result.
    if (token.isCancellationRequested || document.version !== documentVersion) {
      return undefined;
    }

    const data = {
      documentVersion,
      ruleCalls,
      targets,
    };
    this.documentData.set(documentKey, data);
    return data;
  }
}

function actionSelectorCodeLens(
  range: vscode.Range,
  ruleKey: string,
  action: BuildFileActionKind,
  selected: boolean
): vscode.CodeLens {
  return new vscode.CodeLens(range, {
    title: buildFileActionTitle(action, selected),
    command: SELECT_BUILD_FILE_ACTION_COMMAND,
    arguments: [ruleKey, action],
  });
}

function targetCodeLens(
  range: vscode.Range,
  action: BuildFileActionKind,
  target: TargetCapabilities
): vscode.CodeLens {
  const shortTarget = `:${target.name}`;

  switch (action) {
    case 'build':
      return new vscode.CodeLens(range, {
        title: shortTarget,
        command: 'plz',
        arguments: [{ command: 'build', args: [target.label] }],
      });
    case 'test':
      return new vscode.CodeLens(range, {
        title: shortTarget,
        command: 'plz',
        arguments: [{ command: 'test', args: [target.label] }],
      });
    case 'run':
      return new vscode.CodeLens(range, {
        title: shortTarget,
        command: 'plz',
        arguments: [
          {
            command: 'run',
            args: [target.label],
            runtime: true,
          },
        ],
      });
    case 'copy':
      return new vscode.CodeLens(range, {
        title: shortTarget,
        command: CLIPBOARD_WRITE_COMMAND,
        arguments: [
          {
            text: target.label,
          },
        ],
      });
  }
}

export function registerBuildFileCodeLensCommands(
  provider: BuildFileCodeLensProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    SELECT_BUILD_FILE_ACTION_COMMAND,
    (ruleKey: string, action: BuildFileActionKind) =>
      provider.selectAction(ruleKey, action)
  );
}

async function discoverTargets(
  document: vscode.TextDocument,
  token: vscode.CancellationToken
): Promise<TargetCapabilities[]> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    throw new Error('The BUILD file is not inside a workspace folder.');
  }

  const packageFragment = plz.buildLabel(
    workspaceFolder.uri.fsPath,
    document.fileName,
    ''
  );
  const completionTargets = async (command: string): Promise<string> => {
    if (token.isCancellationRequested) {
      return '';
    }

    return await plz.runCommandAsync(
      [
        '--plain_output',
        'query',
        'completions',
        `--cmd=${command}`,
        packageFragment,
      ],
      {
        cwd: workspaceFolder.uri.fsPath,
        token,
      }
    );
  };

  const buildOutput = await completionTargets('build');
  const testOutput = await completionTargets('test');
  const runOutput = await completionTargets('run');

  return mergeCompletionTargets(buildOutput, testOutput, runOutput);
}

async function getRuleCalls(
  python3Path: string,
  buildFileContents: string
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const proc = execFile(
      python3Path,
      [path.join(__dirname, '../../../scripts/rule_calls.py')],
      { encoding: 'utf-8' },
      (err, stdout, stderr) => {
        if (err || stderr) {
          return reject(err || stderr);
        }
        resolve(stdout);
      }
    );
    proc.stdin.end(buildFileContents);
  });
}
