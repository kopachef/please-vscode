import * as vscode from 'vscode';

import * as plz from '../please';
import { queryPlease } from '../pleaseProcess';
import {
  coverageTargetCandidates,
  coverageTargetCandidatesDependingOn,
  coverageTargetDependencyQueryArgs,
  coverageTargetQueryArgs,
  coverageTargetQueryBatches,
  parseQueryTargets,
  QueryTarget,
} from './coverageTargetSelection';

/**
 * Finds coverable tests in the source file's package that directly depend on
 * its source target. This is the fast path used by the primary CodeLens.
 */
export function retrieveCoverageTargets(filename: string): string[] {
  const sourceTargets = plz.inputTargets(filename);
  if (sourceTargets.length === 0) {
    throw new Error(
      `A source target couldn't be found for coverage: ${filename}`
    );
  }

  const packageTarget = plz.buildLabel(filename, 'all');
  const queryOutput = plz.runCommand(
    coverageTargetDependencyQueryArgs([packageTarget])
  );
  const candidates = coverageTargetCandidatesDependingOn(
    parseQueryTargets(queryOutput),
    sourceTargets
  );

  if (candidates.length === 0) {
    throw new Error(
      `No coverable test targets in ${packageTarget} depend directly on: ${sourceTargets.join(
        ', '
      )}`
    );
  }

  return candidates;
}

/**
 * Finds direct dependent tests across the workspace for the explicit target
 * picker. Queries stream asynchronously and metadata is inspected in batches.
 */
export async function retrieveWorkspaceCoverageTargets(
  filename: string,
  token: vscode.CancellationToken
): Promise<string[]> {
  const sourceTargets = plz.inputTargets(filename);
  if (sourceTargets.length === 0) {
    throw new Error(
      `A source target couldn't be found for coverage: ${filename}`
    );
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filename)
  );
  if (!workspaceFolder) {
    throw new Error(`No workspace contains the source file: ${filename}`);
  }
  const cwd = workspaceFolder.uri.fsPath;
  const reverseDepsOutput = await queryPlease(
    ['query', 'revdeps', ...sourceTargets, '--level=1'],
    cwd,
    token
  );
  if (token.isCancellationRequested) {
    return [];
  }
  const reverseDeps = [...new Set(parseTargetLabels(reverseDepsOutput))].sort();
  if (reverseDeps.length === 0) {
    throw new Error(`No tests depend directly on: ${sourceTargets.join(', ')}`);
  }

  const queryTargets = new Map<string, QueryTarget>();
  for (const queryArgs of coverageTargetQueryBatches(reverseDeps)) {
    if (token.isCancellationRequested) {
      return [];
    }
    const queryOutput = await queryPlease(queryArgs, cwd, token);
    if (token.isCancellationRequested) {
      return [];
    }
    for (const [label, target] of parseQueryTargets(queryOutput)) {
      queryTargets.set(label, target);
    }
  }

  const candidates = coverageTargetCandidates(queryTargets);
  if (candidates.length === 0) {
    throw new Error(
      `No coverable test targets depend directly on: ${sourceTargets.join(
        ', '
      )}`
    );
  }
  return candidates;
}

/** Finds every coverable test target that directly contains a test file. */
export function retrieveInputFileCoverageTargets(filename: string): string[] {
  const inputTargets = plz.inputTargets(filename);
  if (inputTargets.length === 0) {
    throw new Error(
      `A target couldn't be found where the file is a source: ${filename}`
    );
  }

  const queryOutput = plz.runCommand(coverageTargetQueryArgs(inputTargets));
  const candidates = coverageTargetCandidates(parseQueryTargets(queryOutput));
  if (candidates.length === 0) {
    throw new Error(`No coverable test targets contain the file: ${filename}`);
  }

  return candidates;
}

function parseTargetLabels(output: string): string[] {
  return output
    .split('\n')
    .filter((label) => label.startsWith('//') || label.startsWith(':'));
}
