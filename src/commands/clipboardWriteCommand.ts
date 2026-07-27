import * as vscode from 'vscode';

export const CLIPBOARD_WRITE_COMMAND = 'plz.clipboard.write';

export async function clipboardWriteCommand(args: {
  text: string;
}): Promise<void> {
  const clipboardWrite = vscode.env.clipboard.writeText(args.text);
  vscode.window.showInformationMessage(`Copied: ${args.text}`);
  await clipboardWrite;
}
