import * as plz from '../please';
import {
  coverageTargetCandidates,
  coverageTargetCandidatesDependingOn,
  coverageTargetDependencyQueryArgs,
  coverageTargetQueryArgs,
  parseQueryTargets,
} from './coverageTargetSelection';

/**
 * Finds coverable tests in the source file's package that directly depend on
 * its source target. Package-scoped discovery prevents a common library from
 * triggering unrelated tests across the repository.
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
