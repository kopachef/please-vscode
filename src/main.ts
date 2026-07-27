import { execFileSync } from 'child_process';
import * as vscode from 'vscode';

import {
  CLIPBOARD_WRITE_COMMAND,
  clipboardWriteCommand,
  plzCommand,
  plzCoverDocumentCommand,
  plzDebugDocumentCommand,
  plzDebugTargetCommand,
  plzTestDocumentCommand,
} from './commands';
import {
  CoverageDecorations,
  registerCoverageCommands,
} from './coverage/coverageDecorations';
import { startLanguageClient } from './languageClient';
import { LANGUAGE_DEBUG_IDS } from './languages/constants';
import { GoTestCodeLensProvider } from './languages/go/codeLensProvider';
import { GoDebugConfigurationProvider } from './languages/go/debugConfigurationProvider';
import {
  BuildFileCodeLensProvider,
  registerBuildFileCodeLensCommands,
} from './languages/plz/codeLensProvider';
import { PythonDebugAdapterDescriptorProvider } from './languages/python/debugAdapterDescriptorFactory';
import { PythonTestCodeLensProvider } from './languages/python/codeLensProvider';
import { PythonDebugConfigurationProvider } from './languages/python/debugConfigurationProvider';
import * as plz from './please';
import { getBinPath } from './utils/pathUtils';

// This gets activated only if the workspace contains a `.plzconfig` file.
// Check the `activationEvents` field in the `package.json` file.
export async function activate(context: vscode.ExtensionContext) {
  // Ensure that Please is installed
  if (!plz.binPath()) {
    vscode.window.showErrorMessage(
      'Cannot find Please. Get it from https://github.com/thought-machine/please.'
    );
    return;
  }

  // Start language client
  context.subscriptions.push(startLanguageClient());

  // Load Go env variables
  loadGoEnv();

  // Show line coverage from the results written by `plz cover`.
  const coverageDecorations = new CoverageDecorations();
  context.subscriptions.push(
    coverageDecorations,
    registerCoverageCommands(coverageDecorations)
  );

  // Setup Go debugging
  try {
    plz.ensureMinVersion(
      '16.17.0',
      'This plugin version requires at least Please 16.17.0 for Go debugging.'
    );

    const goBinPath = getBinPath('go');
    if (!goBinPath) {
      throw new Error('Cannot find Go required for debugging support.');
    }

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider(
        LANGUAGE_DEBUG_IDS.go,
        new GoDebugConfigurationProvider()
      )
    );
    // Setup Go codelenses
    const goTestCodeLensProvider = new GoTestCodeLensProvider(
      coverageDecorations
    );
    context.subscriptions.push(
      goTestCodeLensProvider,
      goTestCodeLensProvider.registerCommands(),
      vscode.languages.registerCodeLensProvider(
        { language: 'go', scheme: 'file' },
        goTestCodeLensProvider
      )
    );
  } catch (e) {
    vscode.window.showWarningMessage(e.message);
  }

  // Set up clipboard writing functionality
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CLIPBOARD_WRITE_COMMAND,
      clipboardWriteCommand
    )
  );

  // Setup Python debugging
  try {
    plz.ensureMinVersion(
      '16.17.0',
      'The minimum Please version for Python debugging is 16.17.0'
    );

    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider(
        LANGUAGE_DEBUG_IDS.python,
        new PythonDebugConfigurationProvider()
      )
    );
    context.subscriptions.push(
      vscode.debug.registerDebugAdapterDescriptorFactory(
        LANGUAGE_DEBUG_IDS.python,
        new PythonDebugAdapterDescriptorProvider()
      )
    );
    // Setup Python codelenses
    const pythonTestCodeLensProvider = new PythonTestCodeLensProvider(
      coverageDecorations
    );
    context.subscriptions.push(
      pythonTestCodeLensProvider,
      pythonTestCodeLensProvider.registerCommands(),
      vscode.languages.registerCodeLensProvider(
        { language: 'python', scheme: 'file' },
        pythonTestCodeLensProvider
      )
    );
  } catch (e) {
    vscode.window.showWarningMessage(e.message);
  }

  // Setup plz-related commands
  context.subscriptions.push(
    vscode.commands.registerCommand('plz.test.document', plzTestDocumentCommand)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'plz.cover.document',
      plzCoverDocumentCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'plz.debug.document',
      plzDebugDocumentCommand
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('plz.debug.target', plzDebugTargetCommand)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('plz', plzCommand)
  );
  // Set up BUILD file codelenses
  const buildFileCodeLensProvider = new BuildFileCodeLensProvider();
  context.subscriptions.push(
    buildFileCodeLensProvider,
    registerBuildFileCodeLensCommands(buildFileCodeLensProvider),
    vscode.languages.registerCodeLensProvider(
      { language: 'plz', scheme: 'file' },
      buildFileCodeLensProvider
    )
  );
}

// Loads Go-related environment variables onto `process.env`.
export function loadGoEnv(): void {
  try {
    const output = execFileSync(
      getBinPath('go'),
      ['env', '-json', 'GOPATH', 'GOROOT', 'GOBIN'],
      { encoding: 'utf-8' }
    );

    const envOutput = JSON.parse(output.toString());
    for (const envName in envOutput) {
      if (!process.env[envName] && envOutput[envName]?.trim()) {
        process.env[envName] = envOutput[envName].trim();
      }
    }
  } catch (e) {
    throw new Error(
      `Failed to run Go to load related environment variables:\n${e.message}`
    );
  }
}
