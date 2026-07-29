import { promises as fs } from 'fs';
import * as vscode from 'vscode';

import * as plz from '../please';
import {
  coverageAttributionMarkdown,
  coverageLineAttribution,
} from './coverageAttribution';
import {
  COVERED_LINE,
  coverageFilename,
  coverageLineNumbers,
  CoverageResults,
  coverageSummary,
  parseCoverageResults,
  UNCOVERED_LINE,
} from './coverageResults';

export const CLEAR_COVERAGE_COMMAND = 'plz.coverage.clear';
export const COVERAGE_VISIBLE_CONTEXT = 'plz.coverageVisible';

const COVERAGE_RESULTS_GLOB = '**/plz-out/log/coverage.json';
const COVERAGE_RESULTS_LOAD_DELAY_MS = 200;

interface DocumentCoverage {
  filename: string;
  lineStatuses: string;
  results: CoverageResults;
}

/**
 * Watches Please coverage results and projects them into editor decorations,
 * status-bar summaries, and CodeLens refresh events.
 */
export class CoverageDecorations implements vscode.Disposable {
  private active = true;
  private readonly coverageChanged = new vscode.EventEmitter<void>();
  private readonly resultsByWorkspace = new Map<string, CoverageResults>();
  private readonly pendingLoads = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly coveredDecoration =
    vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(46, 160, 67, 0.10)',
      overviewRulerColor: 'rgba(46, 160, 67, 0.85)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  private readonly uncoveredDecoration =
    vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(248, 81, 73, 0.10)',
      overviewRulerColor: 'rgba(248, 81, 73, 0.85)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  private readonly statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10
  );

  public readonly onDidChangeCoverage = this.coverageChanged.event;

  constructor() {
    this.statusBar.command = CLEAR_COVERAGE_COMMAND;
    void this.loadExistingResults();

    const watcher = vscode.workspace.createFileSystemWatcher(
      COVERAGE_RESULTS_GLOB
    );
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.scheduleLoad(uri)),
      watcher.onDidChange((uri) => this.scheduleLoad(uri)),
      watcher.onDidDelete((uri) => this.removeResults(uri)),
      vscode.window.onDidChangeVisibleTextEditors((editors) =>
        this.applyToEditors(editors)
      ),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateStatusBar()),
      this.coverageChanged,
      this.coveredDecoration,
      this.uncoveredDecoration,
      this.statusBar
    );
  }

  public clear(): void {
    this.resultsByWorkspace.clear();
    this.refreshCoverageUi();
  }

  /** Shows the extension's custom decorations for CodeLens coverage runs. */
  public activate(): void {
    if (!this.active) {
      this.active = true;
      this.refreshCoverageUi();
    }
  }

  /** Hides custom decorations while VS Code presents native test coverage. */
  public deactivate(): void {
    if (this.active) {
      this.active = false;
      this.refreshCoverageUi();
    }
  }

  public hasCoverageForDocument(document: vscode.TextDocument): boolean {
    return this.active && this.coverageForDocument(document) !== undefined;
  }

  public dispose(): void {
    for (const timeout of this.pendingLoads.values()) {
      clearTimeout(timeout);
    }
    this.pendingLoads.clear();
    this.resultsByWorkspace.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async loadExistingResults(): Promise<void> {
    try {
      const resultUris = await vscode.workspace.findFiles(
        COVERAGE_RESULTS_GLOB
      );
      for (const uri of resultUris) {
        this.scheduleLoad(uri);
      }
    } catch (e) {
      plz.outputChannel.appendLine(
        `Error finding existing Please coverage results: ${e.message}`
      );
    }
  }

  private scheduleLoad(uri: vscode.Uri): void {
    // Please may update coverage.json through several writes; debounce them so
    // the extension reads only the completed result.
    const key = uri.toString();
    const pending = this.pendingLoads.get(key);
    if (pending) {
      clearTimeout(pending);
    }

    this.pendingLoads.set(
      key,
      setTimeout(() => {
        this.pendingLoads.delete(key);
        this.load(uri);
      }, COVERAGE_RESULTS_LOAD_DELAY_MS)
    );
  }

  private async load(uri: vscode.Uri): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }

    try {
      const contents = await fs.readFile(uri.fsPath, 'utf8');
      const results = parseCoverageResults(contents);
      this.resultsByWorkspace.set(workspaceFolder.uri.fsPath, results);
      this.refreshCoverageUi();
    } catch (e) {
      plz.outputChannel.appendLine(
        `Error loading coverage results from '${uri.fsPath}': ${e.message}`
      );
    }
  }

  private removeResults(uri: vscode.Uri): void {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return;
    }

    this.resultsByWorkspace.delete(workspaceFolder.uri.fsPath);
    this.refreshCoverageUi();
  }

  private refreshCoverageUi(): void {
    this.applyToEditors(vscode.window.visibleTextEditors);
    this.coverageChanged.fire();
  }

  private applyToEditors(editors: readonly vscode.TextEditor[]): void {
    for (const editor of editors) {
      this.applyToEditor(editor);
    }
    this.updateStatusBar();
  }

  private applyToEditor(editor: vscode.TextEditor): void {
    const coverage = this.coverageForDocument(editor.document);

    editor.setDecorations(
      this.coveredDecoration,
      this.decorationsForStatus(editor.document, coverage, COVERED_LINE)
    );
    editor.setDecorations(
      this.uncoveredDecoration,
      this.decorationsForStatus(editor.document, coverage, UNCOVERED_LINE)
    );
  }

  private decorationsForStatus(
    document: vscode.TextDocument,
    coverage: DocumentCoverage | undefined,
    status: typeof COVERED_LINE | typeof UNCOVERED_LINE
  ): vscode.DecorationOptions[] {
    if (!coverage) {
      return [];
    }

    return coverageLineNumbers(coverage.lineStatuses, status)
      .filter((lineNumber) => lineNumber < document.lineCount)
      .map((lineNumber) => {
        const attribution = coverageLineAttribution(
          coverage.results,
          coverage.filename,
          lineNumber
        );
        return {
          range: new vscode.Range(lineNumber, 0, lineNumber, 0),
          hoverMessage: new vscode.MarkdownString(
            coverageAttributionMarkdown(attribution)
          ),
        };
      });
  }

  private updateStatusBar(): void {
    if (!this.active) {
      void vscode.commands.executeCommand(
        'setContext',
        COVERAGE_VISIBLE_CONTEXT,
        false
      );
      this.statusBar.hide();
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const workspaceFolder = editor
      ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
      : undefined;
    const results = workspaceFolder
      ? this.resultsByWorkspace.get(workspaceFolder.uri.fsPath)
      : undefined;
    const lineStatuses = editor
      ? this.lineStatusesForDocument(editor.document)
      : undefined;

    void vscode.commands.executeCommand(
      'setContext',
      COVERAGE_VISIBLE_CONTEXT,
      lineStatuses !== undefined
    );

    if (!editor || !workspaceFolder || !results) {
      this.statusBar.hide();
      return;
    }

    if (lineStatuses) {
      const summary = coverageSummary(lineStatuses);
      this.statusBar.text = `Coverage ${summary.percentage.toFixed(1)}%`;
      this.statusBar.tooltip = `Please coverage: ${summary.covered} of ${summary.coverable} coverable lines. Click to clear.`;
      this.statusBar.show();
      return;
    }

    if (results.totalCoverage !== undefined) {
      this.statusBar.text = `Coverage ${results.totalCoverage.toFixed(
        1
      )}% overall`;
      this.statusBar.tooltip =
        'Overall Please coverage from the latest run. Click to clear.';
      this.statusBar.show();
      return;
    }

    this.statusBar.hide();
  }

  private coverageForDocument(
    document: vscode.TextDocument
  ): DocumentCoverage | undefined {
    if (!this.active) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const results = workspaceFolder
      ? this.resultsByWorkspace.get(workspaceFolder.uri.fsPath)
      : undefined;
    const filename = workspaceFolder
      ? coverageFilename(workspaceFolder.uri.fsPath, document.uri.fsPath)
      : undefined;
    const lineStatuses = filename ? results?.files[filename] : undefined;
    return filename && lineStatuses && results
      ? { filename, lineStatuses, results }
      : undefined;
  }

  private lineStatusesForDocument(
    document: vscode.TextDocument
  ): string | undefined {
    return this.coverageForDocument(document)?.lineStatuses;
  }
}

export function registerCoverageCommands(
  coverageDecorations: CoverageDecorations
): vscode.Disposable {
  return vscode.commands.registerCommand(CLEAR_COVERAGE_COMMAND, () =>
    coverageDecorations.clear()
  );
}
