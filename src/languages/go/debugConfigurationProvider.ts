import { execFileSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

import { retrieveInputFileTarget } from '../../commands/utils';
import * as plz from '../../please';
import { getBinPathUsingConfig, workspacePath } from '../../utils';
import {
  getBinPathFromEnvVar,
  executableFileExists,
} from '../../utils/pathUtils';
import { LANGUAGE_DEBUG_IDS } from '../constants';

import {
  debugRuntimeArgs,
  debugTarget,
  pleaseDebugBinArgs,
} from './debugConfiguration';
import { debugStopOnEntryMode } from './debugBreakpoints';

export class GoDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  public provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    return [
      {
        name: 'Please Go',
        type: LANGUAGE_DEBUG_IDS.go,
        request: 'launch',
      },
    ];
  }

  public async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    token?: vscode.CancellationToken
  ): Promise<vscode.DebugConfiguration> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    try {
      debugConfiguration.type =
        debugConfiguration.type ?? LANGUAGE_DEBUG_IDS.go;
      debugConfiguration.request = debugConfiguration.request ?? 'launch';
      debugConfiguration.name = debugConfiguration.name ?? 'Please Go';

      const target =
        debugTarget(debugConfiguration.target) ??
        (await retrieveInputFileTarget(activeEditor.document.fileName));
      if (!target) {
        return;
      }
      debugConfiguration.target = target;
      debugConfiguration.runtimeArgs = debugRuntimeArgs(
        debugConfiguration.runtimeArgs
      );
      debugConfiguration.stopOnEntryMode = debugStopOnEntryMode(
        debugConfiguration.stopOnEntry,
        vscode.workspace
          .getConfiguration('plz', activeEditor.document.uri)
          .get('debug.stopOnEntry')
      );

      const repoRoot = workspacePath();
      const dlvPath = getBinPathUsingConfig('dlv');
      if (!dlvPath) {
        throw new Error(
          'Cannot find Delve (dlv) required for Go debugging. Install it with "go install github.com/go-delve/delve/cmd/dlv@latest" or add its directory to go.gopath or PATH.'
        );
      }
      const buildPaths = plz.runCommand(['query', 'config', 'build.path']);
      const toolchainPath = goToolchainPath(buildPaths);

      // This is a `delve` configuration setting to get path mappings right.
      debugConfiguration.substitutePath = [
        // Toolchain
        {
          from: toolchainPath,
          to: toolchainPath,
        },
        // Third party
        {
          from: path.join(
            repoRoot,
            plz.DEBUG_OUT_DIRECTORY,
            plz.labelPackage(target),
            'third_party'
          ),
          to: 'third_party',
        },
        // Sources
        { from: repoRoot + '/', to: '' },
      ];

      const plzCmd = plz.cmd();
      debugConfiguration.plzBinPath = plzCmd.bin;
      debugConfiguration.plzBinArgs = pleaseDebugBinArgs(
        plzCmd.args,
        dlvPath,
        buildPaths
      );

      debugConfiguration.repoRoot = repoRoot;
    } catch (e) {
      vscode.window.showErrorMessage(e.message);
      return;
    }

    // Get the `Debug Console` panel focused since the `plz debug` command will
    // be executed within the adapter itself.
    vscode.commands.executeCommand('workbench.debug.action.focusRepl');

    return debugConfiguration;
  }
}

export function goToolchainPath(buildPaths: string): string {
  const configFields = ['plugin.go.gotool', 'go.gotool'];
  // This is required since we load `GOROOT` onto `process.env` at the start
  // of the extension activation.
  const env = { ...process.env, GOROOT: '' };

  for (const configField of configFields) {
    const goTool = plz.runCommand(['query', 'config', configField]);

    // Check whether it is a target.
    if (goTool.startsWith(':') || goTool.startsWith('//')) {
      try {
        return plz.runCommand(
          ['run', goTool, '--', 'env', 'GOROOT'],
          true,
          env
        );
      } catch (error: unknown) {
        console.warn(`Failed to run ${configField} ${goTool} to get GOROOT`, {
          error,
        });
      }
    }

    // Check if an absolute path
    if (executableFileExists(goTool)) {
      try {
        return execFileSync(goTool, ['env', 'GOROOT'], { env })
          .toString()
          .trim();
      } catch (error: unknown) {
        console.warn(`Failed to run ${configField} ${goTool} to get GOROOT`, {
          error,
        });
      }
    }

    // Check if the binary can be resolved on the Please (not system) path.
    // The build.path config field is actually a list, so we need to iterate over each entry.
    for (const buildPath of buildPaths.split('\n')) {
      const goToolPath = getBinPathFromEnvVar(goTool, buildPath, false);

      if (goToolPath) {
        try {
          return execFileSync(goToolPath, ['env', 'GOROOT'], { env })
            .toString()
            .trim();
        } catch (error: unknown) {
          console.warn(
            `Failed to run ${configField} ${goTool} resolved as ${goToolPath} to get GOROOT`,
            { error }
          );
        }
      }
    }
  }

  throw new Error('Unable to find the Go toolchain for this project.');
}
