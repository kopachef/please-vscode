import { codeLensActionTitle } from './codeLensActionTitle';

export const TEST_FILE_ACTIONS = ['test', 'debug'] as const;

export type TestFileActionKind = typeof TEST_FILE_ACTIONS[number];

export interface TestFileTarget {
  label: string;
  name: string;
}

export interface TestFileActionLayout {
  actions: TestFileActionKind[];
  selectedAction: TestFileActionKind | undefined;
  targets: TestFileTarget[];
}

export function testFileActionLayout(
  targets: TestFileTarget[],
  requestedAction?: TestFileActionKind
): TestFileActionLayout {
  const actions = targets.length > 0 ? [...TEST_FILE_ACTIONS] : [];
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

export function testFileActionTitle(
  action: TestFileActionKind,
  selected: boolean
): string {
  return codeLensActionTitle(action, selected, TEST_FILE_ACTIONS);
}

export function discoverTestFileTargets(
  inputTargetsOutput: string,
  testCompletionsOutput: string,
  packageFragment: string
): TestFileTarget[] {
  const inputTargets = new Set(
    parseTargetLabels(inputTargetsOutput, packageFragment)
  );

  return parseTargetLabels(testCompletionsOutput, packageFragment)
    .filter((label) => inputTargets.has(label))
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .map((label) => ({
      label,
      name: label.substring(label.lastIndexOf(':') + 1),
    }))
    .filter(({ name }) => name.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseTargetLabels(output: string, packageFragment: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(':') || line.startsWith('//'))
    .map((label) =>
      label.startsWith(':')
        ? `${packageFragment}${label.substring(':'.length)}`
        : label
    );
}
