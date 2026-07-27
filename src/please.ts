import {
  spawn,
  spawnSync,
  ChildProcessWithoutNullStreams,
} from 'child_process';
import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';

import { workspacePath } from './utils';
import { getBinPath } from './utils/pathUtils';
import { formatTerminalCommand } from './commands/terminalCommand';

export const TOOL_NAME = 'plz';
export const BUILD_FILENAME_REGEX = /^BUILD(\.plz|\.build)?$/;
export const SANDBOX_DIRECTORY = '/tmp/plz_sandbox';
export const DEBUG_OUT_DIRECTORY = 'plz-out/debug';

export function binPath(): string | undefined {
  if (process.env.PLZ_LOCAL) {
    return process.env.PLZ_LOCAL;
  }

  return getBinPath(TOOL_NAME);
}

// Utility that helps construct the Please command that we want to execute
// based on whether the binary is a locally built version or not.
export function cmd(args: string[] = []): { bin: string; args: string[] } {
  if (process.env.PLZ_LOCAL) {
    return {
      bin: binPath(),
      args: ['--noupdate', ...args],
    };
  }

  return { bin: binPath(), args };
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  token?: vscode.CancellationToken;
  trimSpace?: boolean;
}

// Creates `Please` Output channel.
export const outputChannel = vscode.window.createOutputChannel('Please');

// Runs a Please command in the active integrated terminal, creating one if needed.
export function runInTerminal(args: string[]): vscode.Terminal {
  const cwd = workspacePath();
  const terminal =
    vscode.window.activeTerminal ??
    vscode.window.createTerminal({
      name: 'Please',
      cwd,
    });

  terminal.show();
  terminal.sendText(formatTerminalCommand(TOOL_NAME, args), true);
  return terminal;
}

// Asynchronously runs a command where its progress is detailed on the `Please` Output channel.
export function detachCommand(args: string[]): ChildProcessWithoutNullStreams {
  const plzCmd = cmd(['--plain_output', '--verbosity=info', ...args]);

  const plz = spawn(plzCmd.bin, plzCmd.args, {
    cwd: workspacePath(),
    env: process.env,
  });

  outputChannel.show(true);
  outputChannel.appendLine(
    `> Running command: ${plzCmd.bin} ${plzCmd.args.join(' ')}`
  );

  plz.stdout.on('data', (data) => outputChannel.appendLine(data));
  plz.stderr.on('data', (data) => outputChannel.appendLine(data));

  plz.on('error', (err) =>
    outputChannel.appendLine(`> Command error: ${err.message}`)
  );
  plz.on('close', (code) =>
    outputChannel.appendLine(`> Command terminated with ${code}`)
  );

  return plz;
}

export async function runCommandAsync(
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  const plzCmd = cmd(args);

  return await new Promise<string>((resolve, reject) => {
    const plz = spawn(plzCmd.bin, plzCmd.args, {
      cwd: options.cwd ?? workspacePath(),
      env: options.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    let completed = false;

    const cancellation = options.token?.onCancellationRequested(() =>
      plz.kill()
    );
    const disposeCancellation = () => cancellation?.dispose();

    plz.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    plz.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    plz.on('error', (error) => {
      if (completed) {
        return;
      }
      completed = true;
      disposeCancellation();
      reject(error);
    });
    plz.on('close', (code, signal) => {
      if (completed) {
        return;
      }
      completed = true;
      disposeCancellation();

      if (options.token?.isCancellationRequested) {
        resolve('');
        return;
      }
      if (code !== 0) {
        const reason =
          stderr.trim() || `Command terminated with ${code || signal}`;
        reject(new Error(reason));
        return;
      }

      resolve(options.trimSpace === false ? stdout : stdout.trim());
    });
  });
}

// Runs a command with the intend of obtaining stdout. An error is throw if something fails.
export function runCommand(
  args: string[],
  trimSpace = true,
  env = process.env
): string {
  const plzCmd = cmd(args);

  const plz = spawnSync(plzCmd.bin, plzCmd.args, {
    cwd: workspacePath(),
    env,
  });

  if (plz.error) {
    throw plz.error;
  } else if (plz.status !== 0) {
    let errorMessage = `Command terminated with ${plz.status || plz.signal}`;

    if (plz.stderr.length !== 0) {
      errorMessage = `${plz.stderr.toString()}:\n${errorMessage}`;
    }

    throw new Error(errorMessage);
  }

  let output = plz.stdout.toString();
  if (trimSpace) {
    output = output.trim();
  }

  return output;
}

// Get version (i.e. `plz --version` => `Please version 16.1.0-beta.1` => `16.1.0-beta.1`).
export function version(): string {
  const versionOutput = runCommand(['--version']);

  const matches = versionOutput.match(/\d+\.\d+\.\d+\S*/);
  if (!matches) {
    throw new Error(`Could not parse Please version: ${versionOutput}`);
  }

  return matches[0];
}

// This exists to gatekeep functionality not available in lower versions.
export function ensureMinVersion(
  minVersion: string,
  explanation: string
): void {
  const currentVersion = version();

  if (semver.lt(currentVersion, minVersion)) {
    throw new Error(explanation);
  }
}

// Retrieves target(s) with specified file as a source.
export function inputTargets(filename: string): Array<string> {
  const repoPath = workspacePath();

  if (filename.startsWith(repoPath)) {
    filename = filename.substring(repoPath.length + 1);
  }

  const targetsOutput = runCommand(['query', 'whatinputs', filename]);
  const targets = targetsOutput
    .split('\n')
    .filter((target) => target.startsWith(':') || target.startsWith('//'));

  return targets;
}

// Checks whether a target is sandboxed.
export function isSandboxTarget(target: string): boolean {
  const isTrueValue = (value: string): boolean =>
    value.toLowerCase() === 'true';

  const targetTestValue = runCommand([
    'query',
    'print',
    target,
    '--field',
    'test',
  ]);

  const configSandboxField = isTrueValue(targetTestValue)
    ? 'sandbox.test'
    : 'sandbox.build';
  const targetSandboxField = isTrueValue(targetTestValue)
    ? 'test_sandbox'
    : 'sandbox';

  const targetSandboxValue = runCommand([
    'query',
    'print',
    target,
    '--field',
    targetSandboxField,
  ]);
  if (targetSandboxValue.length !== 0) {
    return isTrueValue(targetSandboxValue);
  }

  const configSandboxValue = runCommand([
    'query',
    'config',
    configSandboxField,
  ]);

  return isTrueValue(configSandboxValue);
}

// Creates a build label based on a BUILD filename and rule label.
export function buildLabel(
  repo: string,
  buildFilename: string,
  ruleLabel: string
): string {
  if (buildFilename.startsWith(repo)) {
    buildFilename = buildFilename.substring(repo.length + 1);
  }

  const pkg = path.dirname(buildFilename);

  return `//${pkg !== '.' ? pkg : ''}:${ruleLabel}`;
}

// Gets the package of a label.
export function labelPackage(label: string): string {
  let pkg = label;

  const colonPosition = pkg.indexOf(':');
  if (colonPosition !== -1) {
    pkg = pkg.substring(0, colonPosition);
  }

  if (pkg.startsWith(':')) {
    pkg = pkg.substring(':'.length);
  } else if (pkg.startsWith('//')) {
    pkg = pkg.substring('//'.length);
  }

  return pkg;
}
