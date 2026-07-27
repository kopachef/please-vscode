import { TargetCapabilities } from './targetDiscovery';
import { codeLensActionTitle } from '../codeLensActionTitle';

export const BUILD_FILE_ACTIONS = ['build', 'test', 'run', 'copy'] as const;

export type BuildFileActionKind = typeof BUILD_FILE_ACTIONS[number];

export interface BuildFileActionLayout {
  actions: BuildFileActionKind[];
  selectedAction: BuildFileActionKind | undefined;
  targets: TargetCapabilities[];
}

export function buildFileActionLayout(
  targets: TargetCapabilities[],
  requestedAction?: BuildFileActionKind
): BuildFileActionLayout {
  const actions = targets.length > 0 ? [...BUILD_FILE_ACTIONS] : [];

  const selectedAction =
    requestedAction && actions.includes(requestedAction)
      ? requestedAction
      : actions[0];

  return {
    actions,
    selectedAction,
    targets,
  };
}

export function buildFileActionTitle(
  action: BuildFileActionKind,
  selected: boolean
): string {
  return codeLensActionTitle(action, selected, BUILD_FILE_ACTIONS);
}
