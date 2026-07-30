import { spawn } from 'child_process';
import * as vscode from 'vscode';

import * as plz from '../please';
import { killProcessTree } from '../utils/processUtils';

export interface PleaseProcessResult {
  readonly cancelled: boolean;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}

export async function queryPlease(
  args: string[],
  cwd: string,
  token: vscode.CancellationToken
): Promise<string> {
  let stdout = '';
  const result = await executePlease(args, cwd, token, (output, isError) => {
    if (!isError) {
      stdout += output;
    }
  });

  if (result.cancelled) {
    return '';
  }
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() ||
        `Please terminated with ${result.exitCode ?? result.signal}`
    );
  }
  return stdout.trim();
}

export async function executePlease(
  args: string[],
  cwd: string,
  token: vscode.CancellationToken,
  onOutput: (output: string, isError: boolean) => void
): Promise<PleaseProcessResult> {
  if (token.isCancellationRequested) {
    return {
      cancelled: true,
      exitCode: null,
      signal: null,
      stderr: '',
    };
  }

  const command = plz.cmd(['--plain_output', ...args]);
  const child = spawn(command.bin, command.args, {
    cwd,
    env: process.env,
  });
  let cancelled = false;
  let stderr = '';

  const cancellation = token.onCancellationRequested(() => {
    cancelled = true;
    void killProcessTree(child, (message) =>
      plz.outputChannel.appendLine(message)
    );
  });

  return await new Promise<PleaseProcessResult>((resolve, reject) => {
    let completed = false;
    const finish = (result: PleaseProcessResult) => {
      if (completed) {
        return;
      }
      completed = true;
      cancellation.dispose();
      resolve(result);
    };

    child.stdout.on('data', (data) => onOutput(data.toString(), false));
    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      onOutput(output, true);
    });
    child.on('error', (error) => {
      if (completed) {
        return;
      }
      completed = true;
      cancellation.dispose();
      reject(error);
    });
    child.on('close', (exitCode, signal) =>
      finish({
        cancelled,
        exitCode,
        signal,
        stderr,
      })
    );
  });
}
