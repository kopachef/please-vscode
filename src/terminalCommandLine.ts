import * as path from 'path';

function quoteShellArgument(argument: string): string {
  if (/[\s"'$&;<>()|*?~]/.test(argument)) {
    return `"${argument.replace(/"/g, '\\"')}"`;
  }
  return argument;
}

/**
 * Builds the command sent to an Integrated Terminal. Resolved executables
 * named `plz` are invoked through PATH so the terminal remains portable and
 * readable; explicitly named custom binaries retain their configured path.
 */
export function terminalCommandLine(bin: string, args: string[]): string {
  const executable = path.basename(bin || '') === 'plz' ? 'plz' : bin || 'plz';
  return [executable, ...args].map(quoteShellArgument).join(' ');
}
