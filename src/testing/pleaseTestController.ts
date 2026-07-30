import { promises as fs } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { coverageCommandArgs } from '../coverage/coverageInvocation';
import {
  COVERED_LINE,
  coverageFilename,
  CoverageResults,
  coverageSummary,
  mergeCoverageResults,
  parseCoverageResults,
  UNCOVERED_LINE,
} from '../coverage/coverageResults';
import { CoverageDecorations } from '../coverage/coverageDecorations';
import { languageTargetDebuggers } from '../languages/debug';
import * as plz from '../please';
import {
  discoverPleaseTestTargets,
  findGoTestSymbols,
  packageFragmentForTestFile,
  pleaseTestFailureMatchesFunction,
  pleaseTestArguments,
  PleaseTestFailureLocation,
  PleaseTestFailureSummary,
  pleaseTestResultSummary,
  summarizePleaseTestFailures,
} from './pleaseTestModel';
import { executePlease, queryPlease } from './pleaseTestProcess';

const DOCUMENT_SYMBOL_COMMAND = 'vscode.executeDocumentSymbolProvider';
const COVERAGE_RESULTS_PATH = path.join('plz-out', 'log', 'coverage.json');
const COVERAGE_TARGET_TAG = new vscode.TestTag('please-target-coverage');
const GO_TEST_FILE_PATTERN = '**/*_test.go';
const TEST_FILE_EXCLUDE_PATTERN = '**/{node_modules,out,plz-out}/**';
const TEST_FILE_EXCLUDED_SEGMENTS = new Set(['node_modules', 'out', 'plz-out']);

type TestItemData =
  | {
      readonly kind: 'file';
      readonly uri: vscode.Uri;
      readonly workspaceFolder: vscode.WorkspaceFolder;
    }
  | {
      readonly kind: 'target';
      readonly target: string;
      readonly workspaceFolder: vscode.WorkspaceFolder;
    }
  | {
      readonly functionName: string;
      readonly kind: 'test';
      readonly target: string;
      readonly workspaceFolder: vscode.WorkspaceFolder;
    };

type PleaseTestOperation = 'cover' | 'test';

export class PleaseTestController implements vscode.Disposable {
  private readonly controller = vscode.tests.createTestController(
    'please-tests',
    'Please Tests'
  );
  private readonly itemData = new Map<string, TestItemData>();
  private readonly fileItems = new Map<string, vscode.TestItem>();
  private readonly coverageDetails = new WeakMap<
    vscode.FileCoverage,
    vscode.FileCoverageDetail[]
  >();
  private readonly disposables: vscode.Disposable[];

  constructor(private readonly coverageDecorations: CoverageDecorations) {
    this.controller.resolveHandler = (item) =>
      item ? this.resolveItem(item) : this.discoverWorkspaceFiles();

    const runProfile = this.controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runTests(request, token),
      true
    );
    const debugProfile = this.controller.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => this.debugTest(request, token),
      true
    );
    const coverageProfile = this.controller.createRunProfile(
      'Coverage',
      vscode.TestRunProfileKind.Coverage,
      (request, token) => this.coverTests(request, token),
      true
    );
    coverageProfile.tag = COVERAGE_TARGET_TAG;
    coverageProfile.loadDetailedCoverage = async (_run, fileCoverage, token) =>
      token.isCancellationRequested
        ? []
        : this.coverageDetails.get(fileCoverage) ?? [];
    const watcher =
      vscode.workspace.createFileSystemWatcher(GO_TEST_FILE_PATTERN);

    this.disposables = [
      runProfile,
      debugProfile,
      coverageProfile,
      watcher,
      watcher.onDidCreate((uri) => {
        if (isTrackableTestUri(uri)) {
          this.ensureFileItem(uri);
        }
      }),
      watcher.onDidChange((uri) => {
        if (isTrackableTestUri(uri)) {
          this.invalidateFile(uri);
        } else {
          this.removeFile(uri);
        }
      }),
      watcher.onDidDelete((uri) => this.removeFile(uri)),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (isGoTestDocument(document)) {
          void this.resolveFile(this.ensureFileItem(document.uri));
        }
      }),
    ];

    for (const document of vscode.workspace.textDocuments) {
      if (isGoTestDocument(document)) {
        void this.resolveFile(this.ensureFileItem(document.uri));
      }
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.itemData.clear();
    this.fileItems.clear();
    this.controller.dispose();
  }

  private async discoverWorkspaceFiles(): Promise<void> {
    const uris = await vscode.workspace.findFiles(
      GO_TEST_FILE_PATTERN,
      TEST_FILE_EXCLUDE_PATTERN
    );
    for (const uri of uris) {
      this.ensureFileItem(uri);
    }
  }

  private ensureFileItem(uri: vscode.Uri): vscode.TestItem {
    const key = uri.toString();
    const existing = this.fileItems.get(key);
    if (existing) {
      return existing;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      throw new Error(`Test file is not inside a workspace folder: ${uri}`);
    }

    const relativeFileName = relativeFilePath(workspaceFolder, uri);
    const item = this.controller.createTestItem(
      `file:${key}`,
      relativeFileName,
      uri
    );
    item.canResolveChildren = true;
    item.tags = [COVERAGE_TARGET_TAG];
    if ((vscode.workspace.workspaceFolders?.length ?? 0) > 1) {
      item.description = workspaceFolder.name;
    }

    this.itemData.set(item.id, {
      kind: 'file',
      uri,
      workspaceFolder,
    });
    this.fileItems.set(key, item);
    this.controller.items.add(item);
    return item;
  }

  private async resolveItem(item: vscode.TestItem): Promise<void> {
    const data = this.itemData.get(item.id);
    if (data?.kind === 'file') {
      await this.resolveFile(item);
    }
  }

  private async resolveFile(fileItem: vscode.TestItem): Promise<void> {
    const data = this.itemData.get(fileItem.id);
    if (data?.kind !== 'file' || !fileItem.canResolveChildren) {
      return;
    }

    fileItem.canResolveChildren = false;
    fileItem.error = undefined;
    this.forgetChildren(fileItem);

    try {
      await vscode.workspace.openTextDocument(data.uri);
      const relativeFileName = relativeFilePath(data.workspaceFolder, data.uri);
      const packageFragment = packageFragmentForTestFile(relativeFileName);
      const symbolsPromise = vscode.commands
        .executeCommand<
          (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined
        >(DOCUMENT_SYMBOL_COMMAND, data.uri)
        .then(
          (symbols) => symbols ?? [],
          () => []
        );
      const cancellation = new vscode.CancellationTokenSource();
      let discovery: [
        string,
        string,
        (vscode.DocumentSymbol | vscode.SymbolInformation)[]
      ];
      try {
        discovery = await Promise.all([
          queryPlease(
            ['query', 'whatinputs', '--ignore_unknown', relativeFileName],
            data.workspaceFolder.uri.fsPath,
            cancellation.token
          ),
          queryPlease(
            ['query', 'completions', '--cmd=test', packageFragment],
            data.workspaceFolder.uri.fsPath,
            cancellation.token
          ),
          symbolsPromise,
        ]);
      } finally {
        cancellation.dispose();
      }
      const [inputTargetsOutput, completionsOutput, symbols] = discovery;

      const targets = discoverPleaseTestTargets(
        inputTargetsOutput,
        completionsOutput,
        packageFragment
      );
      const tests = findGoTestSymbols<vscode.Range>(
        symbols,
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Method
      );

      for (const target of targets) {
        const targetItem = this.controller.createTestItem(
          `${fileItem.id}:target:${target.label}`,
          target.label,
          data.uri
        );
        this.itemData.set(targetItem.id, {
          kind: 'target',
          target: target.label,
          workspaceFolder: data.workspaceFolder,
        });
        targetItem.tags = [COVERAGE_TARGET_TAG];

        for (const test of tests) {
          const testItem = this.controller.createTestItem(
            `${targetItem.id}:test:${test.functionName}`,
            displayTestName(test.functionName),
            data.uri
          );
          testItem.range = test.range;
          this.itemData.set(testItem.id, {
            functionName: test.functionName,
            kind: 'test',
            target: target.label,
            workspaceFolder: data.workspaceFolder,
          });
          targetItem.children.add(testItem);
        }

        fileItem.children.add(targetItem);
      }

      if (targets.length === 0) {
        fileItem.error = 'No Please test targets contain this file.';
      } else if (tests.length === 0) {
        fileItem.error =
          'No Go tests were returned by the active document symbol provider.';
        fileItem.canResolveChildren = true;
      }
    } catch (error) {
      fileItem.error = errorMessage(error);
      fileItem.canResolveChildren = true;
    }
  }

  private async runTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    const run = this.controller.createTestRun(request);

    try {
      const items = await this.runnableItems(request);
      for (const item of items) {
        for (const resultItem of this.resultItems(item)) {
          run.enqueued(resultItem);
        }
      }

      for (const item of items) {
        if (token.isCancellationRequested) {
          run.skipped(item);
          continue;
        }
        await this.runTestItem(run, item, token);
      }
    } finally {
      run.end();
    }
  }

  private async runTestItem(
    run: vscode.TestRun,
    item: vscode.TestItem,
    token: vscode.CancellationToken
  ): Promise<CoverageResults | undefined> {
    return this.runPleaseTestOperation(run, item, token, 'test');
  }

  private async runPleaseTestOperation(
    run: vscode.TestRun,
    item: vscode.TestItem,
    token: vscode.CancellationToken,
    operation: PleaseTestOperation
  ): Promise<CoverageResults | undefined> {
    const data = this.itemData.get(item.id);
    if (data?.kind !== 'target' && data?.kind !== 'test') {
      return undefined;
    }

    const functionName = data.kind === 'test' ? data.functionName : undefined;
    const testArguments =
      operation === 'cover'
        ? coverageCommandArgs([data.target])
        : pleaseTestArguments(data.target, functionName);
    const displayedCommand = `plz ${operation} ${testArguments.join(' ')}`;
    const startedAt = Date.now();
    let fullOutput = '';
    const resultItems = this.resultItems(item);
    for (const resultItem of resultItems) {
      run.started(resultItem);
    }
    run.appendOutput(
      toTerminalOutput(
        `Running ${displayedCommand}\nFull log: View > Output > Please\n`
      )
    );
    plz.outputChannel.appendLine('');
    plz.outputChannel.appendLine(
      `=== Please ${operation === 'cover' ? 'Coverage' : 'Test'}: ${
        item.label
      } ===`
    );
    plz.outputChannel.appendLine(`> ${displayedCommand}`);

    try {
      const result = await executePlease(
        ['--verbosity=info', operation, ...testArguments],
        data.workspaceFolder.uri.fsPath,
        token,
        (output) => {
          fullOutput += output;
          plz.outputChannel.append(output);
        }
      );
      const duration = Date.now() - startedAt;
      let coverage: CoverageResults | undefined;
      let coverageError: string | undefined;
      if (operation === 'cover' && !result.cancelled) {
        try {
          coverage =
            result.exitCode === 0
              ? await coverageResultsAfterRun(data.workspaceFolder.uri.fsPath)
              : undefined;
        } catch (error) {
          coverageError = errorMessage(error);
          run.appendOutput(
            toTerminalOutput(`Coverage report error: ${coverageError}\n`)
          );
          plz.outputChannel.appendLine(
            `=== Coverage report error: ${coverageError} ===`
          );
        }
      }

      if (result.cancelled) {
        plz.outputChannel.appendLine(
          `=== Cancelled after ${formatDuration(duration)} ===`
        );
        run.appendOutput(
          toTerminalOutput(`Cancelled after ${formatDuration(duration)}\n`)
        );
        for (const resultItem of resultItems) {
          run.skipped(resultItem);
        }
      } else if (result.exitCode === 0) {
        if (coverageError) {
          for (const resultItem of resultItems) {
            run.errored(
              resultItem,
              new vscode.TestMessage(
                `Please completed but native coverage could not be loaded: ${coverageError}`
              )
            );
          }
        } else {
          plz.outputChannel.appendLine(
            `=== Passed in ${formatDuration(duration)} ===`
          );
          run.appendOutput(
            toTerminalOutput(`Passed in ${formatDuration(duration)}\n`)
          );
          for (const resultItem of resultItems) {
            run.passed(
              resultItem,
              resultItems.length === 1 ? duration : undefined
            );
          }
        }
      } else {
        const summaries = summarizePleaseTestFailures(fullOutput);
        plz.outputChannel.appendLine(
          `=== Failed in ${formatDuration(duration)} ===`
        );
        run.appendOutput(
          toTerminalOutput(
            `${failureOutputLines(
              summaries,
              pleaseTestResultSummary(fullOutput)
            ).join('\n')}\n`
          )
        );
        this.reportFailures(run, item, data, resultItems, summaries, duration);
      }
      return coverage;
    } catch (error) {
      const message = errorMessage(error);
      plz.outputChannel.appendLine(`=== Error: ${message} ===`);
      run.appendOutput(toTerminalOutput(`Test runner error: ${message}\n`));
      for (const resultItem of resultItems) {
        run.errored(resultItem, new vscode.TestMessage(message));
      }
      return undefined;
    }
  }

  private async coverTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    this.coverageDecorations.deactivate();
    const run = this.controller.createTestRun(request, 'Coverage');
    const reportsByWorkspace = new Map<
      string,
      {
        readonly reports: CoverageResults[];
        readonly workspaceFolder: vscode.WorkspaceFolder;
      }
    >();

    try {
      const items = await this.runnableItems(request);
      for (const item of items) {
        for (const resultItem of this.resultItems(item)) {
          run.enqueued(resultItem);
        }
      }

      for (const item of items) {
        if (token.isCancellationRequested) {
          for (const resultItem of this.resultItems(item)) {
            run.skipped(resultItem);
          }
          continue;
        }

        const data = this.itemData.get(item.id);
        if (data?.kind !== 'target') {
          if (data?.kind === 'test') {
            run.errored(
              item,
              new vscode.TestMessage(
                'Please coverage currently runs at target scope. Select the parent Please target to run coverage.'
              )
            );
          }
          continue;
        }
        const coverage = await this.runPleaseTestOperation(
          run,
          item,
          token,
          'cover'
        );
        if (!coverage) {
          continue;
        }

        const workspaceKey = data.workspaceFolder.uri.toString();
        const workspaceReports = reportsByWorkspace.get(workspaceKey);
        if (workspaceReports) {
          workspaceReports.reports.push(coverage);
        } else {
          reportsByWorkspace.set(workspaceKey, {
            reports: [coverage],
            workspaceFolder: data.workspaceFolder,
          });
        }
      }

      for (const { reports, workspaceFolder } of reportsByWorkspace.values()) {
        this.addNativeCoverage(
          run,
          workspaceFolder,
          mergeCoverageResults(reports)
        );
      }
    } finally {
      run.end();
    }
  }

  private addNativeCoverage(
    run: vscode.TestRun,
    workspaceFolder: vscode.WorkspaceFolder,
    results: CoverageResults
  ): void {
    const workspaceRoot = workspaceFolder.uri.fsPath;
    let fileCount = 0;
    let covered = 0;
    let coverable = 0;

    for (const relativeFilename of Object.keys(results.files).sort()) {
      const absoluteFilename = path.resolve(workspaceRoot, relativeFilename);
      if (
        coverageFilename(workspaceRoot, absoluteFilename) !==
        relativeFilename.split(path.sep).join('/')
      ) {
        plz.outputChannel.appendLine(
          `Skipping coverage file outside the workspace: ${relativeFilename}`
        );
        continue;
      }

      const lineStatuses = results.files[relativeFilename];
      const summary = coverageSummary(lineStatuses);
      if (summary.coverable === 0) {
        continue;
      }

      const fileCoverage = new vscode.FileCoverage(
        vscode.Uri.file(absoluteFilename),
        new vscode.TestCoverageCount(summary.covered, summary.coverable)
      );
      this.coverageDetails.set(
        fileCoverage,
        nativeLineCoverageDetails(lineStatuses)
      );
      run.addCoverage(fileCoverage);
      fileCount++;
      covered += summary.covered;
      coverable += summary.coverable;
    }

    run.appendOutput(
      toTerminalOutput(
        `Native coverage: ${covered} of ${coverable} coverable lines across ${fileCount} files.\n`
      )
    );
  }

  private reportFailures(
    run: vscode.TestRun,
    item: vscode.TestItem,
    data: Extract<TestItemData, { kind: 'target' | 'test' }>,
    resultItems: readonly vscode.TestItem[],
    summaries: readonly PleaseTestFailureSummary[],
    duration: number
  ): void {
    if (data.kind === 'target' && resultItems[0] !== item) {
      const attributed = resultItems.map((resultItem) => {
        const resultData = this.itemData.get(resultItem.id);
        return {
          failures:
            resultData?.kind === 'test'
              ? summaries.filter((summary) =>
                  pleaseTestFailureMatchesFunction(
                    summary,
                    resultData.functionName
                  )
                )
              : [],
          item: resultItem,
        };
      });

      if (attributed.some((result) => result.failures.length > 0)) {
        for (const result of attributed) {
          if (result.failures.length > 0) {
            run.failed(
              result.item,
              result.failures.map((summary) =>
                failureMessage(
                  summary,
                  data.target,
                  data.workspaceFolder,
                  result.item
                )
              )
            );
          } else {
            run.passed(result.item);
          }
        }
        return;
      }

      for (const resultItem of resultItems) {
        run.skipped(resultItem);
      }
      run.enqueued(item);
      run.started(item);
    }

    run.failed(
      item,
      summaries.map((summary) =>
        failureMessage(summary, data.target, data.workspaceFolder, item)
      ),
      duration
    );
  }

  private resultItems(item: vscode.TestItem): vscode.TestItem[] {
    const data = this.itemData.get(item.id);
    if (data?.kind !== 'target') {
      return [item];
    }

    const children = collectionItems(item.children);
    return children.length > 0 ? children : [item];
  }

  private async debugTest(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    const run = this.controller.createTestRun(request, 'Debug');
    let activeItem: vscode.TestItem | undefined;

    try {
      const items = await this.runnableItems(request);
      for (const item of items) {
        run.enqueued(item);
      }

      activeItem = items[0];
      if (!activeItem || token.isCancellationRequested) {
        return;
      }

      run.started(activeItem);
      for (const remaining of items.slice(1)) {
        run.skipped(remaining);
      }
      if (items.length > 1) {
        run.appendOutput(
          toTerminalOutput(
            'Please debugging supports one selection at a time; only the first selected test was started.\n'
          )
        );
      }

      const data = this.itemData.get(activeItem.id);
      if (data?.kind !== 'target' && data?.kind !== 'test') {
        return;
      }

      const debug = languageTargetDebuggers.go;
      if (!debug) {
        run.errored(
          activeItem,
          new vscode.TestMessage('Go debugging is unavailable.')
        );
        return;
      }

      const started = await debug(
        data.target,
        data.kind === 'test' ? [data.functionName] : []
      );
      if (!started) {
        run.errored(
          activeItem,
          new vscode.TestMessage('VS Code could not start the Please debugger.')
        );
      }
    } catch (error) {
      if (activeItem) {
        run.errored(activeItem, new vscode.TestMessage(errorMessage(error)));
      } else {
        run.appendOutput(toTerminalOutput(`${errorMessage(error)}\n`));
      }
    } finally {
      run.end();
    }
  }

  private async runnableItems(
    request: vscode.TestRunRequest
  ): Promise<vscode.TestItem[]> {
    if (!request.include) {
      await this.discoverWorkspaceFiles();
    }

    const included = request.include ?? collectionItems(this.controller.items);
    const excluded = new Set((request.exclude ?? []).map((item) => item.id));
    const runnable = new Map<string, vscode.TestItem>();

    for (const item of included) {
      await this.collectRunnableItems(item, excluded, runnable);
    }
    return [...runnable.values()];
  }

  private async collectRunnableItems(
    item: vscode.TestItem,
    excluded: Set<string>,
    runnable: Map<string, vscode.TestItem>
  ): Promise<void> {
    if (isItemExcluded(item, excluded)) {
      return;
    }

    const data = this.itemData.get(item.id);
    if (data?.kind === 'file') {
      await this.resolveFile(item);
      for (const child of collectionItems(item.children)) {
        await this.collectRunnableItems(child, excluded, runnable);
      }
      return;
    }

    if (data?.kind === 'target') {
      const children = collectionItems(item.children);
      const hasExcludedChild = children.some((child) =>
        isItemExcluded(child, excluded)
      );
      if (hasExcludedChild) {
        for (const child of children) {
          await this.collectRunnableItems(child, excluded, runnable);
        }
      } else {
        runnable.set(item.id, item);
      }
      return;
    }

    if (data?.kind === 'test') {
      runnable.set(item.id, item);
    }
  }

  private invalidateFile(uri: vscode.Uri): void {
    const item = this.fileItems.get(uri.toString());
    if (!item) {
      return;
    }
    this.forgetChildren(item);
    item.error = undefined;
    item.canResolveChildren = true;
    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === uri.toString()
    );
    if (document) {
      void this.resolveFile(item);
    }
  }

  private removeFile(uri: vscode.Uri): void {
    const key = uri.toString();
    const item = this.fileItems.get(key);
    if (!item) {
      return;
    }
    this.forgetItem(item);
    this.fileItems.delete(key);
    this.controller.items.delete(item.id);
  }

  private forgetChildren(item: vscode.TestItem): void {
    for (const child of collectionItems(item.children)) {
      this.forgetItem(child);
    }
    item.children.replace([]);
  }

  private forgetItem(item: vscode.TestItem): void {
    this.forgetChildren(item);
    this.itemData.delete(item.id);
  }
}

function collectionItems(
  collection: vscode.TestItemCollection
): vscode.TestItem[] {
  const items: vscode.TestItem[] = [];
  collection.forEach((item) => items.push(item));
  return items;
}

function displayTestName(functionName: string): string {
  return functionName.startsWith('./')
    ? functionName.substring('./'.length)
    : functionName;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGoTestDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'go' &&
    document.fileName.endsWith('_test.go') &&
    isTrackableTestUri(document.uri)
  );
}

function isTrackableTestUri(uri: vscode.Uri): boolean {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return false;
  }

  return !relativeFilePath(workspaceFolder, uri)
    .split('/')
    .some((segment) => TEST_FILE_EXCLUDED_SEGMENTS.has(segment));
}

function isItemExcluded(item: vscode.TestItem, excluded: Set<string>): boolean {
  let current: vscode.TestItem | undefined = item;
  while (current) {
    if (excluded.has(current.id)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function relativeFilePath(
  workspaceFolder: vscode.WorkspaceFolder,
  uri: vscode.Uri
): string {
  return path
    .relative(workspaceFolder.uri.fsPath, uri.fsPath)
    .split(path.sep)
    .join('/');
}

function toTerminalOutput(output: string): string {
  return output.replace(/\r?\n/g, '\r\n');
}

function formatDuration(duration: number): string {
  return `${(duration / 1000).toFixed(1)}s`;
}

async function readCoverageReport(
  workspaceRoot: string
): Promise<string | undefined> {
  const filename = path.join(workspaceRoot, COVERAGE_RESULTS_PATH);
  try {
    return await fs.readFile(filename, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function coverageResultsAfterRun(
  workspaceRoot: string
): Promise<CoverageResults> {
  const contents = await readCoverageReport(workspaceRoot);
  if (!contents) {
    throw new Error(
      `Please did not write ${COVERAGE_RESULTS_PATH} in ${workspaceRoot}.`
    );
  }
  return parseCoverageResults(contents);
}

function nativeLineCoverageDetails(
  lineStatuses: string
): vscode.StatementCoverage[] {
  const details: vscode.StatementCoverage[] = [];
  for (let lineNumber = 0; lineNumber < lineStatuses.length; lineNumber++) {
    const status = lineStatuses[lineNumber];
    if (status === COVERED_LINE || status === UNCOVERED_LINE) {
      details.push(
        new vscode.StatementCoverage(
          status === COVERED_LINE,
          new vscode.Position(lineNumber, 0)
        )
      );
    }
  }
  return details;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function failureOutputLines(
  summaries: readonly PleaseTestFailureSummary[],
  resultSummary: string | undefined
): string[] {
  const lines: string[] = [];
  summaries.forEach((summary, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(...failureSummaryLines(summary));
  });
  if (resultSummary) {
    lines.push('', `Result: ${resultSummary}`);
  }
  return lines;
}

function failureSummaryLines(summary: PleaseTestFailureSummary): string[] {
  return [
    summary.headline,
    ...(summary.location
      ? [
          `Location: ${summary.location.relativeFileName}:${summary.location.line}`,
        ]
      : []),
    ...summary.details,
  ];
}

function failureMessage(
  summary: PleaseTestFailureSummary,
  target: string,
  workspaceFolder: vscode.WorkspaceFolder,
  item: vscode.TestItem
): vscode.TestMessage {
  const messageText = [
    ...failureSummaryLines(summary),
    `Target: ${target}`,
    'Full log: View > Output > Please',
  ].join('\n');
  const message =
    summary.expected !== undefined && summary.actual !== undefined
      ? vscode.TestMessage.diff(messageText, summary.expected, summary.actual)
      : new vscode.TestMessage(messageText);
  const location = testFailureLocation(summary.location, workspaceFolder, item);
  if (location) {
    message.location = location;
  }
  return message;
}

function testFailureLocation(
  location: PleaseTestFailureLocation | undefined,
  workspaceFolder: vscode.WorkspaceFolder,
  item: vscode.TestItem
): vscode.Location | undefined {
  if (!location) {
    return item.uri && item.range
      ? new vscode.Location(item.uri, item.range)
      : undefined;
  }

  let filename = location.relativeFileName;
  if (!path.isAbsolute(filename)) {
    const base =
      filename.includes('/') || !item.uri
        ? workspaceFolder.uri.fsPath
        : path.dirname(item.uri.fsPath);
    filename = path.join(base, filename);
  }

  return new vscode.Location(
    vscode.Uri.file(filename),
    new vscode.Position(
      Math.max(0, location.line - 1),
      Math.max(0, (location.column ?? 1) - 1)
    )
  );
}
