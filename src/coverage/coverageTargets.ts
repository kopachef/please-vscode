import * as plz from '../please';
import {
  coverageTargetCandidates,
  parseQueryTargets,
} from './coverageTargetSelection';

/**
 * Finds every directly dependent test target that can contribute coverage for
 * a source file. Returning all candidates makes the default coverage result an
 * aggregate rather than an arbitrary target-specific view.
 */
export function retrieveCoverageTargets(filename: string): string[] {
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

  const queryOutput = plz.runCommand([
    'query',
    'print',
    ...reverseDeps,
    '--json',
  ]);
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
export function retrieveInputFileCoverageTargets(filename: string): string[] {
  const inputTargets = plz.inputTargets(filename);
  if (inputTargets.length === 0) {
    throw new Error(
      `A target couldn't be found where the file is a source: ${filename}`
    );
  }

  const queryOutput = plz.runCommand([
    'query',
    'print',
    ...inputTargets,
    '--json',
  ]);
  const candidates = coverageTargetCandidates(parseQueryTargets(queryOutput));
  if (candidates.length === 0) {
    throw new Error(`No coverable test targets contain the file: ${filename}`);
  }

  return candidates;
}
