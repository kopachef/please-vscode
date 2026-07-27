import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  RevealOutputChannelOn,
} from 'vscode-languageclient/node';

import { buildFileOutlineSymbols } from './languages/plz/outlineSymbols';
import * as plz from './please';

export function startLanguageClient(): vscode.Disposable {
  vscode.languages.setLanguageConfiguration('plz', {
    onEnterRules: [
      {
        beforeText: /^\s*(?:def|for|if|elif|else).*?:\s*$/,
        action: { indentAction: vscode.IndentAction.Indent },
      },
    ],
  });

  const serverRunCmd = plz.cmd(['tool', 'langserver']);
  const serverDebugCmd = plz.cmd(['tool', 'langserver', '-v', '4']);

  const client = new LanguageClient(
    'plz',
    'Please Language Server',
    {
      run: {
        command: serverRunCmd.bin,
        args: serverRunCmd.args,
      },
      debug: {
        command: serverDebugCmd.bin,
        args: serverDebugCmd.args,
      },
    },
    {
      documentSelector: [{ scheme: 'file', language: 'plz' }],
      middleware: {
        provideDocumentSymbols: async (document, token, next) => {
          const symbols = await next(document, token);
          return semanticBuildFileSymbols(document, symbols);
        },
      },
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('BUILD*'),
      },
      revealOutputChannelOn: RevealOutputChannelOn.Never,
    }
  );

  return client.start();
}

function semanticBuildFileSymbols(
  document: vscode.TextDocument,
  symbols:
    | vscode.SymbolInformation[]
    | vscode.DocumentSymbol[]
    | null
    | undefined
): vscode.SymbolInformation[] | vscode.DocumentSymbol[] | undefined {
  if (
    !symbols ||
    !plz.BUILD_FILENAME_REGEX.test(path.basename(document.fileName)) ||
    !areSymbolInformation(symbols)
  ) {
    return symbols ?? undefined;
  }

  const semanticSymbols = buildFileOutlineSymbols(
    symbols.map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      range: symbol.location.range,
    })),
    {
      function: vscode.SymbolKind.Function,
      key: vscode.SymbolKind.Key,
      string: vscode.SymbolKind.String,
      target: vscode.SymbolKind.Object,
    }
  );

  if (semanticSymbols.length === 0) {
    return symbols;
  }

  return semanticSymbols.map(
    (symbol) =>
      new vscode.DocumentSymbol(
        symbol.name,
        symbol.detail,
        symbol.kind,
        asVscodeRange(symbol.range),
        asVscodeRange(symbol.selectionRange)
      )
  );
}

function areSymbolInformation(
  symbols: vscode.SymbolInformation[] | vscode.DocumentSymbol[]
): symbols is vscode.SymbolInformation[] {
  return (
    symbols as (vscode.SymbolInformation | vscode.DocumentSymbol)[]
  ).every((symbol) => 'location' in symbol);
}

function asVscodeRange(range: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  );
}
