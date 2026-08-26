import * as vscode from 'vscode';

import {
  retrieveCoverageTargets,
  retrieveInputFileCoverageTargets,
} from '../coverage/coverageTargets';
import { CoverageDecorations } from '../coverage/coverageDecorations';
import { coverageCommandArgs } from '../coverage/coverageInvocation';

export const SELECT_COVERAGE_TARGET_COMMAND =
  'plz.coverage.selectDocumentTarget';

/**
 * Runs aggregate coverage by default. `selectTarget` is reserved for the
 * explicit focused-target command so the primary CodeLens never interrupts
 * users with a target picker.
 */
export async function plzCoverDocumentCommand(
  args: {
    document: vscode.TextDocument;
    functionName?: string;
    sourceFile?: boolean;
    selectTarget?: boolean;
  },
  coverageDecorations?: CoverageDecorations
): Promise<void> {
  try {
    const {
      document: { fileName },
      functionName,
      sourceFile,
      selectTarget,
    } = args;

    let targets = sourceFile
      ? retrieveCoverageTargets(fileName)
      : retrieveInputFileCoverageTargets(fileName);
    if (selectTarget && targets.length > 1) {
      const target = await vscode.window.showQuickPick(targets, {
        placeHolder: 'Select the test target to cover',
      });
      if (!target) {
        return;
      }
      targets = [target];
    }

    await coverageDecorations?.expectNewResults(args.document.uri);
    await vscode.commands.executeCommand('plz', {
      command: 'cover',
      args: coverageCommandArgs(targets, functionName),
    });
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

export async function plzCoverActiveDocumentWithTargetCommand(
  coverageDecorations?: CoverageDecorations
): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  await plzCoverDocumentCommand(
    {
      document,
      sourceFile:
        document.languageId === 'go' && !document.fileName.endsWith('_test.go'),
      selectTarget: true,
    },
    coverageDecorations
  );
}
