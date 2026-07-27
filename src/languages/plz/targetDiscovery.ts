export interface RuleCall {
  id: string;
  name: string;
  line: number;
}

export interface TargetCapabilities {
  label: string;
  name: string;
  canBuild: boolean;
  canTest: boolean;
  canRun: boolean;
}

export interface RuleTargets {
  ruleCall: RuleCall;
  targets: TargetCapabilities[];
}

export function mergeCompletionTargets(
  buildOutput: string,
  testOutput: string,
  runOutput: string
): TargetCapabilities[] {
  const buildTargets = new Set(parseCompletionTargets(buildOutput));
  const testTargets = new Set(parseCompletionTargets(testOutput));
  const runTargets = new Set(parseCompletionTargets(runOutput));
  const labels = new Set([...buildTargets, ...testTargets, ...runTargets]);

  return [...labels]
    .map((label) => ({
      label,
      name: targetName(label),
      canBuild: buildTargets.has(label),
      canTest: testTargets.has(label),
      canRun: runTargets.has(label),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function mapTargetsToRuleCalls(
  ruleCalls: RuleCall[],
  targets: TargetCapabilities[]
): RuleTargets[] {
  const ruleTargets = ruleCalls.map((ruleCall) => ({
    ruleCall,
    targets: [] as TargetCapabilities[],
  }));
  const longestNamesFirst = [...ruleTargets].sort(
    (left, right) => right.ruleCall.name.length - left.ruleCall.name.length
  );

  for (const target of targets) {
    const owner = longestNamesFirst.find(({ ruleCall }) =>
      target.name.startsWith(ruleCall.name)
    );
    owner?.targets.push(target);
  }

  return ruleTargets;
}

function parseCompletionTargets(output: string): string[] {
  return output
    .split('\n')
    .map((target) => target.trim())
    .filter((target) => target.includes(':'));
}

function targetName(label: string): string {
  return label.substring(label.lastIndexOf(':') + 1);
}
