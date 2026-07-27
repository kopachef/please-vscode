import * as path from 'path';

export function debugTarget(target: unknown): string | undefined {
  if (target === undefined || target === null || target === '') {
    return undefined;
  }
  if (typeof target !== 'string') {
    throw new Error('The debug target must be a string.');
  }
  return target;
}

export function debugRuntimeArgs(runtimeArgs: unknown): string[] {
  if (runtimeArgs === undefined) {
    return [];
  }
  if (
    !Array.isArray(runtimeArgs) ||
    runtimeArgs.some((argument) => typeof argument !== 'string')
  ) {
    throw new Error('Debug runtimeArgs must be an array of strings.');
  }
  return runtimeArgs;
}

export function pleaseDebugBinArgs(
  baseArgs: string[],
  dlvPath: string,
  configuredBuildPath: string
): string[] {
  const buildPaths = [path.dirname(dlvPath)];

  for (const configuredPathLine of configuredBuildPath.split(/\r?\n/)) {
    for (const configuredPath of configuredPathLine.split(path.delimiter)) {
      const trimmedPath = configuredPath.trim();
      if (trimmedPath && !buildPaths.includes(trimmedPath)) {
        buildPaths.push(trimmedPath);
      }
    }
  }

  return [...baseArgs, '-o', `build.path:${buildPaths.join(path.delimiter)}`];
}
