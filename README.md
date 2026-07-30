# VSCode extension for Please

This is the VSCode extension for the Please build system.

See https://please.build or https://github.com/thought-machine/please for more information about Please itself.

## Coverage

Open a supported Go or Python file and use the `plz cover` CodeLens to run
Please coverage for the associated test targets. The extension highlights
covered and uncovered lines, shows a coverage summary in the status bar, and
provides a visible `[clear]` CodeLens while coverage is displayed.

For source files, the extension covers eligible tests in the same Please
package that directly depend on the source target. Use **Please: Cover Current
File with Target...** for a focused run when more than one is available.

See [Coverage](docs/coverage.md) for supported files, result semantics,
troubleshooting, and contributor information.

## Test Explorer

Open VS Code's Testing view to browse Go `_test.go` files, their applicable
Please test targets, and the individual Go tests within each target. Test
targets and functions are resolved lazily when a file is expanded.

The Test Explorer provides Run, Debug, and Coverage profiles. **Run Tests with
Coverage** executes the selected Please targets and publishes line coverage to
VS Code's native Test Coverage view.

Discovering individual Go tests requires a Go document-symbol provider,
normally the official Go extension with `gopls`; whole Please targets can still
be run when individual symbols are unavailable.

## Debugging

### Go language requirements

- Go
- [Delve](https://github.com/go-delve/delve)
- [Go Outline](https://github.com/ramya-rao-a/go-outline)

### Python language requirements

- Python 3
