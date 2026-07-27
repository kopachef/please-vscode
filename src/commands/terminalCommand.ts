const SAFE_SHELL_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

export function quoteShellArgument(argument: string): string {
  if (SAFE_SHELL_ARGUMENT.test(argument)) {
    return argument;
  }

  return `'${argument.replace(/'/g, `'\\''`)}'`;
}

export function formatTerminalCommand(
  executable: string,
  args: string[]
): string {
  return [executable, ...args].map(quoteShellArgument).join(' ');
}
