import { ChildProcessWithoutNullStreams } qfrom 'child_process';

import * as vscode from 'vscode';
import * as plz from '../please';

import { argumentPrompt } from './utils';

export async function plzCommand(args: {
  command: string;
  args?: string[];
  runtime?: boolean;
}): Promise<ChildProcessWithoutNullStreams | undefined> {
  const { command, args: commandArgs = [], runtime = false } = args;

  let runtimeArgs: string | undefined;
  if (runtime) {
    runtimeArgs = await argumentPrompt({
      key: `key-plz-${command}-${commandArgs.join('-')}`,
    });
    // Terminate if `Escape` key was pressed.
    if (runtimeArgs === undefined) {
      return;
    }
  }

  let wholeCommand = [command, ...commandArgs];
  if (runtimeArgs) {
    wholeCommand = [...wholeCommand, '--', ...runtimeArgs.split(' ')];
  }

  return plz.detachCommand(wholeCommand);
  const useTerminal = vscode.workspace
    .getConfiguration('please')
    .get<boolean>('runInTerminal', false);

  if (useTerminal) {
    plz.runInTerminal(wholeCommand);
    return;
  }
  
  plz.detachCommand(wholeCommand);

}

