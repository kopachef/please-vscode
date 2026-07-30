import { ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';

import {
  retrieveCoverageTargets,
  retrieveInputFileCoverageTargets,
  retrieveWorkspaceCoverageTargets,
} from '../coverage/coverageTargets';
import { coverageCommandArgs } from '../coverage/coverageInvocation';
import * as plz from '../please';

export const SELECT_COVERAGE_TARGET_COMMAND =
  'plz.coverage.selectDocumentTarget';

/**
 * Runs fast package-scoped coverage by default. The explicit target command
 * discovers cross-package dependents asynchronously and runs only the selected
 * target.
 */
export async function plzCoverDocumentCommand(args: {
  document: vscode.TextDocument;
  functionName?: string;
  sourceFile?: boolean;
  selectTarget?: boolean;
}): Promise<ChildProcessWithoutNullStreams | undefined> {
  plz.outputChannel.show(true);

  try {
    const {
      document: { fileName },
      functionName,
      sourceFile,
      selectTarget,
    } = args;

    let targets: string[];
    if (sourceFile && selectTarget) {
      const cancellation = new vscode.CancellationTokenSource();
      try {
        targets = await retrieveWorkspaceCoverageTargets(
          fileName,
          cancellation.token
        );
      } finally {
        cancellation.dispose();
      }
    } else {
      targets = sourceFile
        ? retrieveCoverageTargets(fileName)
        : retrieveInputFileCoverageTargets(fileName);
    }

    if (selectTarget && targets.length > 1) {
      const target = await vscode.window.showQuickPick(targets, {
        placeHolder: `Select one of ${targets.length} test targets to cover`,
      });
      if (!target) {
        return;
      }
      targets = [target];
    }

    return await vscode.commands.executeCommand('plz', {
      command: 'cover',
      args: coverageCommandArgs(targets, functionName),
    });
  } catch (e) {
    plz.outputChannel.appendLine(
      `> Coverage command failed before starting:\n${e.message}`
    );
    return undefined;
  }
}

export async function plzCoverActiveDocumentWithTargetCommand(): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  await plzCoverDocumentCommand({
    document,
    sourceFile:
      document.languageId === 'go' && !document.fileName.endsWith('_test.go'),
    selectTarget: true,
  });
}
