import * as vscode from 'vscode';

import {
  retrieveCoverageTargets,
  retrieveInputFileCoverageTargets,
} from '../coverage/coverageTargets';
import { CoverageDecorations } from '../coverage/coverageDecorations';
import { coverageCommandArgs } from '../coverage/coverageInvocation';
import * as plz from '../please';

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
  const useTerminal = vscode.workspace
    .getConfiguration('please')
    .get<boolean>('runInTerminal', false);
  if (!useTerminal) {
    plz.outputChannel.show(true);
  }
  plz.outputChannel.appendLine(
    `> Discovering coverage targets for ${args.document.fileName}`
  );

  // Yield once so the Output panel can render before synchronous Please
  // metadata queries begin.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  try {
    const {
      document: { fileName },
      functionName,
      sourceFile,
      selectTarget,
    } = args;
    const allowedBuildDefs = vscode.workspace
      .getConfiguration('please.coverage')
      .get<string[]>('allowedBuildDefs', [])
      .map((buildDef) => buildDef.trim())
      .filter((buildDef) => buildDef.length > 0);

    let targets = sourceFile
      ? await retrieveCoverageTargets(fileName, allowedBuildDefs)
      : await retrieveInputFileCoverageTargets(fileName, allowedBuildDefs);
    if (selectTarget && targets.length > 1) {
      const target = await vscode.window.showQuickPick(targets, {
        placeHolder: 'Select the test target to cover',
      });
      if (!target) {
        return;
      }
      targets = [target];
    }

    plz.outputChannel.appendLine(`> Coverage targets: ${targets.join(', ')}`);
    await coverageDecorations?.expectNewResults(args.document.uri);
    await vscode.commands.executeCommand('plz', {
      command: 'cover',
      args: coverageCommandArgs(targets, functionName),
    });
  } catch (e) {
    plz.outputChannel.show(true);
    plz.outputChannel.appendLine(
      `> Coverage command failed before starting:\n${e.message}`
    );
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
