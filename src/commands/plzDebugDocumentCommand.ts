import * as vscode from 'vscode';

import { Language } from '../languages/constants';
import { languageTargetDebuggers } from '../languages/debug';

import { retrieveInputFileTarget } from './utils';

export async function plzDebugDocumentCommand(args: {
  document: vscode.TextDocument;
  functionName?: string;
  language: Language;
  target?: string;
}): Promise<void> {
  try {
    if (vscode.debug.activeDebugSession) {
      throw new Error('Debug session has already been initialised');
    }

    const {
      document: { fileName },
      functionName,
      language,
      target: passedTarget,
    } = args;

    const debugTarget = languageTargetDebuggers[language];
    if (!debugTarget) {
      throw new Error(
        `The following language has no debugging support yet: ${language}.`
      );
    }

    const target = passedTarget ?? await retrieveInputFileTarget(fileName);
    if (target === undefined) {
      return;
    }

    debugTarget(target, functionName ? [functionName] : []);
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}
