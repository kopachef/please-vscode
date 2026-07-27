import * as vscode from 'vscode';

import {
  documentTestInvocation,
  PlzTestCommand,
} from './documentTestInvocation';
import { retrieveInputFileTarget } from './utils';

export interface PlzDocumentTestCommandArgs {
  document: vscode.TextDocument;
  functionName?: string;
  sourceFile?: boolean;
  target?: string;
}

export type PlzDocumentTargetResolver = (
  filename: string
) => Promise<string | undefined>;

export async function plzDocumentTestCommand(
  command: PlzTestCommand,
  args: PlzDocumentTestCommandArgs,
  retrieveTarget: PlzDocumentTargetResolver = retrieveInputFileTarget
): Promise<void> {
  try {
    const {
      document: { fileName },
      functionName,
      target: requestedTarget,
    } = args;

    const target = requestedTarget ?? (await retrieveTarget(fileName));
    if (target === undefined) {
      return;
    }

    vscode.commands.executeCommand(
      'plz',
      documentTestInvocation(command, target, functionName)
    );
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}
