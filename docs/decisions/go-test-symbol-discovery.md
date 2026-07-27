# Go test CodeLens symbol discovery and execution

- Status: Accepted
- Date: 2026-07-26

## Context

The extension needs the name and source range of each Go test function so it can
place `plz test` and `plz debug` CodeLenses above the correct declaration. It
must recognize both ordinary `TestXxx` functions and test-suite methods.

The previous implementation started the external `go-outline` executable and
converted its output into VS Code symbols. This had several costs:

- Users had to install and configure an additional executable.
- CodeLens discovery started a separate process for each symbol request.
- The extension maintained a copied `go-outline` compatibility layer.
- Missing `go-outline` prevented per-test CodeLenses from appearing.

## Decision

Request symbols through VS Code's
`vscode.executeDocumentSymbolProvider` command. For a normal Go development
setup, the VS Code Go extension serves this request using `gopls`.

The extension will:

- accept both hierarchical `DocumentSymbol` and flat `SymbolInformation`
  results;
- recursively inspect nested symbols;
- recognize both `Function` and `Method` symbol kinds;
- discover the test targets associated with the open file;
- place the discovered targets beside each test function;
- let the user select either `test` or `debug` before clicking a target;
- generate a `./TestName` selector for test-suite methods;
- force selected tests to run instead of reusing full-suite cached results; and
- retain file-level CodeLenses if no document-symbol provider is available.

The implementation lives in
[`codeLensProvider.ts`](../../src/languages/go/codeLensProvider.ts), with
symbol matching isolated in
[`testSymbols.ts`](../../src/languages/go/testSymbols.ts). Shared test-target
discovery and action selection live in
[`testFileCodeLensController.ts`](../../src/languages/testFileCodeLensController.ts).

## Rationale

`gopls` is the official, actively maintained Go language server and is already
the standard symbol provider for Go files in VS Code. Using the editor's
document-symbol API gives the extension a stable integration boundary instead
of coupling it to a separate parser executable.

For repeated CodeLens requests, this also avoids starting a new process and
reuses the running language server's parsed state and caches. The `gopls`
document-symbol operation requires only the current file's syntax tree, so it
does not require workspace-wide type checking.

This is an architectural performance improvement, not a claim that every
request is faster. A cold `gopls` startup is heavier than parsing one file with
`go-outline`, and no before-and-after latency benchmark was collected for this
extension. In normal VS Code Go sessions, however, `gopls` is already running
to provide completion, diagnostics, formatting, and navigation, so the
incremental cost of requesting document symbols is small.

### Please selector behavior

Please exposes trailing test arguments through the `TESTS` environment
variable used by its generated Go test runner. It also appends those arguments
to the target's `test_cmd`. For the standard Go test command, that can place a
suite selector after a `tee` pipeline.

Suite method selectors therefore use `./TestName` instead of `/TestName`. Both
forms use Go's slash-separated test matching to select the suite method, but
the relative form does not make `tee` attempt to write an absolute path.

Selected tests also include `--rerun`. Please does not include test selectors
in its test-result cache key, so without this flag a per-test action can return
cached results from an earlier full-suite run without executing the selected
test. File-level test actions do not include `--rerun`.

### Inline target discovery and execution

For a Go test file, the extension discovers targets by intersecting:

1. `plz query whatinputs <relative-test-file>`; and
2. `plz --plain_output query completions --cmd=test <package-label>`.

Both commands run asynchronously and in parallel while VS Code is generating
the CodeLenses. Results are cached by document URI and version. The
intersection prevents non-test input targets from appearing beside test
functions while still supporting rules that generate multiple test targets.

Each inline target CodeLens carries its full build label. Clicking it passes
that label directly to `plz.test.document` or `plz.debug.document`, so inline
actions do not resolve the target again. The relevant command handling is in
[`plzDocumentTestCommand.ts`](../../src/commands/plzDocumentTestCommand.ts) and
[`plzDebugDocumentCommand.ts`](../../src/commands/plzDebugDocumentCommand.ts).

If target discovery fails, the extension keeps the original `plz test` and
`plz debug` fallback CodeLenses. Those fallback actions resolve their target
when clicked.

## CodeLens click-latency investigation

- Investigation date: 2026-07-26
- Status: Cause confirmed; inline explicit-target optimization is implemented;
  file-level caching and asynchronous fallback are not yet implemented.

### Observed behavior

Users observed a one-to-two-second pause after clicking a test or build
CodeLens. There are two different paths:

- Inline test-target and BUILD-target CodeLenses already carry an explicit
  target label.
- File-level test, coverage, and debug CodeLenses do not carry a target. They
  call `retrieveInputFileTarget`, which calls `plz.inputTargets`.

`plz.inputTargets` runs `plz query whatinputs` through the synchronous
`spawnSync`-based command path in [`please.ts`](../../src/please.ts). This
blocks the Extension Host until Please exits. Terminal submission itself is
not the bottleneck.

### Instrumentation

Temporary timing probes were added around:

1. entry into `plzDocumentTestCommand`;
2. completion of target resolution;
3. entry into and return from `plzCommand`; and
4. completion of terminal command dispatch.

The probes were used only for the investigation and removed afterward.

An inline suite-method target produced:

```text
[performance] test document handler started
[performance] test target ready after 0ms (explicit)
[performance] test submitted to terminal in 0ms
[performance] test terminal command completed after 2ms
```

The file-level `plz test` CodeLens in the same file produced:

```text
[performance] test document handler started
[performance] test target ready after 2643ms (resolved)
[performance] test submitted to terminal in 0ms
[performance] test terminal command completed after 2644ms
```

This isolates 2,643 of the 2,644 milliseconds to target resolution. Once a
target was available, dispatch through the extension and integrated terminal
took approximately zero milliseconds.

### Repeated target-query measurements

Five consecutive runs of:

```sh
plz query whatinputs projects/axispos/backend/services/core/coredb/diagnostics/device_crash_reports_test.go
```

produced these wall-clock times:

| Run |   Time |
| --- | -----: |
| 1   | 2.58 s |
| 2   | 2.14 s |
| 3   | 2.03 s |
| 4   | 1.87 s |
| 5   | 1.87 s |

The median was 2.03 seconds and the range was 1.87–2.58 seconds. This agrees
with the 2,643 ms Extension Host trace.

### Please process-output measurements

Cached `plz test` and `plz build` commands were also spawned with piped output
to measure the time until the first output chunk and process exit:

| Command           | First output |     Exit |
| ----------------- | -----------: | -------: |
| `plz test` run 1  |     4,985 ms | 4,989 ms |
| `plz test` run 2  |     4,348 ms | 4,350 ms |
| `plz test` run 3  |     3,416 ms | 3,419 ms |
| `plz test` run 4  |     3,918 ms | 3,928 ms |
| `plz build` run 1 |     5,386 ms | 5,388 ms |
| `plz build` run 2 |     4,141 ms | 4,143 ms |
| `plz build` run 3 |     3,604 ms | 3,607 ms |
| `plz build` run 4 |     4,299 ms | 4,302 ms |

The test and build measurements ran concurrently and used pipes rather than a
TTY. Please may buffer non-TTY output, and the concurrent commands contend for
local resources. These numbers therefore demonstrate that Please startup,
graph loading, and cached-command work can be visible after terminal
submission; they are not a direct measurement of CodeLens dispatch latency.

### Recommended file-level fix

The next implementation should:

1. reuse the target list already discovered while generating test-file
   CodeLenses;
2. pass a single discovered target directly to file-level test, coverage, and
   debug commands;
3. populate a Quick Pick from the cached list when multiple targets exist; and
4. replace synchronous `plz.inputTargets` with `runCommandAsync` as the
   uncached fallback.

This removes the repeated query from the common click path and prevents an
uncached lookup from blocking the Extension Host. BUILD-file target CodeLenses
and inline test-target CodeLenses already satisfy the explicit-target part of
this design.

## Tradeoffs

- A Go document-symbol provider must be installed and enabled for per-test
  CodeLenses. File-level actions remain available without one.
- `gopls` officially targets Go's native module tooling. Alternative build
  systems such as Please may limit package-aware features, but local
  document-symbol extraction only parses the open file.
- The extension now relies on the symbol shapes defined by VS Code and LSP
  instead of the `go-outline` JSON format.
- Target discovery still starts Please query processes while CodeLenses are
  generated. The work is asynchronous and cached, but it consumes Please
  process and graph-loading time.
- Until the recommended file-level fix is implemented, fallback and file-level
  actions retain the synchronous target-resolution delay.

## Alternatives considered

### Keep `go-outline`

Rejected because it retains the extra installation requirement, subprocess
startup, and legacy compatibility code.

### Match functions with regular expressions

Rejected because regular expressions cannot reliably parse Go declarations,
receivers, comments, malformed source, or future syntax.

### Bundle another Go parser

Rejected because it would duplicate functionality already supplied by the Go
toolchain and create another parser lifecycle for this extension to maintain.

## Verification

- `npm test` covers ordinary functions, suite methods, nested symbols, flat
  symbols, invalid names, invalid symbol kinds, and selected-test command
  construction.
- A live Extension Development Host check confirmed `plz test` and `plz debug`
  above a suite test method without `go-outline` installed.
- A selected suite method produced only the suite parent and requested method,
  with two passing test results and no `tee` error.
- Live timing probes confirmed that an explicit inline target reached terminal
  dispatch in 2 ms, while file-level target resolution consumed 2,643 ms.
- After removing the temporary probes, `npm test` passed all target-discovery,
  action-layout, terminal-command, selector, coverage, BUILD Outline, and Go
  symbol tests.

## References

- [Gopls documentation](https://go.dev/gopls/)
- [Gopls document symbols](https://go.dev/gopls/features/navigation)
- [Gopls design](https://go.dev/gopls/design/design)
- [Scaling gopls for the growing Go ecosystem](https://go.dev/blog/gopls-scalability)
