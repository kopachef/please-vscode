import * as vscode from 'vscode';

import * as plz from '../please';
import {
  parseQueryTargets,
  sourceTestTargetCandidates,
} from './coverageTargetSelection';

export async function retrieveCoverageTarget(
  filename: string
): Promise<string | undefined> {
  return retrieveSourceTestTarget(filename, true);
}

export async function retrieveTestTarget(
  filename: string
): Promise<string | undefined> {
  return retrieveSourceTestTarget(filename, false);
}

async function retrieveSourceTestTarget(
  filename: string,
  coverageOnly: boolean
): Promise<string | undefined> {
  const sourceTargets = plz.inputTargets(filename);
  if (sourceTargets.length === 0) {
    throw new Error(
      `A source target couldn't be found for ${
        coverageOnly ? 'coverage' : 'testing'
      }: ${filename}`
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

  const queryOutput = plz.runCommand([
    'query',
    'print',
    ...reverseDeps,
    '--json',
  ]);
  const candidates = sourceTestTargetCandidates(
    sourceTargets,
    parseQueryTargets(queryOutput),
    coverageOnly
  );

  switch (candidates.length) {
    case 0:
      throw new Error(
        `No ${
          coverageOnly ? 'coverable ' : ''
        }test targets depend directly on: ${sourceTargets.join(', ')}`
      );
    case 1:
      return candidates[0];
    default:
      return await vscode.window.showQuickPick(candidates, {
        placeHolder: `Select the test target to ${
          coverageOnly ? 'cover' : 'run'
        }`,
      });
  }
}
