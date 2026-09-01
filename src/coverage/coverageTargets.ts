import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import * as plz from '../please';
import { getBinPathUsingConfig } from '../utils';
import {
  getRuleCalls,
  labelPackage,
  RuleCall,
  targetsFromAllowedBuildDefs,
} from '../languages/plz/ruleCalls';
import {
  coverageTargetCandidates,
  coverageTargetQueryArgs,
  parseQueryTargets,
} from './coverageTargetSelection';

const BUILD_FILENAMES = ['BUILD', 'BUILD.plz', 'BUILD.build'];
const BUILD_PARSER_CONCURRENCY = 8;
const ruleCallCache = new Map<
  string,
  { contents: string; ruleCalls: RuleCall[] }
>();

/**
 * Finds every directly dependent test target that can contribute coverage for
 * a source file. Returning all candidates makes the default coverage result an
 * aggregate rather than an arbitrary target-specific view.
 */
export async function retrieveCoverageTargets(
  filename: string,
  allowedBuildDefs: string[] = []
): Promise<string[]> {
  const sourceTargets = plz.inputTargets(filename);
  if (sourceTargets.length === 0) {
    throw new Error(
      `A source target couldn't be found for coverage: ${filename}`
    );
  }

  const reverseDepsOutput = plz.runCommand([
    'query',
    'revdeps',
    ...sourceTargets,
    '--level=1',
  ]);
  const reverseDeps = reverseDepsOutput
    .split('\n')
    .filter((label) => label.startsWith('//') || label.startsWith(':'));
  if (reverseDeps.length === 0) {
    throw new Error(`No tests depend directly on: ${sourceTargets.join(', ')}`);
  }

  const allowedReverseDeps = await filterByAllowedBuildDefs(
    filename,
    reverseDeps,
    allowedBuildDefs
  );
  if (allowedReverseDeps.length === 0) {
    throw new Error(
      `No coverage targets use the allowed build definitions: ${allowedBuildDefs.join(
        ', '
      )}`
    );
  }

  const queryOutput = plz.runCommand(
    coverageTargetQueryArgs(allowedReverseDeps)
  );
  const candidates = coverageTargetCandidates(parseQueryTargets(queryOutput));

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
export async function retrieveInputFileCoverageTargets(
  filename: string,
  allowedBuildDefs: string[] = []
): Promise<string[]> {
  const inputTargets = plz.inputTargets(filename);
  if (inputTargets.length === 0) {
    throw new Error(
      `A target couldn't be found where the file is a source: ${filename}`
    );
  }

  const allowedInputTargets = await filterByAllowedBuildDefs(
    filename,
    inputTargets,
    allowedBuildDefs
  );
  if (allowedInputTargets.length === 0) {
    throw new Error(
      `No coverage targets use the allowed build definitions: ${allowedBuildDefs.join(
        ', '
      )}`
    );
  }

  const queryOutput = plz.runCommand(
    coverageTargetQueryArgs(allowedInputTargets)
  );
  const candidates = coverageTargetCandidates(parseQueryTargets(queryOutput));
  if (candidates.length === 0) {
    throw new Error(`No coverable test targets contain the file: ${filename}`);
  }

  return candidates;
}

async function filterByAllowedBuildDefs(
  filename: string,
  targets: string[],
  allowedBuildDefs: string[]
): Promise<string[]> {
  if (allowedBuildDefs.length === 0) {
    return targets;
  }

  const python3 = getBinPathUsingConfig('python3');
  if (!python3) {
    throw new Error(
      'Cannot find python3 required to filter coverage targets by BUILD definition.'
    );
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(filename)
  );
  if (!workspaceFolder) {
    throw new Error(`No workspace contains the coverage file: ${filename}`);
  }

  const packages = [...new Set(targets.map(labelPackage))];
  const entries = await mapWithConcurrency(
    packages,
    BUILD_PARSER_CONCURRENCY,
    async (packageName): Promise<[string, RuleCall[]]> => [
      packageName,
      await readRuleCalls(workspaceFolder.uri.fsPath, packageName, python3),
    ]
  );

  return targetsFromAllowedBuildDefs(
    targets,
    new Map(entries),
    allowedBuildDefs
  );
}

async function readRuleCalls(
  workspaceRoot: string,
  packageName: string,
  python3: string
): Promise<RuleCall[]> {
  for (const buildFilename of BUILD_FILENAMES) {
    const filename = path.join(workspaceRoot, packageName, buildFilename);
    let contents: string;
    try {
      contents = await fs.readFile(filename, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Try the next supported BUILD filename.
        continue;
      }
      throw error;
    }

    const cached = ruleCallCache.get(filename);
    if (cached && cached.contents === contents) {
      return cached.ruleCalls;
    }

    const ruleCalls = await getRuleCalls(python3, contents);
    ruleCallCache.set(filename, { contents, ruleCalls });
    return ruleCalls;
  }

  throw new Error(`Cannot find a BUILD file for package //${packageName}`);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
