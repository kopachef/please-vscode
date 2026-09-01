import { execFile } from 'child_process';
import * as path from 'path';

export interface RuleCall {
  id: string;
  name: string;
  line: number;
}

/** Parses the top-level BUILD rule calls returned by rule_calls.py. */
export function parseRuleCalls(output: string): RuleCall[] {
  const value: unknown = JSON.parse(output);
  if (!Array.isArray(value)) {
    throw new Error('BUILD rule calls must be a list.');
  }

  return value.map((call, index) => {
    if (!isRuleCall(call)) {
      throw new Error(`BUILD rule call ${index + 1} is invalid.`);
    }
    return call;
  });
}

/** Reads top-level BUILD rule calls through the parser shared by CodeLenses. */
export async function getRuleCalls(
  python3Path: string,
  buildFileContents: string
): Promise<RuleCall[]> {
  const output = await new Promise<string>((resolve, reject) => {
    const proc = execFile(
      python3Path,
      [path.join(__dirname, '../../../scripts/rule_calls.py')],
      { encoding: 'utf-8' },
      (err, stdout, stderr) => {
        if (err || stderr) {
          reject(err || new Error(stderr));
          return;
        }
        resolve(stdout);
      }
    );
    proc.stdin.end(buildFileContents);
  });

  return parseRuleCalls(output);
}

/**
 * Maps a concrete target back to the most specific rule-call name prefix.
 * Custom build definitions commonly expand one named call into several
 * generated targets, so the longest matching name owns the target.
 */
export function ruleCallForTarget(
  target: string,
  ruleCalls: RuleCall[]
): RuleCall | undefined {
  const targetName = labelName(target);
  return ruleCalls
    .filter((call) => targetName.startsWith(call.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
}

/** Keeps targets whose originating BUILD calls use an allowed definition. */
export function targetsFromAllowedBuildDefs(
  targets: string[],
  ruleCallsByPackage: Map<string, RuleCall[]>,
  allowedBuildDefs: string[]
): string[] {
  const allowed = new Set(allowedBuildDefs);
  return targets.filter((target) => {
    const ruleCall = ruleCallForTarget(
      target,
      ruleCallsByPackage.get(labelPackage(target)) || []
    );
    return ruleCall !== undefined && allowed.has(ruleCall.id);
  });
}

export function labelPackage(label: string): string {
  const match = label.match(/^\/\/([^:]*):/);
  return match ? match[1] : '';
}

function labelName(label: string): string {
  const colon = label.lastIndexOf(':');
  return colon === -1 ? label : label.substring(colon + 1);
}

function isRuleCall(value: unknown): value is RuleCall {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.line === 'number'
  );
}

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
