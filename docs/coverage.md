# Coverage

The extension runs Please coverage commands and displays the resulting line
coverage inside VS Code. Please remains responsible for compiling and running
tests, collecting language-specific coverage, and writing the coverage report.

## Requirements

- The open workspace contains a `.plzconfig` file.
- `plz` is available to the extension.
- The file belongs to a Please target with at least one coverable test target.
- VS Code CodeLens support is enabled.

Targets marked `no_test_coverage` are not selected for coverage.

## Running coverage

### Test Explorer coverage

Open VS Code's Testing view and select **Run Tests with Coverage** for the
workspace or a Please target. The extension runs `plz cover` and publishes the
resulting line coverage to VS Code's native Test Coverage view.

Native coverage supports:

- File and folder coverage percentages in the Test Coverage view.
- Covered and uncovered line indicators in editors.
- Running coverage for selected Please targets.
- Merging results when a selection requires multiple Please invocations.

Please reports whether a coverable line was covered, but not how many times it
executed. Native coverage therefore displays binary execution information for
each line.

Native coverage is target-scoped. Please currently appends focused Go test
arguments to the coverage post-processing command as well as the test binary,
which causes `go tool covdata` to reject the extra argument. Individual Go
functions therefore retain Run and Debug actions but do not offer the native
Coverage action.

### CodeLens coverage

Use the `plz cover` CodeLens at the top of a supported file. The primary action
runs every eligible target resolved through the fast, package-scoped path and
does not interrupt the workflow with a target picker.

For a Go source file, the extension:

1. Finds the Please targets containing the source file.
2. Inspects targets in the same package.
3. Finds test targets that depend directly on those source targets.
4. Removes non-test and `no_test_coverage` targets.
5. Runs `plz cover` with all remaining same-package targets.

Limiting automatic discovery to the current package keeps the CodeLens
responsive and prevents an ordinary coverage run from expanding into unrelated
workspace builds.

For a test file, the extension:

1. Finds targets that directly contain the file.
2. Removes non-test and `no_test_coverage` targets.
3. Runs every remaining target.

### Focused coverage

Run **Please: Cover Current File with Target...** from the Command Palette or
the editor context menu. For a Go source file, this explicit action searches
direct reverse dependencies across the workspace asynchronously, filters them
in bounded metadata batches, and runs only the selected test target. This
broader path includes eligible tests in other packages without making the
primary CodeLens scan the entire workspace.

If only one target is eligible, the command runs it without showing a picker.
For test files, the command selects among the coverable targets that directly
contain the file.

## Supported files

| Language | File                            | Primary CodeLens coverage              |
| -------- | ------------------------------- | -------------------------------------- |
| Go       | Source `.go` file               | Same-package, directly dependent tests |
| Go       | `_test.go` file                 | Test targets containing the file       |
| Python   | `test_*.py` or `*_test.py` file | Test targets containing the file       |

## Coverage results

Please writes the report to:

```text
plz-out/log/coverage.json
```

The extension loads an existing report when it starts and watches the file for
subsequent changes.

A shortened report looks like:

```json
{
  "tests": {
    "//pkg/calculator:calculator_test": {
      "pkg/calculator/calculator.go": "NNNNNNCCCNUUUNCCCCN"
    },
    "//pkg/calculator:calculator_test_alt": {
      "pkg/calculator/calculator.go": "NNNNNNUUUNCCCNUUUUN"
    }
  },
  "files": {
    "pkg/calculator/calculator.go": "NNNNNNCCCNCCCNCCCCN"
  },
  "stats": {
    "total_coverage": 73.68421,
    "coverage_by_file": {
      "pkg/calculator/calculator.go": 73.68421
    }
  }
}
```

Each character in a file status string corresponds to a zero-based source
line:

| Status | Meaning            |
| ------ | ------------------ |
| `C`    | Covered line       |
| `U`    | Uncovered line     |
| `N`    | Non-coverable line |

The `tests` object contains per-target results. The `files` object contains the
aggregated result used for editor annotations. The extension parses both so
that line coverage can be attributed to deterministic target labels in the
editor.

## Editor presentation

Coverage started from Test Explorer uses VS Code's native coverage
presentation. Coverage started from a CodeLens or the focused-target command
continues to use the extension's custom presentation:

- Covered lines receive a green background and overview-ruler marker.
- Uncovered lines receive a red background and overview-ruler marker.
- Hovering a highlighted line lists the Please targets that covered it and
  those that reported it as uncovered.
- The status bar shows coverage for the active file, or overall coverage when
  only a workspace summary is available.
- A `[clear]` CodeLens appears while the active document has coverage.

## Clearing coverage

Clear annotations by:

- Clicking `[clear]`.
- Clicking the coverage status-bar item.
- Selecting **Please: Clear Coverage** from the Command Palette.
- Selecting **Clear Coverage** from the editor context menu.

Clearing coverage removes the report from the extension's in-memory view. It
does not delete `plz-out/log/coverage.json`. A later coverage run reloads the
report, and restarting the extension reloads an existing report.

Native Test Explorer coverage is controlled by VS Code. Use the coverage
toolbar or Testing view actions to hide or replace its visuals.

## Current limitations

- Coverage is line-based. The extension does not currently report AST-node,
  branch, condition, path, or mutation coverage.
- Please's line-status report does not include execution counts, so native
  coverage records covered lines as executed without an exact count.
- Compound boolean expressions cannot be evaluated for missing truth-table
  combinations from line coverage alone.
- Target attribution is shown for individual highlighted lines, but there is no
  function-level or workspace-level attribution view yet.
- Coverage depends on the files and statuses produced by Please and the
  language-specific coverage implementation.
- Only directly associated test targets are selected automatically.

## Troubleshooting

### The coverage CodeLens is missing

- Confirm the workspace contains `.plzconfig`.
- Confirm `editor.codeLens` is enabled.
- Confirm the file matches one of the supported file patterns.
- For per-function Go test and debug CodeLenses, confirm Go Outline is
  installed. File-level test, debug, and coverage actions remain available
  without function discovery.

### No coverage target is found

- Run `plz query whatinputs path/to/file` to confirm the file belongs to a
  target.
- For a source file, confirm a test target depends directly on its source
  target.
- Confirm the test rule supports coverage and is not marked
  `no_test_coverage`.
- Review the **Please** output channel for the reported query or command error.

### Coverage runs but annotations do not appear

- Confirm `plz-out/log/coverage.json` exists under the open workspace.
- Confirm the report's `files` keys are paths relative to the workspace root.
- Confirm the active file appears in the report's `files` object.
- Review the **Please** output channel for JSON parsing or file-loading errors.

## Contributor guide

Coverage is divided into focused modules:

| Module                                    | Responsibility                                         |
| ----------------------------------------- | ------------------------------------------------------ |
| `src/coverage/coverageAttribution.ts`     | Map source lines to deterministic per-target evidence  |
| `src/coverage/coverageResults.ts`         | Parse reports and calculate line/file summaries        |
| `src/coverage/coverageTargetSelection.ts` | Filter coverable Please test targets                   |
| `src/coverage/coverageTargets.ts`         | Resolve source and test files to coverage targets      |
| `src/coverage/coverageInvocation.ts`      | Construct coverage command arguments                   |
| `src/coverage/coverageDecorations.ts`     | Load reports and manage editor/status-bar presentation |
| `src/commands/plzCoverDocumentCommand.ts` | Execute package-scoped and focused coverage commands   |
| `src/pleaseProcess.ts`                    | Run asynchronous, cancellable Please processes         |

Run the focused coverage tests with:

```bash
npm test
```

The test command compiles the extension before running coverage parsing,
attribution, selection, and invocation tests.
